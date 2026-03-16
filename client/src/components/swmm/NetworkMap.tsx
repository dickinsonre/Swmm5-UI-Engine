import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import type { SwmmProject, SelectedObject, SimulationResults } from '@/lib/swmm-types';
import type { SwmmPreferences } from '@/pages/swmm-ui';

const COLORS = {
  mapBg: '#ffffff',
  grid: 'rgba(0,0,0,0.06)',
  subcatchFill: 'rgba(44,110,181,0.15)',
  subcatchStroke: 'rgba(44,110,181,0.4)',
  subcatchSelected: '#2c6eb5',
  nodeDefault: '#7092BE',
  linkDefault: '#5a7a9a',
  text: 'rgba(0,0,0,0.65)',
  textSelected: '#000000',
  legend: ['#7092BE', '#99D9EA', '#B5E61D', '#FFC90E', '#FF7F27'],
};

interface MapState {
  panX: number;
  panY: number;
  zoom: number;
}

interface Props {
  project: SwmmProject;
  selectedObj: SelectedObject;
  onSelectObj: (obj: SelectedObject) => void;
  showSubcatchments: boolean;
  subcatchTheme: string;
  nodeTheme: string;
  linkTheme: string;
  timeStep: number;
  results: SimulationResults | null;
  layerVisibility: Record<string, boolean>;
  interactionMode?: string;
  preferences?: SwmmPreferences;
  queryMatchIds?: Set<string> | null;
  queryObjectType?: 'node' | 'link' | 'subcatchment' | null;
  cflFlaggedIds?: Set<string> | null;
  discretizedJunctionIds?: Set<string> | null;
  onCreateNode?: (wx: number, wy: number, mode: string) => void;
  onStartLink?: (nodeId: string) => void;
  onCompleteLink?: (nodeId: string, vertices: [number, number][]) => void;
  onAddLinkVertex?: (wx: number, wy: number) => void;
  onMoveNode?: (nodeId: string, wx: number, wy: number) => void;
  onContextMenu?: (screenX: number, screenY: number, obj: SelectedObject) => void;
  onGroupSelectPoint?: (wx: number, wy: number) => void;
  onGroupSelectComplete?: () => void;
  onEscapeMode?: () => void;
  onShiftClick?: (id: string, objType: string) => void;
  linkDrawState?: { fromNodeId: string; vertices: [number, number][] } | null;
  groupSelectPoints?: [number, number][];
  groupSelectedIds?: Set<string> | null;
  multiSelectIds?: Set<string> | null;
}

export interface NetworkMapHandle {
  getCanvas: () => HTMLCanvasElement | null;
  fitExtent: () => void;
  centerOnWorld: (wx: number, wy: number) => void;
}

