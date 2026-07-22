import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import type { SwmmProject, SelectedObject, SimulationResults } from '@/lib/swmm-types';
import { getNodeVarByKey, getLinkVarByKey, getSubVarByKey } from '@/lib/swmm-variables';
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
  const backdropImgRef = useRef<HTMLImageElement | null>(null);
  const [backdropLoaded, setBackdropLoaded] = useState(false);
  const [minimapPos, setMinimapPos] = useState<{ x: number; y: number } | null>(null);
  const draggingMinimap = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const isLayerVisible = useCallback((layer: string) => layerVisibility[layer] !== false, [layerVisibility]);

  const nodeSizeFactor = preferences?.nodeSize ?? 1.0;

  useEffect(() => {
    const src = preferences?.backdropImage;
    if (!src) {
      backdropImgRef.current = null;
      setBackdropLoaded(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      backdropImgRef.current = img;
      setBackdropLoaded(true);
    };
    img.onerror = () => {
      backdropImgRef.current = null;
      setBackdropLoaded(false);
    };
    img.src = src;
  }, [preferences?.backdropImage]);

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
      if (nType === 'divider' && !isLayerVisible('dividers')) continue;

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
    if (nodeTheme === 'elevation' || nodeTheme === 'maxDepth') {
      const j = project.junctions.find(n => n.id === nodeId);
      const s = project.storageUnits.find(n => n.id === nodeId);
      const o = project.outfalls.find(n => n.id === nodeId);
      const elev = j?.elevation ?? s?.elevation ?? o?.elevation;
      const maxD = j?.maxDepth ?? s?.maxDepth ?? 0;
      if (nodeTheme === 'elevation' && elev != null) {
        const allElevs = [...project.junctions.map(n => n.elevation), ...project.storageUnits.map(n => n.elevation), ...project.outfalls.map(n => n.elevation)];
        const mn = Math.min(...allElevs);
        const mx = Math.max(...allElevs);
        const range = mx - mn || 1;
        const t = Math.min(1, Math.max(0, (elev - mn) / range));
        return COLORS.legend[Math.min(4, Math.floor(t * 5))];
      }
      if (nodeTheme === 'maxDepth') {
        const t = Math.min(1, Math.max(0, maxD / 20));
        return COLORS.legend[Math.min(4, Math.floor(t * 5))];
      }
    }
    if (results && results.timeSteps[timeStep] && nodeTheme !== 'none' && nodeTheme !== 'elevation' && nodeTheme !== 'maxDepth') {
      const nr = results.timeSteps[timeStep].nodes[nodeId];
      if (nr) {
        const stdKeys: Record<string, number> = { depth: nr.depth, head: nr.head, volume: nr.volume, lateralInflow: nr.lateralInflow, totalInflow: nr.totalInflow, flooding: nr.flooding };
        let val = stdKeys[nodeTheme] ?? (nr.extended ? nr.extended[nodeTheme] : undefined) ?? undefined;
        if (val !== undefined) {
          const varInfo = getNodeVarByKey(nodeTheme);
          const maxVal = varInfo?.maxVal || 10;
          const minVal = nodeTheme === 'head' ? 88 : 0;
          const t = Math.min(1, Math.max(0, (val - minVal) / (maxVal - minVal || 1)));
          const idx = Math.min(4, Math.floor(t * 5));
          return COLORS.legend[idx];
        }
      }
    }
    if (nodeTheme === 'none') {
      if (nodeType === 'outfall') return '#2a8a4a';
      if (nodeType === 'storage') return '#c08820';
      return COLORS.nodeDefault;
    }
    if (nodeType === 'outfall') return '#2a8a4a';
    if (nodeType === 'storage') return '#c08820';
    return COLORS.nodeDefault;
  }, [results, timeStep, nodeTheme, queryMatchIds, queryObjectType, groupSelectedIds, multiSelectIds, project.junctions, project.storageUnits, project.outfalls]);

  const getLinkColor = useCallback((linkId: string) => {
    if (multiSelectIds && multiSelectIds.has(linkId)) return '#338aff';
    if (groupSelectedIds && groupSelectedIds.has(linkId)) return '#ffaa33';
    if (queryMatchIds && queryObjectType === 'link') {
      if (queryMatchIds.has(linkId)) return '#ff4444';
      return '#555566';
    }
    if (cflFlaggedIds && cflFlaggedIds.has(linkId)) return '#ff5555';
    if (linkTheme === 'maxDepth' || linkTheme === 'roughness' || linkTheme === 'length' || linkTheme === 'slope') {
      const c = project.conduits.find(cc => cc.id === linkId);
      if (c) {
        let val = 0, maxVal = 1;
        if (linkTheme === 'roughness') { val = c.roughness; maxVal = 0.05; }
        else if (linkTheme === 'length') { val = c.length; maxVal = Math.max(1, ...project.conduits.map(cc => cc.length)); }
        else if (linkTheme === 'slope') {
          const fn = [...project.junctions, ...project.storageUnits, ...project.outfalls, ...project.dividers].find(n => n.id === c.fromNode);
          const tn = [...project.junctions, ...project.storageUnits, ...project.outfalls, ...project.dividers].find(n => n.id === c.toNode);
          if (fn && tn && c.length > 0) {
            val = Math.abs(fn.elevation - tn.elevation) / c.length;
          }
          maxVal = 0.05;
        } else {
          const xs = Array.isArray(project.xsections)
            ? project.xsections.find((x: any) => x.linkId === linkId)
            : (project.xsections as Record<string, any>)[linkId];
          val = xs && typeof xs.geom1 === 'number' ? xs.geom1 : 0;
          maxVal = 10;
        }
        const t = Math.min(1, Math.max(0, val / maxVal));
        return COLORS.legend[Math.min(4, Math.floor(t * 5))];
      }
      return COLORS.linkDefault;
    }
    if (results && results.timeSteps[timeStep] && linkTheme !== 'none' && linkTheme !== 'maxDepth' && linkTheme !== 'roughness' && linkTheme !== 'length' && linkTheme !== 'slope') {
      const lr = results.timeSteps[timeStep].links[linkId];
      if (lr) {
        const stdKeys: Record<string, number> = { flow: Math.abs(lr.flow), velocity: Math.abs(lr.velocity), depth: lr.depth, volume: lr.volume, capacity: lr.capacity };
        let val = stdKeys[linkTheme] ?? (lr.extended ? lr.extended[linkTheme] : undefined) ?? undefined;
        if (val !== undefined) {
          const varInfo = getLinkVarByKey(linkTheme);
          const maxVal = varInfo?.maxVal || 10;
          const t = Math.min(1, Math.max(0, val / maxVal));
          const idx = Math.min(4, Math.floor(t * 5));
          return COLORS.legend[idx];
        }
      }
    }
    return COLORS.linkDefault;
  }, [results, timeStep, linkTheme, queryMatchIds, queryObjectType, groupSelectedIds, multiSelectIds, cflFlaggedIds, project.conduits, project.xsections, project.junctions, project.storageUnits, project.outfalls, project.dividers]);

  const getLinkWidth = useCallback((linkId: string) => {
    if (results && results.timeSteps[timeStep]) {
      const lr = results.timeSteps[timeStep].links[linkId];
      if (lr) {
        const absFlow = Math.abs(lr.flow);
        return Math.max(1.5, Math.min(8, 1.5 + Math.sqrt(absFlow) * 0.8));
      }
    }
    return 2;
  }, [results, timeStep]);

  const getSubcatchColor = useCallback((scId: string) => {
    if (queryMatchIds && queryObjectType === 'subcatchment') {
      if (queryMatchIds.has(scId)) return 'rgba(255,68,68,0.35)';
      return 'rgba(85,85,102,0.15)';
    }
    if (subcatchTheme === 'imperv' || subcatchTheme === 'area' || subcatchTheme === 'width' || subcatchTheme === 'slope') {
      const sc = project.subcatchments.find(s => s.id === scId);
      if (sc) {
        let val = 0, maxVal = 1;
        if (subcatchTheme === 'imperv') { val = sc.pctImperv / 100; maxVal = 1; }
        else if (subcatchTheme === 'area') { val = sc.area; maxVal = Math.max(1, ...project.subcatchments.map(s => s.area)); }
        else if (subcatchTheme === 'width') { val = sc.width; maxVal = Math.max(1, ...project.subcatchments.map(s => s.width)); }
        else if (subcatchTheme === 'slope') { val = sc.slope; maxVal = Math.max(0.1, ...project.subcatchments.map(s => s.slope)); }
        const t = Math.min(1, Math.max(0, val / maxVal));
        return COLORS.legend[Math.min(4, Math.floor(t * 5))] + '40';
      }
      return COLORS.subcatchFill;
    }
    if (results && results.timeSteps[timeStep] && subcatchTheme !== 'none' && subcatchTheme !== 'imperv' && subcatchTheme !== 'area' && subcatchTheme !== 'width' && subcatchTheme !== 'slope') {
      const sr = results.timeSteps[timeStep].subcatchments[scId];
      if (sr) {
        const stdKeys: Record<string, number> = { runoff: sr.runoff, rainfall: sr.rainfall, infiltration: sr.infiltration, snowDepth: sr.snowDepth, evap: sr.evap, gwOutflow: sr.gwOutflow, gwElev: sr.gwElev, moisture: sr.moisture };
        let val = stdKeys[subcatchTheme] ?? (sr.extended ? sr.extended[subcatchTheme] : undefined) ?? undefined;
        if (val !== undefined) {
          const varInfo = getSubVarByKey(subcatchTheme);
          const maxVal = varInfo?.maxVal || 10;
          const t = Math.min(1, Math.max(0, val / maxVal));
          const idx = Math.min(4, Math.floor(t * 5));
          return COLORS.legend[idx] + '40';
        }
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

    ctx.fillStyle = preferences?.mapBackgroundColor || '#f8f9fb';
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    const drawWorldGrid = () => {
      const majorWorldSpacing = Math.pow(10, Math.floor(Math.log10(200 / mapState.zoom)));
      const minorWorldSpacing = majorWorldSpacing / 5;
      const screenToWorld = (sx: number, sy: number): [number, number] => [
        (sx - mapState.panX) / mapState.zoom,
        -(sy - mapState.panY) / mapState.zoom,
      ];
      const [wLeft, wTop] = screenToWorld(0, 0);
      const [wRight, wBottom] = screenToWorld(canvasSize.w, canvasSize.h);
      const wMinX = Math.min(wLeft, wRight);
      const wMaxX = Math.max(wLeft, wRight);
      const wMinY = Math.min(wTop, wBottom);
      const wMaxY = Math.max(wTop, wBottom);

      ctx.lineWidth = 0.5;
      ctx.strokeStyle = 'rgba(180,195,215,0.18)';
      const startMinorX = Math.floor(wMinX / minorWorldSpacing) * minorWorldSpacing;
      for (let wx = startMinorX; wx <= wMaxX; wx += minorWorldSpacing) {
        const sx = wx * mapState.zoom + mapState.panX;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, canvasSize.h); ctx.stroke();
      }
      const startMinorY = Math.floor(wMinY / minorWorldSpacing) * minorWorldSpacing;
      for (let wy = startMinorY; wy <= wMaxY; wy += minorWorldSpacing) {
        const sy = -wy * mapState.zoom + mapState.panY;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(canvasSize.w, sy); ctx.stroke();
      }

      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(180,195,215,0.4)';
      const startMajorX = Math.floor(wMinX / majorWorldSpacing) * majorWorldSpacing;
      for (let wx = startMajorX; wx <= wMaxX; wx += majorWorldSpacing) {
        const sx = wx * mapState.zoom + mapState.panX;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, canvasSize.h); ctx.stroke();
      }
      const startMajorY = Math.floor(wMinY / majorWorldSpacing) * majorWorldSpacing;
      for (let wy = startMajorY; wy <= wMaxY; wy += majorWorldSpacing) {
        const sy = -wy * mapState.zoom + mapState.panY;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(canvasSize.w, sy); ctx.stroke();
      }
    };
    drawWorldGrid();

    if (backdropImgRef.current && backdropLoaded) {
      const img = backdropImgRef.current;
      const bScale = preferences?.backdropScale ?? 1.0;
      const bOpacity = preferences?.backdropOpacity ?? 0.5;
      const bOffX = preferences?.backdropOffsetX ?? 0;
      const bOffY = preferences?.backdropOffsetY ?? 0;
      const imgW = img.width * bScale;
      const imgH = img.height * bScale;
      const [sx1, sy1] = worldToScreen(bOffX, bOffY + imgH);
      const [sx2, sy2] = worldToScreen(bOffX + imgW, bOffY);
      ctx.save();
      ctx.globalAlpha = bOpacity;
      ctx.drawImage(img, sx1, sy1, sx2 - sx1, sy2 - sy1);
      ctx.restore();
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
      if (!isLayerVisible('raingages')) continue;
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

    const nodeMap: Record<string, { type: string; maxDepth: number }> = {};
    project.junctions.forEach(j => nodeMap[j.id] = { type: 'junction', maxDepth: j.maxDepth });
    project.outfalls.forEach(o => nodeMap[o.id] = { type: 'outfall', maxDepth: 0 });
    project.storageUnits.forEach(s => nodeMap[s.id] = { type: 'storage', maxDepth: s.maxDepth });
    project.dividers.forEach(d => nodeMap[d.id] = { type: 'divider', maxDepth: d.maxDepth });

    const allLinks = [
      ...(isLayerVisible('conduits') ? project.conduits.map(c => ({ id: c.id, from: c.fromNode, to: c.toNode, type: 'conduit' as const })) : []),
      ...(isLayerVisible('pumps') ? project.pumps.map(p => ({ id: p.id, from: p.fromNode, to: p.toNode, type: 'pump' as const })) : []),
      ...(isLayerVisible('orifices') ? project.orifices.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'orifice' as const })) : []),
      ...(isLayerVisible('weirs') ? project.weirs.map(w => ({ id: w.id, from: w.fromNode, to: w.toNode, type: 'weir' as const })) : []),
      ...(isLayerVisible('outlets') ? project.outlets.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'outlet' as const })) : []),
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
        const lr = results && results.timeSteps[timeStep] ? results.timeSteps[timeStep].links[link.id] : null;
        const flowDir = lr && lr.flow < 0 ? -1 : 1;
        const ux = (dx / len) * flowDir;
        const uy = (dy / len) * flowDir;
        const arrowLen = Math.max(4, Math.min(10, mapState.zoom * 250));
        const arrowW = lr ? Math.max(0.3, Math.min(0.6, 0.3 + Math.sqrt(Math.abs(lr?.flow || 0)) * 0.05)) : 0.4;
        const ax = mx + ux * arrowLen * 1.5;
        const ay = my + uy * arrowLen * 1.5;
        ctx.fillStyle = lr ? getLinkColor(link.id) : 'rgba(0,0,0,0.35)';
        ctx.globalAlpha = lr ? 0.9 : 0.35;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - ux * arrowLen - uy * arrowLen * arrowW, ay - uy * arrowLen + ux * arrowLen * arrowW);
        ctx.lineTo(ax - ux * arrowLen + uy * arrowLen * arrowW, ay - uy * arrowLen - ux * arrowLen * arrowW);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      if (preferences?.showLinkIds !== false) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.font = `${Math.max(8, Math.min(10, mapState.zoom * 350))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(link.id, mx, my - 8);
      }
    }

    const depthFillColor = (ratio: number) => {
      if (ratio >= 0.95) return '#ef4444';
      if (ratio >= 0.75) return '#f59e0b';
      if (ratio >= 0.4) return '#3b82f6';
      return '#60a5fa';
    };

    for (const [nodeId, [nx, ny]] of Object.entries(project.coordinates)) {
      const nType = nodeMap[nodeId]?.type || 'junction';
      if (nType === 'junction' && !isLayerVisible('junctions')) continue;
      if (nType === 'outfall' && !isLayerVisible('outfalls')) continue;
      if (nType === 'storage' && !isLayerVisible('storage')) continue;
      if (nType === 'divider' && !isLayerVisible('dividers')) continue;
      const [sx, sy] = worldToScreen(nx, ny);
      const isSelected = selectedObj?.id === nodeId;
      const r = Math.max(3, Math.min(12, mapState.zoom * 250 * nodeSizeFactor));

      const nodeColor = getNodeColor(nodeId, nType);
      ctx.strokeStyle = isSelected ? '#000000' : 'rgba(0,0,0,0.4)';
      ctx.lineWidth = isSelected ? 2.5 : 1;

      const nr = results && results.timeSteps[timeStep] ? results.timeSteps[timeStep].nodes[nodeId] : null;
      const hasDepthFill = nr && nType !== 'outfall';
      const nodeMaxD = nodeMap[nodeId]?.maxDepth || 4;
      const depthRatio = hasDepthFill ? Math.min(1, Math.max(0, nr.depth / Math.max(nodeMaxD, 0.5))) : 0;

      if (nType === 'storage') {
        ctx.beginPath();
        ctx.rect(sx - r, sy - r, r * 2, r * 2);
        ctx.fillStyle = hasDepthFill ? '#ffffff' : nodeColor;
        ctx.fill();
        if (hasDepthFill && depthRatio > 0) {
          const fillH = r * 2 * depthRatio;
          ctx.fillStyle = depthFillColor(depthRatio);
          ctx.fillRect(sx - r, sy + r - fillH, r * 2, fillH);
        }
        ctx.stroke();
      } else if (nType === 'outfall') {
        ctx.beginPath();
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx + r, sy + r);
        ctx.lineTo(sx - r, sy + r);
        ctx.closePath();
        ctx.fillStyle = nodeColor;
        ctx.fill();
        ctx.stroke();
      } else if (nType === 'divider') {
        ctx.beginPath();
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx + r, sy);
        ctx.lineTo(sx, sy + r);
        ctx.lineTo(sx - r, sy);
        ctx.closePath();
        ctx.fillStyle = hasDepthFill ? '#ffffff' : nodeColor;
        ctx.fill();
        if (hasDepthFill && depthRatio > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(sx, sy - r);
          ctx.lineTo(sx + r, sy);
          ctx.lineTo(sx, sy + r);
          ctx.lineTo(sx - r, sy);
          ctx.closePath();
          ctx.clip();
          const fillH = r * 2 * depthRatio;
          ctx.fillStyle = depthFillColor(depthRatio);
          ctx.fillRect(sx - r, sy + r - fillH, r * 2, fillH);
          ctx.restore();
        }
        ctx.beginPath();
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx + r, sy);
        ctx.lineTo(sx, sy + r);
        ctx.lineTo(sx - r, sy);
        ctx.closePath();
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
        ctx.fillStyle = hasDepthFill ? '#ffffff' : nodeColor;
        ctx.fill();
        if (hasDepthFill && depthRatio > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(sx, sy, r - 0.5, 0, Math.PI * 2);
          ctx.clip();
          const fillH = r * 2 * depthRatio;
          ctx.fillStyle = depthFillColor(depthRatio);
          ctx.fillRect(sx - r, sy + r - fillH, r * 2, fillH);
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (nr && nr.flooding > 0) {
        ctx.save();
        const haloR = r + 6;
        ctx.beginPath();
        ctx.arc(sx, sy, haloR + 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
      } else if (hasDepthFill && depthRatio >= 0.95) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
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

    if (preferences?.showMinimap !== false && (Object.keys(project.coordinates).length > 0 || Object.keys(project.polygons).length > 0)) {
      const mmW = 160;
      const mmH = 120;
      const mmPad = 8;
      const defaultX = canvasSize.w - mmW - mmPad;
      const defaultY = canvasSize.h - mmH - mmPad;
      const mmX = minimapPos ? Math.max(0, Math.min(minimapPos.x, canvasSize.w - mmW)) : defaultX;
      const mmY = minimapPos ? Math.max(0, Math.min(minimapPos.y, canvasSize.h - mmH)) : defaultY;

      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = 'rgba(44,62,107,0.3)';
      ctx.lineWidth = 1;
      ctx.fillRect(mmX, mmY, mmW, mmH);
      ctx.strokeRect(mmX, mmY, mmW, mmH);

      ctx.fillStyle = 'rgba(44,62,107,0.15)';
      ctx.fillRect(mmX, mmY, mmW, 10);
      for (let gi = 0; gi < 3; gi++) {
        ctx.fillStyle = 'rgba(44,62,107,0.25)';
        ctx.fillRect(mmX + mmW / 2 - 8 + gi * 6, mmY + 3.5, 4, 1);
        ctx.fillRect(mmX + mmW / 2 - 8 + gi * 6, mmY + 6, 4, 1);
      }

      const ext = getExtent();
      const dataW = ext.maxX - ext.minX;
      const dataH = ext.maxY - ext.minY;
      const mmScale = Math.min((mmW - 8) / dataW, (mmH - 8) / dataH);
      const mmCx = mmX + mmW / 2;
      const mmCy = mmY + mmH / 2;
      const extCx = (ext.minX + ext.maxX) / 2;
      const extCy = (ext.minY + ext.maxY) / 2;
      const toMmX = (wx: number) => mmCx + (wx - extCx) * mmScale;
      const toMmY = (wy: number) => mmCy - (wy - extCy) * mmScale;

      for (const [, pts] of Object.entries(project.polygons)) {
        if (pts.length < 3) continue;
        ctx.fillStyle = 'rgba(44,110,181,0.12)';
        ctx.beginPath();
        ctx.moveTo(toMmX(pts[0][0]), toMmY(pts[0][1]));
        for (let i = 1; i < pts.length; i++) ctx.lineTo(toMmX(pts[i][0]), toMmY(pts[i][1]));
        ctx.closePath();
        ctx.fill();
      }

      const allMmLinks = [
        ...project.conduits.map(c => ({ from: c.fromNode, to: c.toNode })),
        ...project.pumps.map(p => ({ from: p.fromNode, to: p.toNode })),
        ...project.orifices.map(o => ({ from: o.fromNode, to: o.toNode })),
        ...project.weirs.map(w => ({ from: w.fromNode, to: w.toNode })),
        ...project.outlets.map(o => ({ from: o.fromNode, to: o.toNode })),
      ];
      ctx.strokeStyle = 'rgba(90,122,154,0.5)';
      ctx.lineWidth = 0.8;
      for (const lnk of allMmLinks) {
        const fc = project.coordinates[lnk.from];
        const tc = project.coordinates[lnk.to];
        if (!fc || !tc) continue;
        ctx.beginPath();
        ctx.moveTo(toMmX(fc[0]), toMmY(fc[1]));
        ctx.lineTo(toMmX(tc[0]), toMmY(tc[1]));
        ctx.stroke();
      }

      for (const [, [nx, ny]] of Object.entries(project.coordinates)) {
        ctx.fillStyle = 'rgba(112,146,190,0.8)';
        ctx.beginPath();
        ctx.arc(toMmX(nx), toMmY(ny), 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      const vTL = screenToWorld(0, 0);
      const vBR = screenToWorld(canvasSize.w, canvasSize.h);
      const vpLeft = toMmX(Math.min(vTL[0], vBR[0]));
      const vpRight = toMmX(Math.max(vTL[0], vBR[0]));
      const vpTop = toMmY(Math.max(vTL[1], vBR[1]));
      const vpBottom = toMmY(Math.min(vTL[1], vBR[1]));
      ctx.strokeStyle = '#2c6eb5';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        Math.max(mmX, vpLeft),
        Math.max(mmY, vpTop),
        Math.min(mmW, vpRight - vpLeft),
        Math.min(mmH, vpBottom - vpTop),
      );
      ctx.restore();
    }

  }, [project, selectedObj, showSubcatchments, subcatchTheme, nodeTheme, linkTheme, timeStep, results, mapState, canvasSize, worldToScreen, screenToWorld, getNodeColor, getLinkColor, getLinkWidth, getSubcatchColor, isLayerVisible, preferences, linkDrawState, rubberBandPos, groupSelectPoints, groupSelectedIds, interactionMode, cflFlaggedIds, discretizedJunctionIds, nodeSizeFactor, backdropLoaded, getExtent, minimapPos]);

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

  const getMinimapRect = useCallback(() => {
    if (preferences?.showMinimap === false) return null;
    const mmW = 160, mmH = 120, mmPad = 8;
    const defaultX = canvasSize.w - mmW - mmPad;
    const defaultY = canvasSize.h - mmH - mmPad;
    const mmX = minimapPos ? Math.max(0, Math.min(minimapPos.x, canvasSize.w - mmW)) : defaultX;
    const mmY = minimapPos ? Math.max(0, Math.min(minimapPos.y, canvasSize.h - mmH)) : defaultY;
    return { x: mmX, y: mmY, w: mmW, h: mmH };
  }, [canvasSize, minimapPos, preferences?.showMinimap]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect && e.button === 0) {
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const mm = getMinimapRect();
        if (mm && sx >= mm.x && sx <= mm.x + mm.w && sy >= mm.y && sy <= mm.y + mm.h) {
          draggingMinimap.current = { offsetX: sx - mm.x, offsetY: sy - mm.y };
          e.preventDefault();
          return;
        }
      }

      mouseDownPos.current = { x: e.clientX, y: e.clientY };
      hasDragged.current = false;
      mouseButton.current = e.button;

      if (e.button === 0 && e.ctrlKey && interactionMode === 'select' && selectedObj) {
        const rect2 = canvasRef.current?.getBoundingClientRect();
        if (rect2) {
          const sx = e.clientX - rect2.left;
          const sy = e.clientY - rect2.top;
          const hit = hitTestNode(sx, sy);
          if (hit && hit.nodeId === selectedObj.id) {
            movingNode.current = hit.nodeId;
          }
        }
      }

      e.preventDefault();
    }
  }, [interactionMode, selectedObj, hitTestNode, getMinimapRect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (draggingMinimap.current) {
      setMinimapPos({
        x: sx - draggingMinimap.current.offsetX,
        y: sy - draggingMinimap.current.offsetY,
      });
      return;
    }

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
      if (nType === 'divider' && !isLayerVisible('dividers')) continue;

      const [nsx, nsy] = worldToScreen(nx, ny);
      const d = Math.sqrt((sx - nsx) ** 2 + (sy - nsy) ** 2);
      if (d < hitRadius) {
        let info = '';
        const junc = project.junctions.find(j => j.id === nodeId);
        const outf = project.outfalls.find(o => o.id === nodeId);
        const stor = project.storageUnits.find(s => s.id === nodeId);
        if (nodeTheme === 'elevation') {
          const el = junc?.elevation ?? outf?.elevation ?? stor?.elevation;
          if (el != null) info = `Elev: ${el}`;
        } else if (nodeTheme === 'maxDepth') {
          const md = junc?.maxDepth ?? stor?.maxDepth ?? 0;
          info = `Max Depth: ${md}`;
        } else if (results && results.timeSteps[timeStep]) {
          const nr = results.timeSteps[timeStep].nodes[nodeId];
          if (nr) {
            const stdKeys: Record<string, number> = { depth: nr.depth, head: nr.head, volume: nr.volume, lateralInflow: nr.lateralInflow, totalInflow: nr.totalInflow, flooding: nr.flooding };
            const val = stdKeys[nodeTheme] ?? (nr.extended ? nr.extended[nodeTheme] : undefined);
            if (val !== undefined) {
              const vi = getNodeVarByKey(nodeTheme);
              info = `${vi?.name || nodeTheme}: ${val.toFixed(2)}`;
            }
          }
        }
        if (!info) {
          const el = junc?.elevation ?? outf?.elevation ?? stor?.elevation;
          if (el != null) info = `Elev: ${el}`;
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
          const conduit = project.conduits.find(c => c.id === link.id);
          if (linkTheme === 'roughness' && conduit) {
            info = `N: ${conduit.roughness}`;
          } else if (linkTheme === 'length' && conduit) {
            info = `Length: ${conduit.length}`;
          } else if (linkTheme === 'slope' && conduit) {
            const fn = [...project.junctions, ...project.storageUnits, ...project.outfalls, ...project.dividers].find(n => n.id === conduit.fromNode);
            const tn = [...project.junctions, ...project.storageUnits, ...project.outfalls, ...project.dividers].find(n => n.id === conduit.toNode);
            if (fn && tn && conduit.length > 0) info = `Slope: ${(Math.abs(fn.elevation - tn.elevation) / conduit.length).toFixed(4)}`;
          } else if (linkTheme === 'maxDepth') {
            const xs = Array.isArray(project.xsections)
              ? project.xsections.find((x: any) => x.linkId === link.id)
              : (project.xsections as Record<string, any>)[link.id];
            if (xs && typeof xs.geom1 === 'number') info = `Max Depth: ${xs.geom1}`;
          } else if (results && results.timeSteps[timeStep]) {
            const lr = results.timeSteps[timeStep].links[link.id];
            if (lr) {
              const stdKeys: Record<string, number> = { flow: lr.flow, velocity: lr.velocity, depth: lr.depth, volume: lr.volume, capacity: lr.capacity };
              const val = stdKeys[linkTheme] ?? (lr.extended ? lr.extended[linkTheme] : undefined);
              if (val !== undefined) {
                const vi = getLinkVarByKey(linkTheme);
                info = linkTheme === 'capacity' ? `Cap: ${(val * 100).toFixed(0)}%` : `${vi?.name || linkTheme}: ${val.toFixed(2)}`;
              }
            }
          }
          if (!info) {
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
          const sc = project.subcatchments.find(s => s.id === scId);
          if (subcatchTheme === 'imperv' && sc) {
            info = `Imperv: ${sc.pctImperv.toFixed(1)}%`;
          } else if (subcatchTheme === 'area' && sc) {
            info = `Area: ${sc.area}`;
          } else if (subcatchTheme === 'width' && sc) {
            info = `Width: ${sc.width}`;
          } else if (subcatchTheme === 'slope' && sc) {
            info = `Slope: ${sc.slope}%`;
          } else if (results && results.timeSteps[timeStep]) {
            const sr = results.timeSteps[timeStep].subcatchments[scId];
            if (sr) {
              const stdKeys: Record<string, number> = { runoff: sr.runoff, rainfall: sr.rainfall, infiltration: sr.infiltration, snowDepth: sr.snowDepth, evap: sr.evap, gwOutflow: sr.gwOutflow, gwElev: sr.gwElev, moisture: sr.moisture };
              const val = stdKeys[subcatchTheme] ?? (sr.extended ? sr.extended[subcatchTheme] : undefined);
              if (val !== undefined) {
                const vi = getSubVarByKey(subcatchTheme);
                info = `${vi?.name || subcatchTheme}: ${val.toFixed(3)}`;
              }
            }
          }
          if (!info && sc) {
            info = `Area: ${sc.area}`;
          }
          setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 8, id: scId, info });
          return;
        }
      }
    }

    setTooltip(null);
  }, [project, worldToScreen, screenToWorld, isLayerVisible, showSubcatchments, results, timeStep, nodeTheme, linkTheme, subcatchTheme, linkDrawState, interactionMode, groupSelectPoints, onMoveNode]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (draggingMinimap.current) {
      draggingMinimap.current = null;
      return;
    }
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

    const isNodeCreationMode = interactionMode === 'addJunction' || interactionMode === 'addOutfall' || interactionMode === 'addStorage' || interactionMode === 'addDivider' || interactionMode === 'addRaingage';
    if (isNodeCreationMode && onCreateNode) {
      const [wx, wy] = screenToWorld(sx, sy);
      onCreateNode(wx, wy, interactionMode);
      return;
    }

    if (interactionMode === 'addSubcatchment') {
      const [wx, wy] = screenToWorld(sx, sy);
      onGroupSelectPoint?.(wx, wy);
      return;
    }

    const isLinkCreationMode = interactionMode === 'addConduit' || interactionMode === 'addPump' || interactionMode === 'addOrifice' || interactionMode === 'addWeir' || interactionMode === 'addOutlet';
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

    if ((interactionMode === 'groupSelect' || interactionMode === 'addSubcatchment') && groupSelectPoints && groupSelectPoints.length >= 3) {
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
    draggingMinimap.current = null;
    setTooltip(null);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if ((interactionMode === 'groupSelect' || interactionMode === 'addSubcatchment') && groupSelectPoints && groupSelectPoints.length >= 3) {
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
          onSelectObj?.({ id: hitNode.nodeId, objType: hitNode.nodeType as any });
        } else if (hitLink) {
          onSelectObj?.({ id: hitLink.linkId, objType: hitLink.linkType as any });
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

  const cycleSelection = useCallback((dir: 1 | -1) => {
    const nodeEntries = Object.keys(project.coordinates).map(id => ({
      id,
      objType: project.outfalls.find(o => o.id === id) ? 'outfall'
        : project.storageUnits.find(s => s.id === id) ? 'storage'
        : project.dividers.find(d => d.id === id) ? 'divider'
        : 'junction',
    }));
    const linkEntries = [
      ...project.conduits.map(c => ({ id: c.id, objType: 'conduit' })),
      ...project.pumps.map(p => ({ id: p.id, objType: 'pump' })),
      ...project.orifices.map(o => ({ id: o.id, objType: 'orifice' })),
      ...project.weirs.map(w => ({ id: w.id, objType: 'weir' })),
      ...project.outlets.map(o => ({ id: o.id, objType: 'outlet' })),
    ];
    const all = [...nodeEntries, ...linkEntries];
    if (all.length === 0) return;
    const curIdx = selectedObj ? all.findIndex(o => o.id === selectedObj.id && o.objType === selectedObj.objType) : -1;
    let idx: number;
    if (curIdx === -1) {
      idx = dir === 1 ? 0 : all.length - 1;
    } else {
      idx = (curIdx + dir + all.length) % all.length;
    }
    const next = all[idx];
    onSelectObj({ id: next.id, objType: next.objType as any });
    const coord = project.coordinates[next.id];
    if (coord) {
      centerOnWorld(coord[0], coord[1]);
    } else {
      const link = [...project.conduits, ...project.pumps, ...project.orifices, ...project.weirs, ...project.outlets].find(l => l.id === next.id);
      if (link) {
        const f = project.coordinates[link.fromNode];
        const t = project.coordinates[link.toNode];
        if (f && t) centerOnWorld((f[0] + t[0]) / 2, (f[1] + t[1]) / 2);
      }
    }
  }, [project, selectedObj, onSelectObj, centerOnWorld]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const panStep = 60;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        setMapState(prev => ({ ...prev, panX: prev.panX + panStep }));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setMapState(prev => ({ ...prev, panX: prev.panX - panStep }));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setMapState(prev => ({ ...prev, panY: prev.panY + panStep }));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setMapState(prev => ({ ...prev, panY: prev.panY - panStep }));
        break;
      case '+':
      case '=':
        e.preventDefault();
        setMapState(prev => ({
          zoom: prev.zoom * 1.2,
          panX: canvasSize.w / 2 - (canvasSize.w / 2 - prev.panX) * 1.2,
          panY: canvasSize.h / 2 - (canvasSize.h / 2 - prev.panY) * 1.2,
        }));
        break;
      case '-':
      case '_':
        e.preventDefault();
        setMapState(prev => ({
          zoom: prev.zoom / 1.2,
          panX: canvasSize.w / 2 - (canvasSize.w / 2 - prev.panX) / 1.2,
          panY: canvasSize.h / 2 - (canvasSize.h / 2 - prev.panY) / 1.2,
        }));
        break;
      case 'Home':
        e.preventDefault();
        fitExtent();
        break;
      case ']':
        e.preventDefault();
        cycleSelection(1);
        break;
      case '[':
        e.preventDefault();
        cycleSelection(-1);
        break;
    }
  }, [canvasSize, fitExtent, cycleSelection]);

  const cursorStyle = interactionMode === 'addJunction' || interactionMode === 'addOutfall' || interactionMode === 'addStorage' || interactionMode === 'addDivider' || interactionMode === 'addRaingage'
    ? 'copy'
    : interactionMode === 'addConduit' || interactionMode === 'addPump' || interactionMode === 'addOrifice' || interactionMode === 'addWeir' || interactionMode === 'addOutlet'
    ? (linkDrawState ? 'crosshair' : 'cell')
    : interactionMode === 'groupSelect' || interactionMode === 'addSubcatchment'
    ? 'crosshair'
    : interactionMode === 'measure'
    ? 'crosshair'
    : 'crosshair';

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      style={{ touchAction: 'none' }}
      data-testid="network-map-container"
      tabIndex={0}
      role="application"
      aria-label="Network map. Use arrow keys to pan, plus and minus to zoom, Home to fit the network, and square brackets to cycle object selection."
      onKeyDown={handleKeyDown}
    >
      <div aria-live="polite" className="sr-only" data-testid="map-selection-announcer">
        {selectedObj ? `Selected ${selectedObj.objType} ${selectedObj.id}` : 'No object selected'}
      </div>
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