const NetworkMap = forwardRef<NetworkMapHandle, Props>(function NetworkMap({
  project,
  selectedObj,
  onSelectObj,
  showSubcatchments,
  subcatchTheme,
  nodeTheme,
  linkTheme,
  timeStep,
  results,
  layerVisibility,
  interactionMode,
  preferences,
  queryMatchIds,
  queryObjectType,
  cflFlaggedIds,
  discretizedJunctionIds,
  onCreateNode,
  onStartLink,
  onCompleteLink,
  onAddLinkVertex,
  onMoveNode,
  onContextMenu,
  onGroupSelectPoint,
  onGroupSelectComplete,
  onEscapeMode,
  onShiftClick,
  linkDrawState,
  groupSelectPoints,
  groupSelectedIds,
  multiSelectIds,
}: Props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapState, setMapState] = useState<MapState>({ panX: 0, panY: 0, zoom: 1 });
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 500 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; id: string; info: string } | null>(null);
  const [rubberBandPos, setRubberBandPos] = useState<[number, number] | null>(null);
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  const hasDragged = useRef(false);
  const mouseButton = useRef(0);
  const hasInitialized = useRef(false);
  const lastProjectCoords = useRef<Record<string, [number, number]> | null>(null);
  const movingNode = useRef<string | null>(null);
  const isLayerVisible = useCallback((layer: string) => layerVisibility[layer] !== false, [layerVisibility]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
        }
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscapeMode) {
        onEscapeMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEscapeMode]);

  const getExtent = useCallback(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const [, [x, y]] of Object.entries(project.coordinates)) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    for (const [, pts] of Object.entries(project.polygons)) {
      for (const [x, y] of pts) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
    for (const [, [x, y]] of Object.entries(project.symbols)) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }

    if (minX === Infinity) {
      return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    }
    const padX = (maxX - minX) * 0.1 || 100;
    const padY = (maxY - minY) * 0.1 || 100;
    return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
  }, [project]);

  const fitExtent = useCallback(() => {
    hasInitialized.current = false;
    const ext = getExtent();
    const dataW = ext.maxX - ext.minX;
    const dataH = ext.maxY - ext.minY;
    const scaleX = canvasSize.w / dataW;
    const scaleY = canvasSize.h / dataH;
    const zoom = Math.min(scaleX, scaleY) * 0.85;
    const cx = (ext.minX + ext.maxX) / 2;
    const cy = (ext.minY + ext.maxY) / 2;
    setMapState({
      zoom,
      panX: canvasSize.w / 2 - cx * zoom,
      panY: canvasSize.h / 2 + cy * zoom,
    });
  }, [getExtent, canvasSize]);

  const centerOnWorld = useCallback((wx: number, wy: number) => {
    setMapState(prev => ({
      ...prev,
      panX: canvasSize.w / 2 - wx * prev.zoom,
      panY: canvasSize.h / 2 + wy * prev.zoom,
    }));
  }, [canvasSize]);

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    fitExtent,
    centerOnWorld,
  }), [fitExtent, centerOnWorld]);

  useEffect(() => {
    if (project.coordinates !== lastProjectCoords.current) {
      lastProjectCoords.current = project.coordinates;
      hasInitialized.current = false;
    }
    if (hasInitialized.current) return;
    if (Object.keys(project.coordinates).length === 0 && Object.keys(project.polygons).length === 0) return;
    hasInitialized.current = true;
    const ext = getExtent();
    const dataW = ext.maxX - ext.minX;
    const dataH = ext.maxY - ext.minY;
    const scaleX = canvasSize.w / dataW;
    const scaleY = canvasSize.h / dataH;
    const zoom = Math.min(scaleX, scaleY) * 0.85;
    const cx = (ext.minX + ext.maxX) / 2;
    const cy = (ext.minY + ext.maxY) / 2;
    setMapState({
      zoom,
      panX: canvasSize.w / 2 - cx * zoom,
      panY: canvasSize.h / 2 + cy * zoom,
    });
  }, [project, canvasSize, getExtent]);

  const worldToScreen = useCallback((wx: number, wy: number): [number, number] => {
    return [
      wx * mapState.zoom + mapState.panX,
      -wy * mapState.zoom + mapState.panY,
    ];
  }, [mapState]);

  const screenToWorld = useCallback((sx: number, sy: number): [number, number] => {
    return [
      (sx - mapState.panX) / mapState.zoom,
      -(sy - mapState.panY) / mapState.zoom,
    ];
  }, [mapState]);

  const hitTestNode = useCallback((sx: number, sy: number, hitRadius = 12): { nodeId: string; nodeType: string } | null => {
    for (const [nodeId, [nx, ny]] of Object.entries(project.coordinates)) {
      const nType = project.outfalls.find(o => o.id === nodeId) ? 'outfall'
        : project.storageUnits.find(s => s.id === nodeId) ? 'storage'
        : project.dividers.find(dd => dd.id === nodeId) ? 'divider'
        : 'junction';

      if (nType === 'junction' && !isLayerVisible('junctions')) continue;
      if (nType === 'outfall' && !isLayerVisible('outfalls')) continue;
      if (nType === 'storage' && !isLayerVisible('storage')) continue;

      const [nsx, nsy] = worldToScreen(nx, ny);
      const d = Math.sqrt((sx - nsx) ** 2 + (sy - nsy) ** 2);
      if (d < hitRadius) return { nodeId, nodeType: nType };
    }
    return null;
  }, [project, worldToScreen, isLayerVisible]);

  const hitTestLink = useCallback((sx: number, sy: number): { linkId: string; linkType: string } | null => {
    const allLinks = [
      ...project.conduits.map(c => ({ id: c.id, from: c.fromNode, to: c.toNode, type: 'conduit', layer: 'conduits' })),
      ...project.pumps.map(p => ({ id: p.id, from: p.fromNode, to: p.toNode, type: 'pump', layer: 'pumps' })),
      ...project.orifices.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'orifice', layer: 'orifices' })),
      ...project.weirs.map(w => ({ id: w.id, from: w.fromNode, to: w.toNode, type: 'weir', layer: 'weirs' })),
      ...project.outlets.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'outlet', layer: 'outlets' })),
    ];
    for (const link of allLinks) {
      if (!isLayerVisible(link.layer)) continue;
      const fromCoord = project.coordinates[link.from];
      const toCoord = project.coordinates[link.to];
      if (!fromCoord || !toCoord) continue;
      const verts = project.vertices[link.id] || [];
      const pts: [number, number][] = [
        worldToScreen(fromCoord[0], fromCoord[1]),
        ...verts.map(v => worldToScreen(v[0], v[1])),
        worldToScreen(toCoord[0], toCoord[1]),
      ];
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(sx, sy, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < 8) {
          return { linkId: link.id, linkType: link.type };
        }
      }
    }
    return null;
  }, [project, worldToScreen, isLayerVisible]);

  const getNodeColor = useCallback((nodeId: string, nodeType: string) => {
    if (multiSelectIds && multiSelectIds.has(nodeId)) return '#338aff';
    if (groupSelectedIds && groupSelectedIds.has(nodeId)) return '#ffaa33';
    if (queryMatchIds && queryObjectType === 'node') {
      if (queryMatchIds.has(nodeId)) return '#ff4444';
      return '#555566';
    }
    if (results && results.timeSteps[timeStep]) {
      const nr = results.timeSteps[timeStep].nodes[nodeId];
      if (nr) {
        const val = nodeTheme === 'depth' ? nr.depth : nr.head;
        const maxVal = nodeTheme === 'depth' ? 8 : 110;
        const minVal = nodeTheme === 'depth' ? 0 : 88;
        const t = Math.min(1, Math.max(0, (val - minVal) / (maxVal - minVal)));
        const idx = Math.min(4, Math.floor(t * 5));
        return COLORS.legend[idx];
      }
    }
    if (nodeType === 'outfall') return '#2a8a4a';
    if (nodeType === 'storage') return '#c08820';
    return COLORS.nodeDefault;
  }, [results, timeStep, nodeTheme, queryMatchIds, queryObjectType, groupSelectedIds, multiSelectIds]);

  const getLinkColor = useCallback((linkId: string) => {
    if (multiSelectIds && multiSelectIds.has(linkId)) return '#338aff';
    if (groupSelectedIds && groupSelectedIds.has(linkId)) return '#ffaa33';
    if (queryMatchIds && queryObjectType === 'link') {
      if (queryMatchIds.has(linkId)) return '#ff4444';
      return '#555566';
    }
    if (cflFlaggedIds && cflFlaggedIds.has(linkId)) return '#ff5555';
    if (results && results.timeSteps[timeStep]) {
      const lr = results.timeSteps[timeStep].links[linkId];
      if (lr) {
        const val = linkTheme === 'flow' ? lr.flow : linkTheme === 'velocity' ? lr.velocity : lr.depth;
        const maxVal = linkTheme === 'flow' ? 15 : linkTheme === 'velocity' ? 8 : 3;
        const t = Math.min(1, Math.max(0, val / maxVal));
        const idx = Math.min(4, Math.floor(t * 5));
        return COLORS.legend[idx];
      }
    }
    return COLORS.linkDefault;
  }, [results, timeStep, linkTheme, queryMatchIds, queryObjectType, groupSelectedIds, multiSelectIds, cflFlaggedIds]);

  const getLinkWidth = useCallback((linkId: string) => {
    if (results && results.timeSteps[timeStep]) {
      const lr = results.timeSteps[timeStep].links[linkId];
      if (lr) {
        return Math.max(1.5, Math.min(6, lr.flow * 0.5));
      }
    }
    return 2;
  }, [results, timeStep]);

  const getSubcatchColor = useCallback((scId: string) => {
    if (queryMatchIds && queryObjectType === 'subcatchment') {
      if (queryMatchIds.has(scId)) return 'rgba(255,68,68,0.35)';
      return 'rgba(85,85,102,0.15)';
    }
    if (results && results.timeSteps[timeStep]) {
      const sr = results.timeSteps[timeStep].subcatchments[scId];
      if (sr) {
        let val = 0;
        let maxVal = 1;
        if (subcatchTheme === 'runoff') { val = sr.runoff; maxVal = 20; }
        else if (subcatchTheme === 'rainfall') { val = sr.rainfall; maxVal = 5; }
        else if (subcatchTheme === 'infiltration') { val = sr.infiltration; maxVal = 3; }
        else {
          const sc = project.subcatchments.find(s => s.id === scId);
          val = sc ? sc.pctImperv / 100 : 0;
          maxVal = 1;
        }
        const t = Math.min(1, Math.max(0, val / maxVal));
        const idx = Math.min(4, Math.floor(t * 5));
        const c = COLORS.legend[idx];
        return c + '40';
      }
    }
    return COLORS.subcatchFill;
  }, [results, timeStep, subcatchTheme, project.subcatchments, queryMatchIds, queryObjectType]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = preferences?.mapBackgroundColor || COLORS.mapBg;
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    const gridSpacing = 50;
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x < canvasSize.w; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasSize.h);
      ctx.stroke();
    }
    for (let y = 0; y < canvasSize.h; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasSize.w, y);
      ctx.stroke();
    }

    if (showSubcatchments) {
      for (const [scId, pts] of Object.entries(project.polygons)) {
        if (pts.length < 3) continue;
        const isSelected = selectedObj?.id === scId;
        ctx.fillStyle = getSubcatchColor(scId);
        ctx.strokeStyle = isSelected ? COLORS.subcatchSelected : COLORS.subcatchStroke;
        ctx.lineWidth = isSelected ? 2.5 : 1;
        ctx.beginPath();
        const [sx, sy] = worldToScreen(pts[0][0], pts[0][1]);
        ctx.moveTo(sx, sy);
        for (let i = 1; i < pts.length; i++) {
          const [px, py] = worldToScreen(pts[i][0], pts[i][1]);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const [tx, ty] = worldToScreen(cx, cy);
        ctx.fillStyle = COLORS.text;
        ctx.font = `${Math.max(9, Math.min(12, mapState.zoom * 500))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(scId, tx, ty);
      }
    }

    for (const [rgId, [rx, ry]] of Object.entries(project.symbols)) {
      const [sx, sy] = worldToScreen(rx, ry);
      ctx.fillStyle = '#4488cc';
      ctx.strokeStyle = '#6699dd';
      ctx.lineWidth = 1.5;
      const s = Math.max(6, Math.min(12, mapState.zoom * 400));
      ctx.beginPath();
      ctx.moveTo(sx, sy - s);
      ctx.lineTo(sx + s * 0.7, sy + s * 0.5);
      ctx.lineTo(sx - s * 0.7, sy + s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.font = `${Math.max(8, Math.min(10, mapState.zoom * 400))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(rgId, sx, sy + s + 10);
    }

    const nodeMap: Record<string, { type: string }> = {};
    project.junctions.forEach(j => nodeMap[j.id] = { type: 'junction' });
    project.outfalls.forEach(o => nodeMap[o.id] = { type: 'outfall' });
    project.storageUnits.forEach(s => nodeMap[s.id] = { type: 'storage' });
    project.dividers.forEach(d => nodeMap[d.id] = { type: 'divider' });

    const allLinks = [
      ...(isLayerVisible('conduits') ? project.conduits.map(c => ({ id: c.id, from: c.fromNode, to: c.toNode, type: 'conduit' as const })) : []),
      ...(isLayerVisible('pumps') ? project.pumps.map(p => ({ id: p.id, from: p.fromNode, to: p.toNode, type: 'pump' as const })) : []),
      ...project.orifices.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'orifice' as const })),
      ...(isLayerVisible('weirs') ? project.weirs.map(w => ({ id: w.id, from: w.fromNode, to: w.toNode, type: 'weir' as const })) : []),
      ...project.outlets.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'outlet' as const })),
    ];

    for (const link of allLinks) {
      const fromCoord = project.coordinates[link.from];
      const toCoord = project.coordinates[link.to];
      if (!fromCoord || !toCoord) continue;

      const isSelected = selectedObj?.id === link.id;
      const verts = project.vertices[link.id] || [];
      const points: [number, number][] = [
        worldToScreen(fromCoord[0], fromCoord[1]),
        ...verts.map(v => worldToScreen(v[0], v[1])),
        worldToScreen(toCoord[0], toCoord[1]),
      ];

      ctx.strokeStyle = getLinkColor(link.id);
      ctx.lineWidth = isSelected ? getLinkWidth(link.id) + 2 : getLinkWidth(link.id);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.stroke();

      const midIdx = Math.floor(points.length / 2);
      const p1 = points[Math.max(0, midIdx - 1)];
      const p2 = points[midIdx];
      const mx = (p1[0] + p2[0]) / 2;
      const my = (p1[1] + p2[1]) / 2;

      if (link.type === 'pump') {
        const r = Math.max(6, Math.min(10, mapState.zoom * 300));
        ctx.fillStyle = getLinkColor(link.id);
        ctx.beginPath();
        ctx.arc(mx, my, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${r}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('P', mx, my + 1);
      } else if (link.type === 'weir') {
        const r = Math.max(6, Math.min(10, mapState.zoom * 300));
        ctx.fillStyle = getLinkColor(link.id);
        ctx.fillRect(mx - r, my - r / 3, r * 2, r * 0.66);
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${r * 0.7}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('W', mx, my);
      } else if (link.type === 'orifice') {
        const r = Math.max(5, Math.min(8, mapState.zoom * 250));
        ctx.strokeStyle = getLinkColor(link.id);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, my, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const ux = dx / len;
        const uy = dy / len;
        const arrowLen = Math.max(4, Math.min(8, mapState.zoom * 200));
        const ax = mx + ux * arrowLen * 1.5;
        const ay = my + uy * arrowLen * 1.5;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - ux * arrowLen - uy * arrowLen * 0.4, ay - uy * arrowLen + ux * arrowLen * 0.4);
        ctx.lineTo(ax - ux * arrowLen + uy * arrowLen * 0.4, ay - uy * arrowLen - ux * arrowLen * 0.4);
        ctx.closePath();
        ctx.fill();
      }

      if (preferences?.showLinkIds !== false) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.font = `${Math.max(8, Math.min(10, mapState.zoom * 350))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(link.id, mx, my - 8);
      }
    }

    for (const [nodeId, [nx, ny]] of Object.entries(project.coordinates)) {
      const nType = nodeMap[nodeId]?.type || 'junction';
      if (nType === 'junction' && !isLayerVisible('junctions')) continue;
      if (nType === 'outfall' && !isLayerVisible('outfalls')) continue;
      if (nType === 'storage' && !isLayerVisible('storage')) continue;
      const [sx, sy] = worldToScreen(nx, ny);
      const isSelected = selectedObj?.id === nodeId;
      const r = Math.max(4, Math.min(8, mapState.zoom * 250));

      ctx.fillStyle = getNodeColor(nodeId, nType);
      ctx.strokeStyle = isSelected ? '#000000' : 'rgba(0,0,0,0.4)';
      ctx.lineWidth = isSelected ? 2.5 : 1;

      if (nType === 'storage') {
        ctx.beginPath();
        ctx.rect(sx - r, sy - r, r * 2, r * 2);
        ctx.fill();
        ctx.stroke();
      } else if (nType === 'outfall') {
        ctx.beginPath();
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx + r, sy + r);
        ctx.lineTo(sx - r, sy + r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (nType === 'divider') {
        ctx.beginPath();
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx + r, sy);
        ctx.lineTo(sx, sy + r);
        ctx.lineTo(sx - r, sy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (discretizedJunctionIds && discretizedJunctionIds.has(nodeId)) {
        const dr = r * 0.7;
        ctx.fillStyle = '#2a8a4a';
        ctx.strokeStyle = isSelected ? '#000000' : 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.moveTo(sx, sy - dr);
        ctx.lineTo(sx + dr, sy);
        ctx.lineTo(sx, sy + dr);
        ctx.lineTo(sx - dr, sy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      if (preferences?.showNodeIds !== false) {
        ctx.fillStyle = isSelected ? COLORS.textSelected : COLORS.text;
        ctx.font = `${Math.max(9, Math.min(11, mapState.zoom * 400))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(nodeId, sx + r + 4, sy - 2);
      }
    }

    if (isLayerVisible('labels')) {
      for (const label of project.labels) {
        const [sx, sy] = worldToScreen(label.x, label.y);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.font = `${label.bold ? 'bold ' : ''}${label.size || 10}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(label.text, sx, sy);
      }
    }

    if (linkDrawState) {
      const fromCoord = project.coordinates[linkDrawState.fromNodeId];
      if (fromCoord) {
        const pts: [number, number][] = [
          worldToScreen(fromCoord[0], fromCoord[1]),
          ...linkDrawState.vertices.map(v => worldToScreen(v[0], v[1])),
        ];
        if (rubberBandPos) {
          pts.push(rubberBandPos);
        }
        ctx.strokeStyle = '#2c6eb5';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        for (const pt of pts) {
          ctx.fillStyle = '#2c6eb5';
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (groupSelectPoints && groupSelectPoints.length > 0) {
      const screenPts = groupSelectPoints.map(p => worldToScreen(p[0], p[1]));
      ctx.strokeStyle = '#ffaa33';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(screenPts[0][0], screenPts[0][1]);
      for (let i = 1; i < screenPts.length; i++) {
        ctx.lineTo(screenPts[i][0], screenPts[i][1]);
      }
      if (rubberBandPos && interactionMode === 'groupSelect') {
        ctx.lineTo(rubberBandPos[0], rubberBandPos[1]);
      }
      if (groupSelectedIds && groupSelectedIds.size > 0) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,170,51,0.08)';
        ctx.fill();
      }
      ctx.stroke();
      ctx.setLineDash([]);

      for (const pt of screenPts) {
        ctx.fillStyle = '#ffaa33';
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  }, [project, selectedObj, showSubcatchments, subcatchTheme, nodeTheme, linkTheme, timeStep, results, mapState, canvasSize, worldToScreen, getNodeColor, getLinkColor, getLinkWidth, getSubcatchColor, isLayerVisible, preferences, linkDrawState, rubberBandPos, groupSelectPoints, groupSelectedIds, interactionMode, cflFlaggedIds, discretizedJunctionIds]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setMapState(prev => ({
      zoom: prev.zoom * factor,
      panX: mx - (mx - prev.panX) * factor,
      panY: my - (my - prev.panY) * factor,
    }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      mouseDownPos.current = { x: e.clientX, y: e.clientY };
      hasDragged.current = false;
      mouseButton.current = e.button;

      if (e.button === 0 && e.ctrlKey && interactionMode === 'select' && selectedObj) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const hit = hitTestNode(sx, sy);
          if (hit && hit.nodeId === selectedObj.id) {
            movingNode.current = hit.nodeId;
          }
        }
      }

      e.preventDefault();
    }
  }, [interactionMode, selectedObj, hitTestNode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (linkDrawState || (interactionMode === 'groupSelect' && groupSelectPoints && groupSelectPoints.length > 0)) {
      setRubberBandPos([sx, sy]);
    }

    if (mouseDownPos.current) {
      const dx = e.clientX - mouseDownPos.current.x;
      const dy = e.clientY - mouseDownPos.current.y;
      if (!hasDragged.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        hasDragged.current = true;
      }
      if (hasDragged.current) {
        setTooltip(null);

        if (movingNode.current && onMoveNode) {
          const [wx, wy] = screenToWorld(sx, sy);
          onMoveNode(movingNode.current, wx, wy);
          return;
        }

        setMapState(prev => ({
          ...prev,
          panX: prev.panX + (e.movementX || 0),
          panY: prev.panY + (e.movementY || 0),
        }));
      }
      return;
    }

    const hitRadius = 12;

    for (const [nodeId, [nx, ny]] of Object.entries(project.coordinates)) {
      const nType = project.outfalls.find(o => o.id === nodeId) ? 'outfall'
        : project.storageUnits.find(s => s.id === nodeId) ? 'storage'
        : project.dividers.find(dd => dd.id === nodeId) ? 'divider'
        : 'junction';

      if (nType === 'junction' && !isLayerVisible('junctions')) continue;
      if (nType === 'outfall' && !isLayerVisible('outfalls')) continue;
      if (nType === 'storage' && !isLayerVisible('storage')) continue;

      const [nsx, nsy] = worldToScreen(nx, ny);
      const d = Math.sqrt((sx - nsx) ** 2 + (sy - nsy) ** 2);
      if (d < hitRadius) {
        let info = '';
        if (results && results.timeSteps[timeStep]) {
          const nr = results.timeSteps[timeStep].nodes[nodeId];
          if (nr) {
            info = nodeTheme === 'depth' ? `Depth: ${nr.depth.toFixed(2)}` : `Head: ${nr.head.toFixed(2)}`;
          }
        }
        if (!info) {
          const junc = project.junctions.find(j => j.id === nodeId);
          const outf = project.outfalls.find(o => o.id === nodeId);
          const stor = project.storageUnits.find(s => s.id === nodeId);
          if (junc) info = `Elev: ${junc.elevation}`;
          else if (outf) info = `Elev: ${outf.elevation}`;
          else if (stor) info = `Elev: ${stor.elevation}`;
        }
        setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 8, id: nodeId, info });
        return;
      }
    }

    const allLinksHover: { id: string; from: string; to: string; type: string; layer: string }[] = [
      ...project.conduits.map(c => ({ id: c.id, from: c.fromNode, to: c.toNode, type: 'conduit', layer: 'conduits' })),
      ...project.pumps.map(p => ({ id: p.id, from: p.fromNode, to: p.toNode, type: 'pump', layer: 'pumps' })),
      ...project.orifices.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'orifice', layer: 'orifices' })),
      ...project.weirs.map(w => ({ id: w.id, from: w.fromNode, to: w.toNode, type: 'weir', layer: 'weirs' })),
      ...project.outlets.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'outlet', layer: 'outlets' })),
    ];

    for (const link of allLinksHover) {
      if (!isLayerVisible(link.layer)) continue;
      const fromCoord = project.coordinates[link.from];
      const toCoord = project.coordinates[link.to];
      if (!fromCoord || !toCoord) continue;

      const verts = project.vertices[link.id] || [];
      const pts: [number, number][] = [
        worldToScreen(fromCoord[0], fromCoord[1]),
        ...verts.map(v => worldToScreen(v[0], v[1])),
        worldToScreen(toCoord[0], toCoord[1]),
      ];

      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(sx, sy, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < 8) {
          let info = '';
          if (results && results.timeSteps[timeStep]) {
            const lr = results.timeSteps[timeStep].links[link.id];
            if (lr) {
              info = linkTheme === 'flow' ? `Flow: ${lr.flow.toFixed(2)}`
                : linkTheme === 'velocity' ? `Vel: ${lr.velocity.toFixed(2)}`
                : `Depth: ${lr.depth.toFixed(2)}`;
            }
          }
          if (!info) {
            const conduit = project.conduits.find(c => c.id === link.id);
            if (conduit) info = `Length: ${conduit.length}`;
            else info = link.type;
          }
          setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 8, id: link.id, info });
          return;
        }
      }
    }

    if (showSubcatchments) {
      for (const [scId, pts] of Object.entries(project.polygons)) {
        const screenPts = pts.map(p => worldToScreen(p[0], p[1]));
        if (pointInPolygon(sx, sy, screenPts)) {
          let info = '';
          if (results && results.timeSteps[timeStep]) {
            const sr = results.timeSteps[timeStep].subcatchments[scId];
            if (sr) {
              info = subcatchTheme === 'runoff' ? `Runoff: ${sr.runoff.toFixed(2)}`
                : subcatchTheme === 'rainfall' ? `Rain: ${sr.rainfall.toFixed(2)}`
                : subcatchTheme === 'infiltration' ? `Infil: ${sr.infiltration.toFixed(2)}`
                : `Imperv: ${(project.subcatchments.find(s => s.id === scId)?.pctImperv || 0).toFixed(1)}%`;
            }
          }
          if (!info) {
            const sc = project.subcatchments.find(s => s.id === scId);
            if (sc) info = `Area: ${sc.area}`;
          }
          setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 8, id: scId, info });
          return;
        }
      }
    }

    setTooltip(null);
  }, [project, worldToScreen, screenToWorld, isLayerVisible, showSubcatchments, results, timeStep, nodeTheme, linkTheme, subcatchTheme, linkDrawState, interactionMode, groupSelectPoints, onMoveNode]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const wasClick = mouseDownPos.current && !hasDragged.current && mouseButton.current === 0;
    const wasMoving = movingNode.current !== null;
    mouseDownPos.current = null;
    movingNode.current = null;

    if (wasMoving) return;
    if (!wasClick) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const isNodeCreationMode = interactionMode === 'addJunction' || interactionMode === 'addOutfall' || interactionMode === 'addStorage';
    if (isNodeCreationMode && onCreateNode) {
      const [wx, wy] = screenToWorld(sx, sy);
      onCreateNode(wx, wy, interactionMode);
      return;
    }

    const isLinkCreationMode = interactionMode === 'addConduit' || interactionMode === 'addPump';
    if (isLinkCreationMode) {
      const hitNode = hitTestNode(sx, sy);
      if (hitNode) {
        if (!linkDrawState) {
          onStartLink?.(hitNode.nodeId);
        } else if (hitNode.nodeId !== linkDrawState.fromNodeId) {
          onCompleteLink?.(hitNode.nodeId, linkDrawState.vertices);
          setRubberBandPos(null);
        }
      } else if (linkDrawState) {
        const [wx, wy] = screenToWorld(sx, sy);
        onAddLinkVertex?.(wx, wy);
      }
      return;
    }

    if (interactionMode === 'groupSelect') {
      const [wx, wy] = screenToWorld(sx, sy);
      onGroupSelectPoint?.(wx, wy);
      return;
    }

    const hitRadius = 12;
    const isShift = e.shiftKey;

    const hitNode = hitTestNode(sx, sy, hitRadius);
    if (hitNode) {
      if (isShift && onShiftClick) {
        onShiftClick(hitNode.nodeId, hitNode.nodeType);
      } else {
        onSelectObj({ id: hitNode.nodeId, objType: hitNode.nodeType as any });
      }
      return;
    }

    const hitLink = hitTestLink(sx, sy);
    if (hitLink) {
      if (isShift && onShiftClick) {
        onShiftClick(hitLink.linkId, hitLink.linkType);
      } else {
        onSelectObj({ id: hitLink.linkId, objType: hitLink.linkType as any });
      }
      return;
    }

    if (showSubcatchments) {
      for (const [scId, pts] of Object.entries(project.polygons)) {
        const screenPts = pts.map(p => worldToScreen(p[0], p[1]));
        if (pointInPolygon(sx, sy, screenPts)) {
          if (isShift && onShiftClick) {
            onShiftClick(scId, 'subcatchment');
          } else {
            onSelectObj({ id: scId, objType: 'subcatchment' });
          }
          return;
        }
      }
    }

    if (!isShift) onSelectObj(null);
  }, [project, worldToScreen, screenToWorld, onSelectObj, isLayerVisible, showSubcatchments, interactionMode, onCreateNode, linkDrawState, onStartLink, onCompleteLink, onAddLinkVertex, onGroupSelectPoint, hitTestNode, hitTestLink, onShiftClick]);

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    if (interactionMode === 'groupSelect' && groupSelectPoints && groupSelectPoints.length >= 3) {
      onGroupSelectComplete?.();
      setRubberBandPos(null);
      return;
    }

    if (interactionMode !== 'select') {
      onEscapeMode?.();
      setRubberBandPos(null);
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const hitNode = hitTestNode(sx, sy);
    if (hitNode) {
      onSelectObj({ id: hitNode.nodeId, objType: hitNode.nodeType as any });
      onContextMenu?.(e.clientX, e.clientY, { id: hitNode.nodeId, objType: hitNode.nodeType as any });
      return;
    }

    const hitLink = hitTestLink(sx, sy);
    if (hitLink) {
      onSelectObj({ id: hitLink.linkId, objType: hitLink.linkType as any });
      onContextMenu?.(e.clientX, e.clientY, { id: hitLink.linkId, objType: hitLink.linkType as any });
      return;
    }

    onContextMenu?.(e.clientX, e.clientY, null);
  }, [interactionMode, groupSelectPoints, onGroupSelectComplete, onEscapeMode, hitTestNode, hitTestLink, onSelectObj, onContextMenu]);

  const handleMouseLeave = useCallback(() => {
    mouseDownPos.current = null;
    movingNode.current = null;
    setTooltip(null);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (interactionMode === 'groupSelect' && groupSelectPoints && groupSelectPoints.length >= 3) {
      onGroupSelectComplete?.();
      setRubberBandPos(null);
      return;
    }
    fitExtent();
  }, [fitExtent, interactionMode, groupSelectPoints, onGroupSelectComplete]);

  const touchRef = useRef<{ lastDist: number; lastCenter: { x: number; y: number }; singleTouch: { x: number; y: number } | null; hasMoved: boolean; startTime: number }>({ lastDist: 0, lastCenter: { x: 0, y: 0 }, singleTouch: null, hasMoved: false, startTime: 0 });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      touchRef.current.lastDist = Math.sqrt(dx * dx + dy * dy);
      touchRef.current.lastCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      };
      touchRef.current.singleTouch = null;
      touchRef.current.hasMoved = true;
    } else if (e.touches.length === 1) {
      touchRef.current.singleTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchRef.current.hasMoved = false;
      touchRef.current.startTime = Date.now();
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      if (touchRef.current.lastDist > 0) {
        const factor = dist / touchRef.current.lastDist;
        setMapState(prev => ({
          zoom: prev.zoom * factor,
          panX: cx - (cx - prev.panX) * factor,
          panY: cy - (cy - prev.panY) * factor,
        }));
      }
      touchRef.current.lastDist = dist;
      touchRef.current.lastCenter = { x: cx, y: cy };
    } else if (e.touches.length === 1 && touchRef.current.singleTouch) {
      const dx = e.touches[0].clientX - touchRef.current.singleTouch.x;
      const dy = e.touches[0].clientY - touchRef.current.singleTouch.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        touchRef.current.hasMoved = true;
      }
      if (touchRef.current.hasMoved) {
        setMapState(prev => ({ ...prev, panX: prev.panX + dx, panY: prev.panY + dy }));
        touchRef.current.singleTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0 && !touchRef.current.hasMoved && touchRef.current.singleTouch) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const sx = touchRef.current.singleTouch.x - rect.left;
        const sy = touchRef.current.singleTouch.y - rect.top;
        const hitNode = hitTestNode(sx, sy);
        const hitLink = hitTestLink(sx, sy);
        if (hitNode) {
          onSelectObj?.({ type: 'node', id: hitNode.nodeId });
        } else if (hitLink) {
          onSelectObj?.({ type: 'link', id: hitLink.linkId });
        } else if (interactionMode === 'addJunction' || interactionMode === 'addOutfall' || interactionMode === 'addStorage') {
          const wx = (sx - mapState.panX) / mapState.zoom;
          const wy = -(sy - mapState.panY) / mapState.zoom;
          onCreateNode?.(wx, wy, interactionMode.replace('add', '').toLowerCase());
        } else if (interactionMode === 'addConduit' || interactionMode === 'addPump') {
          const hitN = hitTestNode(sx, sy);
          if (hitN) {
            if (!linkDrawState) {
              onStartLink?.(hitN.nodeId);
            } else {
              onCompleteLink?.(hitN.nodeId, linkDrawState.vertices);
            }
          } else if (linkDrawState) {
            const wx = (sx - mapState.panX) / mapState.zoom;
            const wy = -(sy - mapState.panY) / mapState.zoom;
            onAddLinkVertex?.(wx, wy);
          }
        } else {
          onSelectObj?.(null);
        }
      }
    }
    if (e.touches.length === 0) {
      touchRef.current.singleTouch = null;
      touchRef.current.lastDist = 0;
      touchRef.current.hasMoved = false;
    } else if (e.touches.length === 1) {
      touchRef.current.singleTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      touchRef.current.lastDist = 0;
    }
  }, [hitTestNode, hitTestLink, onSelectObj, onCreateNode, onStartLink, onCompleteLink, onAddLinkVertex, interactionMode, mapState, linkDrawState]);

  const cursorStyle = interactionMode === 'addJunction' || interactionMode === 'addOutfall' || interactionMode === 'addStorage'
    ? 'copy'
    : interactionMode === 'addConduit' || interactionMode === 'addPump'
    ? (linkDrawState ? 'crosshair' : 'cell')
    : interactionMode === 'groupSelect'
    ? 'crosshair'
    : 'crosshair';

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ touchAction: 'none' }} data-testid="network-map-container">
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleRightClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ width: '100%', height: '100%', cursor: cursorStyle, display: 'block', touchAction: 'none' }}
        data-testid="network-map-canvas"
      />
      {tooltip && (
        <div
          data-testid="map-tooltip"
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            pointerEvents: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            border: '1px solid #2c6eb5',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            fontFamily: '"JetBrains Mono", monospace',
            color: '#2a2a3e',
            whiteSpace: 'nowrap',
            zIndex: 50,
            transform: 'translateY(-100%)',
          }}
        >
          <span style={{ color: '#2c6eb5', fontWeight: 600 }} data-testid="tooltip-id">{tooltip.id}</span>
          {tooltip.info && (
            <span style={{ color: '#6b6b7b', marginLeft: '6px' }} data-testid="tooltip-info">{tooltip.info}</span>
          )}
        </div>
      )}
    </div>
  );
});

export default NetworkMap;

function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;
  return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
}
