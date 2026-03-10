import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { SwmmProject, SelectedObject, SimulationResults } from '@/lib/swmm-types';
import { createEmptyProject } from '@/lib/swmm-types';
import { parseInpFile, SAMPLE_INP } from '@/lib/inp-parser';
import { createMockEngine, createRemoteEngine, createLocalEngine, checkRemoteEngine, checkLocalEngine } from '@/lib/swmm-engine';
import { computeCflAnalysis, discretizeProject, getDefaultSettings } from '@/lib/cfl-analysis';
import type { CflAnalysisResult, DiscretizationSettings, DiscretizationResult } from '@/lib/cfl-analysis';
import type { SwmmEngine } from '@/lib/swmm-engine';
import NetworkMap, { type NetworkMapHandle } from '@/components/swmm/NetworkMap';
import { LegendPanel, ProjectExplorer, ObjectLocatorPanel, MapQueryPanel, evaluateQuery } from '@/components/swmm/Panels';
import type { MapQuery } from '@/components/swmm/Panels';
import SpeedBar from '@/components/swmm/SpeedBar';
import type { InteractionMode } from '@/components/swmm/SpeedBar';
import { useToast } from '@/hooks/use-toast';
import {
  FolderOpen, Save, FilePlus, Play, Pause, Download, Upload, Settings,
  ZoomIn, ZoomOut, Maximize, Info, HelpCircle, FileText, Clipboard,
  ArrowLeftRight, Trash2, Search, BarChart3, List, Github,
  Loader2, Check, AlertTriangle, Copy, ClipboardPaste, RotateCcw, X, BookOpen,
  Scissors, ChevronLeft, Folder, File, PanelLeftOpen, PanelRightOpen, Menu,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface SwmmPreferences {
  flyoverHints: boolean;
  confirmDeletions: boolean;
  numericalPrecision: number;
  blinkingMapMarker: boolean;
  showNodeIds: boolean;
  showLinkIds: boolean;
  mapBackgroundColor: string;
}

const DEFAULT_PREFERENCES: SwmmPreferences = {
  flyoverHints: true,
  confirmDeletions: true,
  numericalPrecision: 2,
  blinkingMapMarker: true,
  showNodeIds: true,
  showLinkIds: true,
  mapBackgroundColor: '#ffffff',
};

function loadPreferences(): SwmmPreferences {
  try {
    const stored = localStorage.getItem('swmm5-preferences');
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch {}
  return { ...DEFAULT_PREFERENCES };
}

function savePreferences(prefs: SwmmPreferences) {
  localStorage.setItem('swmm5-preferences', JSON.stringify(prefs));
}

type MenuTab = 'File' | 'Edit' | 'View' | 'Map' | 'Project' | 'Help';

interface ContextMenuState {
  x: number;
  y: number;
  obj: SelectedObject;
}

interface LinkDrawState {
  fromNodeId: string;
  vertices: [number, number][];
}

export default function SwmmUI() {
  const { toast } = useToast();
  const [project, setProject] = useState<SwmmProject>(() => parseInpFile(SAMPLE_INP));
  const [fileName, setFileName] = useState('Example_Network.inp');
  const [activeMenu, setActiveMenu] = useState<MenuTab>('Project');
  const [selectedObj, setSelectedObj] = useState<SelectedObject>(null);
  const [showSubcatch, setShowSubcatch] = useState(true);
  const [subcatchTheme, setSubcatchTheme] = useState('imperv');
  const [nodeTheme, setNodeTheme] = useState('depth');
  const [linkTheme, setLinkTheme] = useState('flow');
  const [timeStep, setTimeStep] = useState(0);
  const [simStatus, setSimStatus] = useState<'none' | 'running' | 'current' | 'outdated'>('none');
  const [simProgress, setSimProgress] = useState(0);
  const [simProgressMsg, setSimProgressMsg] = useState('');
  const [engineMode, setEngineMode] = useState<'mock' | 'remote' | 'local'>('mock');
  const [localAvailable, setLocalAvailable] = useState(false);
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [isAnimating, setIsAnimating] = useState(false);
  const [openDialog, setOpenDialog] = useState<'file' | 'github' | 'preferences' | 'export' | 'groupEdit' | null>(null);
  const [githubUrl, setGithubUrl] = useState('https://github.com/SWMMEnablement/1729-SWMM5-Models');
  const [ghBrowseOwner] = useState('SWMMEnablement');
  const [ghBrowseRepo] = useState('1729-SWMM5-Models');
  const [ghBrowsePath, setGhBrowsePath] = useState('');
  const [ghBrowseItems, setGhBrowseItems] = useState<{name:string;type:string;path:string;size?:number;download_url?:string}[]>([]);
  const [ghBrowseLoading, setGhBrowseLoading] = useState(false);
  const [ghBrowseError, setGhBrowseError] = useState('');
  const [preferences, setPreferences] = useState<SwmmPreferences>(loadPreferences);

  const updatePreference = useCallback(<K extends keyof SwmmPreferences>(key: K, value: SwmmPreferences[K]) => {
    setPreferences(prev => {
      const next = { ...prev, [key]: value };
      savePreferences(next);
      return next;
    });
  }, []);
  const [loading, setLoading] = useState(false);
  const [showSamplesMenu, setShowSamplesMenu] = useState(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const [showLocator, setShowLocator] = useState(false);
  const [showQueryPanel, setShowQueryPanel] = useState(false);
  const [mapQuery, setMapQuery] = useState<MapQuery>({
    objectType: 'node',
    property: 'elevation',
    operator: '>',
    value: 0,
    active: false,
  });
  const [exportIncludeLegend, setExportIncludeLegend] = useState(true);
  const [showCflPanel, setShowCflPanel] = useState(false);
  const [cflAnalysis, setCflAnalysis] = useState<CflAnalysisResult | null>(null);
  const [cflShowFlagged, setCflShowFlagged] = useState(true);
  const [discretizationResult, setDiscretizationResult] = useState<DiscretizationResult | null>(null);
  const [discretizationSettings, setDiscretizationSettings] = useState<DiscretizationSettings>(getDefaultSettings);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [linkDrawState, setLinkDrawState] = useState<LinkDrawState | null>(null);
  const [copiedObj, setCopiedObj] = useState<{ objType: string; props: any } | null>(null);
  const [groupSelectPoints, setGroupSelectPoints] = useState<[number, number][]>([]);
  const [groupSelectedIds, setGroupSelectedIds] = useState<Set<string> | null>(null);
  const [groupEditProp, setGroupEditProp] = useState('elevation');
  const [groupEditValue, setGroupEditValue] = useState('0');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [mobilePanel, setMobilePanel] = useState<'none' | 'left' | 'right'>('none');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const animRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const networkMapRef = useRef<NetworkMapHandle>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const maxTimeStep = results ? results.timeSteps.length - 1 : 0;

  const queryMatchIds = useMemo(() => {
    if (!mapQuery.active) return null;
    return evaluateQuery(mapQuery, project);
  }, [mapQuery, project]);
  const queryObjectType = mapQuery.active ? mapQuery.objectType : null;

  const handleFileOpen = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseInpFile(text);
      setProject(parsed);
      setFileName(file.name);
      setResults(null);
      setSimStatus('none');
      setTimeStep(0);
      setSelectedObj(null);
      toast({ title: 'File Loaded', description: `${file.name} loaded successfully` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setOpenDialog(null);
  }, [toast]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileOpen(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [handleFileOpen]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.inp') || file.name.endsWith('.INP'))) {
      handleFileOpen(file);
    }
  }, [handleFileOpen]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleGithubLoad = useCallback(async () => {
    if (!githubUrl.trim()) return;
    const url = githubUrl.trim();
    const repoPattern = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/;
    const match = url.match(repoPattern);
    if (match) {
      toast({ title: 'Repo URL Detected', description: 'Use the file browser above to pick an INP file from this repository' });
      return;
    }
    if (!url.toLowerCase().endsWith('.inp')) {
      toast({ title: 'Invalid URL', description: 'URL must point to a .inp file', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      let fetchUrl = url;
      if (fetchUrl.includes('github.com') && !fetchUrl.includes('raw.githubusercontent.com')) {
        fetchUrl = fetchUrl
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/blob/', '/');
      }
      const resp = await fetch(`/api/fetch-github?url=${encodeURIComponent(fetchUrl)}`);
      if (!resp.ok) throw new Error(`Failed to fetch: ${resp.statusText}`);
      const text = await resp.text();
      const parsed = parseInpFile(text);
      const name = fetchUrl.split('/').pop() || 'github_file.inp';
      setProject(parsed);
      setFileName(name);
      setResults(null);
      setSimStatus('none');
      setTimeStep(0);
      setSelectedObj(null);
      toast({ title: 'File Loaded', description: `${name} loaded from GitHub` });
      setOpenDialog(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [githubUrl, toast]);

  const ghBrowse = useCallback(async (path: string) => {
    setGhBrowseLoading(true);
    setGhBrowseError('');
    try {
      const resp = await fetch(`/api/github-browse?owner=${ghBrowseOwner}&repo=${ghBrowseRepo}&path=${encodeURIComponent(path)}`);
      if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);
      const items = await resp.json();
      setGhBrowseItems(items);
      setGhBrowsePath(path);
    } catch (e: any) {
      setGhBrowseError(e.message);
    }
    setGhBrowseLoading(false);
  }, [ghBrowseOwner, ghBrowseRepo]);

  const handleGhFileSelect = useCallback(async (item: {name:string;path:string;download_url?:string}) => {
    const dlUrl = item.download_url || `https://raw.githubusercontent.com/${ghBrowseOwner}/${ghBrowseRepo}/main/${item.path}`;
    setLoading(true);
    try {
      const resp = await fetch(`/api/fetch-github?url=${encodeURIComponent(dlUrl)}`);
      if (!resp.ok) throw new Error(`Failed to fetch: ${resp.statusText}`);
      const text = await resp.text();
      const parsed = parseInpFile(text);
      setProject(parsed);
      setFileName(item.name);
      setResults(null);
      setSimStatus('none');
      setTimeStep(0);
      setSelectedObj(null);
      toast({ title: 'File Loaded', description: `${item.name} loaded from GitHub` });
      setOpenDialog(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast, ghBrowseOwner, ghBrowseRepo]);

  const handleNewProject = useCallback(() => {
    setProject(createEmptyProject());
    setFileName('Untitled.inp');
    setResults(null);
    setReportContent(null);
    setSimStatus('none');
    setTimeStep(0);
    setSelectedObj(null);
  }, []);

  const handleLoadSample = useCallback(async (sampleName: string) => {
    setLoading(true);
    try {
      const resp = await fetch(`/samples/${sampleName}`);
      if (!resp.ok) throw new Error(`Failed to load sample: ${resp.statusText}`);
      const text = await resp.text();
      const parsed = parseInpFile(text);
      setProject(parsed);
      setFileName(sampleName);
      setResults(null);
      setSimStatus('none');
      setTimeStep(0);
      setSelectedObj(null);
      toast({ title: 'Sample Loaded', description: `${sampleName} loaded successfully` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast]);

  const handleSave = useCallback(async () => {
    const { projectToInp } = await import('@/lib/inp-parser');
    const text = projectToInp(project);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Saved', description: `${fileName} downloaded` });
  }, [project, fileName, toast]);

  const handleLocateObject = useCallback((objType: string, id: string) => {
    type ObjType = 'junction' | 'outfall' | 'divider' | 'storage' | 'conduit' | 'pump' | 'orifice' | 'weir' | 'outlet' | 'subcatchment' | 'raingage' | 'label';
    const objTypeMap: Record<string, ObjType | undefined> = {
      junction: 'junction', outfall: 'outfall', storage: 'storage', divider: 'divider',
      conduit: 'conduit', pump: 'pump', orifice: 'orifice', weir: 'weir', outlet: 'outlet',
      subcatchment: 'subcatchment', raingage: 'raingage',
    };
    const mappedType = objTypeMap[objType];
    if (!mappedType) return;

    setSelectedObj({ id, objType: mappedType });

    let wx: number | undefined;
    let wy: number | undefined;

    if (['junction', 'outfall', 'storage', 'divider'].includes(objType)) {
      const coord = project.coordinates[id];
      if (coord) { wx = coord[0]; wy = coord[1]; }
    } else if (['conduit', 'pump', 'orifice', 'weir', 'outlet'].includes(objType)) {
      const allLinks = [...project.conduits, ...project.pumps, ...project.orifices, ...project.weirs, ...project.outlets];
      const link = allLinks.find((l: any) => l.id === id);
      if (link) {
        const fromCoord = project.coordinates[(link as any).fromNode];
        const toCoord = project.coordinates[(link as any).toNode];
        if (fromCoord && toCoord) {
          wx = (fromCoord[0] + toCoord[0]) / 2;
          wy = (fromCoord[1] + toCoord[1]) / 2;
        }
      }
    } else if (objType === 'subcatchment') {
      const poly = project.polygons[id];
      if (poly && poly.length > 0) {
        wx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
        wy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
      }
    } else if (objType === 'raingage') {
      const sym = project.symbols[id];
      if (sym) { wx = sym[0]; wy = sym[1]; }
    }

    if (wx !== undefined && wy !== undefined) {
      networkMapRef.current?.centerOnWorld(wx, wy);
    }
  }, [project]);

  const simAbortRef = useRef<AbortController | null>(null);

  const handleRunSimulation = useCallback(async () => {
    setSimStatus('running');
    setSimProgress(0);
    setSimProgressMsg('Initializing...');

    const abortCtrl = new AbortController();
    simAbortRef.current = abortCtrl;

    const engine: SwmmEngine = engineMode === 'local' ? createLocalEngine() : engineMode === 'remote' ? createRemoteEngine() : createMockEngine();

    let progressInterval: ReturnType<typeof setInterval> | null = null;
    if (engine.mode === 'mock') {
      progressInterval = setInterval(() => {
        if (abortCtrl.signal.aborted) return;
        setSimProgress(prev => Math.min(prev + 3, 95));
      }, 50);
    }

    try {
      const res = await engine.run(project, (pct, msg) => {
        if (abortCtrl.signal.aborted) return;
        setSimProgress(pct);
        setSimProgressMsg(msg);
      });
      if (progressInterval) clearInterval(progressInterval);
      if (abortCtrl.signal.aborted) return;
      setSimProgress(100);
      setSimProgressMsg('Complete');
      setResults(res);
      setReportContent(res.reportContent || null);
      setSimStatus('current');
      setTimeStep(0);
      const engineLabel = engine.mode === 'local' ? 'EPA SWMM 5.2.4 (Local)' : engine.mode === 'remote' ? 'EPA SWMM 5.2.4 (Remote)' : 'Mock Engine';
      toast({ title: 'Simulation Complete', description: `${res.timeSteps.length} time steps computed (${engineLabel})` });
    } catch (e: any) {
      if (progressInterval) clearInterval(progressInterval);
      if (abortCtrl.signal.aborted) {
        setSimStatus('none');
        setSimProgressMsg('');
        toast({ title: 'Simulation Stopped', description: 'Simulation was cancelled by user' });
        return;
      }
      setSimStatus('none');
      setSimProgressMsg('');
      if (e.reportContent != null && e.reportContent !== '') {
        setReportContent(e.reportContent);
        setShowReportDialog(true);
      }
      toast({ title: 'Simulation Error', description: e.message, variant: 'destructive' });
    } finally {
      simAbortRef.current = null;
    }
  }, [project, toast, engineMode]);

  const handleStopSimulation = useCallback(() => {
    if (simAbortRef.current) {
      simAbortRef.current.abort();
      setSimStatus('none');
      setSimProgress(0);
      setSimProgressMsg('');
    }
  }, []);

  const buildExportCanvas = useCallback(async (includeLegend: boolean): Promise<HTMLCanvasElement | null> => {
    const mapCanvas = networkMapRef.current?.getCanvas();
    if (!mapCanvas) return null;

    if (!includeLegend) return mapCanvas;

    const exportCanvas = document.createElement('canvas');
    const legendWidth = 170;
    exportCanvas.width = mapCanvas.width + legendWidth;
    exportCanvas.height = mapCanvas.height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return mapCanvas;

    ctx.drawImage(mapCanvas, 0, 0);

    ctx.fillStyle = '#f8f8fa';
    ctx.fillRect(mapCanvas.width, 0, legendWidth, mapCanvas.height);

    ctx.strokeStyle = '#d0d0d8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mapCanvas.width, 0);
    ctx.lineTo(mapCanvas.width, mapCanvas.height);
    ctx.stroke();

    const x = mapCanvas.width + 12;
    let y = 20;

    ctx.fillStyle = '#2a2a3e';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText('Legend', x, y);
    y += 24;

    const legendColors = ['#7092BE', '#99D9EA', '#B5E61D', '#FFC90E', '#FF7F27'];
    const nodeLabel = nodeTheme === 'depth' ? 'Node Depth' : 'Node Head';
    const linkLabel = linkTheme === 'flow' ? 'Link Flow' : linkTheme === 'velocity' ? 'Link Velocity' : 'Link Depth';

    ctx.fillStyle = '#6b6b7b';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(nodeLabel, x, y);
    y += 14;
    legendColors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 10, 10);
      ctx.fillStyle = '#2a2a3e';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`Level ${i + 1}`, x + 16, y + 9);
      y += 14;
    });
    y += 8;

    ctx.fillStyle = '#6b6b7b';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(linkLabel, x, y);
    y += 14;
    legendColors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 10, 10);
      ctx.fillStyle = '#2a2a3e';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(`Level ${i + 1}`, x + 16, y + 9);
      y += 14;
    });

    return exportCanvas;
  }, [nodeTheme, linkTheme]);

  const handleExportToFile = useCallback(async () => {
    const canvas = await buildExportCanvas(exportIncludeLegend);
    if (!canvas) {
      toast({ title: 'Export Failed', description: 'No map canvas available', variant: 'destructive' });
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace(/\.inp$/i, '') + '_map.png';
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Exported', description: 'Map saved as PNG file' });
    }, 'image/png');
    setOpenDialog(null);
  }, [buildExportCanvas, exportIncludeLegend, fileName, toast]);

  const handleExportToClipboard = useCallback(async () => {
    const canvas = await buildExportCanvas(exportIncludeLegend);
    if (!canvas) {
      toast({ title: 'Export Failed', description: 'No map canvas available', variant: 'destructive' });
      return;
    }
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Failed to create image blob');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast({ title: 'Copied', description: 'Map copied to clipboard as PNG' });
    } catch (e: any) {
      toast({ title: 'Clipboard Error', description: e.message || 'Failed to copy to clipboard', variant: 'destructive' });
    }
    setOpenDialog(null);
  }, [buildExportCanvas, exportIncludeLegend, toast]);

  useEffect(() => {
    checkLocalEngine().then(available => {
      setLocalAvailable(available);
      if (available) {
        setEngineMode('local');
      }
    });
    checkRemoteEngine().then(available => {
      setRemoteAvailable(available);
      if (available && !localAvailable) setEngineMode('remote');
    });
  }, []);

  const justDiscretizedRef = useRef(false);

  useEffect(() => {
    if (project.conduits.length > 0) {
      const analysis = computeCflAnalysis(project);
      setCflAnalysis(analysis);
    } else {
      setCflAnalysis(null);
    }
    if (justDiscretizedRef.current) {
      justDiscretizedRef.current = false;
    } else {
      setDiscretizationResult(null);
    }
  }, [project]);

  const cflFlaggedIds = useMemo(() => {
    if (!cflAnalysis || !cflShowFlagged || cflAnalysis.flaggedCount === 0) return null;
    const ids = new Set<string>();
    for (const c of cflAnalysis.conduits) {
      if (c.violatesCfl) ids.add(c.conduitId);
    }
    return ids;
  }, [cflAnalysis, cflShowFlagged]);

  const handleDiscretize = useCallback(() => {
    const flagged = new Set<string>();
    if (cflAnalysis) {
      for (const c of cflAnalysis.conduits) {
        if (c.violatesCfl) flagged.add(c.conduitId);
      }
    }
    const result = discretizeProject(project, discretizationSettings, flagged.size > 0 ? flagged : undefined);
    justDiscretizedRef.current = true;
    setProject(result.project);
    setDiscretizationResult(result);
    setResults(null);
    setReportContent(null);
    setSimStatus('none');
    setTimeStep(0);
    toast({
      title: 'Discretization Complete',
      description: `${result.stats.splitCount} conduits split, ${result.stats.newJunctionCount} junctions added`,
    });
  }, [project, discretizationSettings, toast, cflAnalysis]);

  useEffect(() => {
    if (!isAnimating || !results) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    let lastTime = 0;
    const animate = (time: number) => {
      if (time - lastTime > 150) {
        lastTime = time;
        setTimeStep(prev => (prev + 1) % results.timeSteps.length);
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isAnimating, results]);

  const menus: MenuTab[] = ['File', 'Edit', 'View', 'Map', 'Project', 'Help'];

  const deleteObject = useCallback((obj: NonNullable<SelectedObject>) => {
    setProject(prev => {
      const next = { ...prev };
      const id = obj.id;
      const t = obj.objType;
      if (t === 'junction') next.junctions = prev.junctions.filter(j => j.id !== id);
      else if (t === 'outfall') next.outfalls = prev.outfalls.filter(o => o.id !== id);
      else if (t === 'storage') next.storageUnits = prev.storageUnits.filter(s => s.id !== id);
      else if (t === 'divider') next.dividers = prev.dividers.filter(d => d.id !== id);
      else if (t === 'conduit') next.conduits = prev.conduits.filter(c => c.id !== id);
      else if (t === 'pump') next.pumps = prev.pumps.filter(p => p.id !== id);
      else if (t === 'orifice') next.orifices = prev.orifices.filter(o => o.id !== id);
      else if (t === 'weir') next.weirs = prev.weirs.filter(w => w.id !== id);
      else if (t === 'outlet') next.outlets = prev.outlets.filter(o => o.id !== id);
      else if (t === 'subcatchment') {
        next.subcatchments = prev.subcatchments.filter(s => s.id !== id);
        const newPolygons = { ...prev.polygons };
        delete newPolygons[id];
        next.polygons = newPolygons;
      }
      if (['junction', 'outfall', 'storage', 'divider'].includes(t)) {
        const newCoords = { ...prev.coordinates };
        delete newCoords[id];
        next.coordinates = newCoords;
        next.conduits = prev.conduits.filter(c => c.fromNode !== id && c.toNode !== id);
        next.pumps = prev.pumps.filter(p => p.fromNode !== id && p.toNode !== id);
        next.orifices = prev.orifices.filter(o => o.fromNode !== id && o.toNode !== id);
        next.weirs = prev.weirs.filter(w => w.fromNode !== id && w.toNode !== id);
        next.outlets = prev.outlets.filter(o => o.fromNode !== id && o.toNode !== id);
        const removedLinks = [
          ...prev.conduits.filter(c => c.fromNode === id || c.toNode === id),
          ...prev.pumps.filter(p => p.fromNode === id || p.toNode === id),
          ...prev.orifices.filter(o => o.fromNode === id || o.toNode === id),
          ...prev.weirs.filter(w => w.fromNode === id || w.toNode === id),
          ...prev.outlets.filter(o => o.fromNode === id || o.toNode === id),
        ];
        const newVerts = { ...prev.vertices };
        const newXsections = { ...prev.xsections };
        const newLosses = { ...prev.losses };
        for (const rl of removedLinks) {
          delete newVerts[rl.id];
          delete newXsections[rl.id];
          delete newLosses[rl.id];
        }
        next.vertices = newVerts;
        next.xsections = newXsections;
        next.losses = newLosses;
      }
      if (['conduit', 'pump', 'orifice', 'weir', 'outlet'].includes(t)) {
        const newVerts = { ...prev.vertices };
        const newXsections = { ...prev.xsections };
        const newLosses = { ...prev.losses };
        delete newVerts[id];
        delete newXsections[id];
        delete newLosses[id];
        next.vertices = newVerts;
        next.xsections = newXsections;
        next.losses = newLosses;
      }
      return next;
    });
    setSelectedObj(null);
  }, []);

  const handleDelete = useCallback(() => {
    if (!selectedObj) return;
    deleteObject(selectedObj);
  }, [selectedObj, deleteObject]);

  const handleFullExtent = useCallback(() => {
    networkMapRef.current?.fitExtent();
  }, []);

  const generateId = useCallback((prefix: string, existing: string[]) => {
    let i = 1;
    while (existing.includes(`${prefix}${i}`)) i++;
    return `${prefix}${i}`;
  }, []);

  const handleCreateNode = useCallback((wx: number, wy: number, mode: string) => {
    setProject(prev => {
      const next = { ...prev };
      const allIds = Object.keys(prev.coordinates);
      let id: string;
      if (mode === 'addJunction') {
        id = generateId('J', allIds);
        next.junctions = [...prev.junctions, { id, elevation: 0, maxDepth: 0, initDepth: 0, surDepth: 0, aponded: 0 }];
      } else if (mode === 'addOutfall') {
        id = generateId('OF', allIds);
        next.outfalls = [...prev.outfalls, { id, elevation: 0, type: 'FREE', gated: 'NO' }];
      } else if (mode === 'addStorage') {
        id = generateId('SU', allIds);
        next.storageUnits = [...prev.storageUnits, { id, elevation: 0, maxDepth: 10, initDepth: 0, shape: 'TABULAR', curveParams: [], surDepth: 0, fevap: 0 }];
      } else return prev;

      next.coordinates = { ...prev.coordinates, [id]: [wx, wy] };
      return next;
    });
    toast({ title: 'Node Created', description: `New ${mode.replace('add', '')} placed on map` });
  }, [generateId, toast]);

  const handleStartLink = useCallback((nodeId: string) => {
    setLinkDrawState({ fromNodeId: nodeId, vertices: [] });
  }, []);

  const handleCompleteLink = useCallback((toNodeId: string, vertices: [number, number][]) => {
    if (!linkDrawState) return;
    const fromId = linkDrawState.fromNodeId;
    setProject(prev => {
      const next = { ...prev };
      const allLinkIds = [...prev.conduits, ...prev.pumps, ...prev.orifices, ...prev.weirs, ...prev.outlets].map(l => l.id);

      if (interactionMode === 'addConduit') {
        const id = generateId('C', allLinkIds);
        const fromCoord = prev.coordinates[fromId];
        const toCoord = prev.coordinates[toNodeId];
        let length = 400;
        if (fromCoord && toCoord) {
          length = Math.round(Math.sqrt((toCoord[0] - fromCoord[0]) ** 2 + (toCoord[1] - fromCoord[1]) ** 2));
        }
        next.conduits = [...prev.conduits, { id, fromNode: fromId, toNode: toNodeId, length, roughness: 0.01, inOffset: 0, outOffset: 0, initFlow: 0, maxFlow: 0 }];
        next.xsections = { ...prev.xsections, [id]: { linkId: id, shape: 'CIRCULAR', geom1: 1, geom2: 0, geom3: 0, geom4: 0, barrels: 1 } };
        if (vertices.length > 0) {
          next.vertices = { ...prev.vertices, [id]: vertices };
        }
      } else if (interactionMode === 'addPump') {
        const id = generateId('P', allLinkIds);
        next.pumps = [...prev.pumps, { id, fromNode: fromId, toNode: toNodeId, pumpCurve: '*', status: 'ON' }];
        if (vertices.length > 0) {
          next.vertices = { ...prev.vertices, [id]: vertices };
        }
      }
      return next;
    });
    setLinkDrawState(null);
    toast({ title: 'Link Created', description: `New ${interactionMode === 'addConduit' ? 'Conduit' : 'Pump'} drawn` });
  }, [linkDrawState, interactionMode, generateId, toast]);

  const handleAddLinkVertex = useCallback((wx: number, wy: number) => {
    setLinkDrawState(prev => {
      if (!prev) return prev;
      return { ...prev, vertices: [...prev.vertices, [wx, wy]] };
    });
  }, []);

  const handleMoveNode = useCallback((nodeId: string, wx: number, wy: number) => {
    setProject(prev => ({
      ...prev,
      coordinates: { ...prev.coordinates, [nodeId]: [wx, wy] },
    }));
  }, []);

  const handleContextMenu = useCallback((screenX: number, screenY: number, obj: SelectedObject) => {
    setContextMenu({ x: screenX, y: screenY, obj });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleCopy = useCallback(() => {
    const target = contextMenu?.obj || selectedObj;
    if (!target) return;
    const t = target.objType;
    const id = target.id;
    let props: any = null;
    if (t === 'junction') props = project.junctions.find(j => j.id === id);
    else if (t === 'outfall') props = project.outfalls.find(o => o.id === id);
    else if (t === 'storage') props = project.storageUnits.find(s => s.id === id);
    else if (t === 'conduit') props = project.conduits.find(c => c.id === id);
    else if (t === 'pump') props = project.pumps.find(p => p.id === id);
    if (props) {
      setCopiedObj({ objType: t, props: { ...props } });
      toast({ title: 'Copied', description: `${t} ${id} properties copied` });
    }
    closeContextMenu();
  }, [contextMenu, selectedObj, project, toast, closeContextMenu]);

  const handlePaste = useCallback(() => {
    const target = contextMenu?.obj || selectedObj;
    if (!copiedObj || !target || copiedObj.objType !== target.objType) {
      toast({ title: 'Cannot Paste', description: 'No compatible object copied', variant: 'destructive' });
      closeContextMenu();
      return;
    }
    const id = target.id;
    const t = target.objType;
    setProject(prev => {
      const next = { ...prev };
      if (t === 'junction') {
        next.junctions = prev.junctions.map(j => j.id === id ? { ...copiedObj.props, id } : j);
      } else if (t === 'outfall') {
        next.outfalls = prev.outfalls.map(o => o.id === id ? { ...copiedObj.props, id } : o);
      } else if (t === 'storage') {
        next.storageUnits = prev.storageUnits.map(s => s.id === id ? { ...copiedObj.props, id } : s);
      } else if (t === 'conduit') {
        next.conduits = prev.conduits.map(c => c.id === id ? { ...copiedObj.props, id, fromNode: c.fromNode, toNode: c.toNode } : c);
      } else if (t === 'pump') {
        next.pumps = prev.pumps.map(p => p.id === id ? { ...copiedObj.props, id, fromNode: p.fromNode, toNode: p.toNode } : p);
      }
      return next;
    });
    toast({ title: 'Pasted', description: `Properties applied to ${id}` });
    closeContextMenu();
  }, [copiedObj, selectedObj, toast, closeContextMenu]);

  const handleReverseLink = useCallback(() => {
    const target = contextMenu?.obj || selectedObj;
    if (!target) return;
    const id = target.id;
    const t = target.objType;
    if (!['conduit', 'pump', 'orifice', 'weir', 'outlet'].includes(t)) return;
    setProject(prev => {
      const next = { ...prev };
      if (t === 'conduit') next.conduits = prev.conduits.map(c => c.id === id ? { ...c, fromNode: c.toNode, toNode: c.fromNode } : c);
      else if (t === 'pump') next.pumps = prev.pumps.map(p => p.id === id ? { ...p, fromNode: p.toNode, toNode: p.fromNode } : p);
      else if (t === 'orifice') next.orifices = prev.orifices.map(o => o.id === id ? { ...o, fromNode: o.toNode, toNode: o.fromNode } : o);
      else if (t === 'weir') next.weirs = prev.weirs.map(w => w.id === id ? { ...w, fromNode: w.toNode, toNode: w.fromNode } : w);
      else if (t === 'outlet') next.outlets = prev.outlets.map(o => o.id === id ? { ...o, fromNode: o.toNode, toNode: o.fromNode } : o);
      const verts = prev.vertices[id];
      if (verts) {
        next.vertices = { ...prev.vertices, [id]: [...verts].reverse() };
      }
      return next;
    });
    toast({ title: 'Reversed', description: `Link ${id} direction reversed` });
    closeContextMenu();
  }, [selectedObj, toast, closeContextMenu]);

  const handleEscapeMode = useCallback(() => {
    setInteractionMode('select');
    setLinkDrawState(null);
    setGroupSelectPoints([]);
    setGroupSelectedIds(null);
  }, []);

  const handleGroupSelectPoint = useCallback((wx: number, wy: number) => {
    setGroupSelectPoints(prev => [...prev, [wx, wy]]);
  }, []);

  const handleGroupSelectComplete = useCallback(() => {
    if (groupSelectPoints.length < 3) return;
    const ids = new Set<string>();
    for (const [nodeId, [nx, ny]] of Object.entries(project.coordinates)) {
      if (pointInPolygonWorld(nx, ny, groupSelectPoints)) {
        ids.add(nodeId);
      }
    }
    const allLinks = [...project.conduits, ...project.pumps, ...project.orifices, ...project.weirs, ...project.outlets];
    for (const link of allLinks) {
      const from = project.coordinates[(link as any).fromNode];
      const to = project.coordinates[(link as any).toNode];
      if (from && to) {
        const mx = (from[0] + to[0]) / 2;
        const my = (from[1] + to[1]) / 2;
        if (pointInPolygonWorld(mx, my, groupSelectPoints)) {
          ids.add(link.id);
        }
      }
    }
    setGroupSelectedIds(ids);
    if (ids.size > 0) {
      setOpenDialog('groupEdit');
    }
    toast({ title: 'Group Selected', description: `${ids.size} objects selected` });
  }, [groupSelectPoints, project, toast]);

  const handleGroupEdit = useCallback(() => {
    if (!groupSelectedIds || groupSelectedIds.size === 0) return;
    const val = parseFloat(groupEditValue);
    if (isNaN(val)) return;
    setProject(prev => {
      const next = { ...prev };
      next.junctions = prev.junctions.map(j => groupSelectedIds.has(j.id) && groupEditProp in j ? { ...j, [groupEditProp]: val } : j);
      next.outfalls = prev.outfalls.map(o => groupSelectedIds.has(o.id) && groupEditProp in o ? { ...o, [groupEditProp]: val } : o);
      next.storageUnits = prev.storageUnits.map(s => groupSelectedIds.has(s.id) && groupEditProp in s ? { ...s, [groupEditProp]: val } : s);
      next.conduits = prev.conduits.map(c => groupSelectedIds.has(c.id) && groupEditProp in c ? { ...c, [groupEditProp]: val } : c);
      next.pumps = prev.pumps.map(p => groupSelectedIds.has(p.id) && groupEditProp in p ? { ...p, [groupEditProp]: val } : p);
      return next;
    });
    toast({ title: 'Group Edited', description: `${groupEditProp} set to ${val} for ${groupSelectedIds.size} objects` });
    setOpenDialog(null);
    setGroupSelectedIds(null);
    setGroupSelectPoints([]);
    setInteractionMode('select');
  }, [groupSelectedIds, groupEditProp, groupEditValue, toast]);

  const handleGroupDelete = useCallback(() => {
    if (!groupSelectedIds || groupSelectedIds.size === 0) return;
    setProject(prev => {
      const next = { ...prev };
      const deletedNodeIds = new Set<string>();
      for (const id of groupSelectedIds) {
        if (prev.coordinates[id]) deletedNodeIds.add(id);
      }
      next.junctions = prev.junctions.filter(j => !groupSelectedIds.has(j.id));
      next.outfalls = prev.outfalls.filter(o => !groupSelectedIds.has(o.id));
      next.storageUnits = prev.storageUnits.filter(s => !groupSelectedIds.has(s.id));
      next.dividers = prev.dividers.filter(d => !groupSelectedIds.has(d.id));
      next.conduits = prev.conduits.filter(c => !groupSelectedIds.has(c.id) && !deletedNodeIds.has(c.fromNode) && !deletedNodeIds.has(c.toNode));
      next.pumps = prev.pumps.filter(p => !groupSelectedIds.has(p.id) && !deletedNodeIds.has(p.fromNode) && !deletedNodeIds.has(p.toNode));
      next.orifices = prev.orifices.filter(o => !groupSelectedIds.has(o.id) && !deletedNodeIds.has(o.fromNode) && !deletedNodeIds.has(o.toNode));
      next.weirs = prev.weirs.filter(w => !groupSelectedIds.has(w.id) && !deletedNodeIds.has(w.fromNode) && !deletedNodeIds.has(w.toNode));
      next.outlets = prev.outlets.filter(o => !groupSelectedIds.has(o.id) && !deletedNodeIds.has(o.fromNode) && !deletedNodeIds.has(o.toNode));
      const newCoords = { ...prev.coordinates };
      const newVerts = { ...prev.vertices };
      const newXsections = { ...prev.xsections };
      const newLosses = { ...prev.losses };
      const allPrevLinks = [...prev.conduits, ...prev.pumps, ...prev.orifices, ...prev.weirs, ...prev.outlets];
      for (const id of groupSelectedIds) {
        delete newCoords[id];
        delete newVerts[id];
        delete newXsections[id];
        delete newLosses[id];
      }
      for (const link of allPrevLinks) {
        if (deletedNodeIds.has((link as any).fromNode) || deletedNodeIds.has((link as any).toNode)) {
          delete newVerts[link.id];
          delete newXsections[link.id];
          delete newLosses[link.id];
        }
      }
      next.coordinates = newCoords;
      next.vertices = newVerts;
      next.xsections = newXsections;
      next.losses = newLosses;
      return next;
    });
    toast({ title: 'Group Deleted', description: `${groupSelectedIds.size} objects deleted` });
    setOpenDialog(null);
    setGroupSelectedIds(null);
    setGroupSelectPoints([]);
    setInteractionMode('select');
    setSelectedObj(null);
  }, [groupSelectedIds, toast]);

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu) setContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const flowUnits = project.options['FLOW_UNITS'] || 'CFS';
  const routingModel = project.options['FLOW_ROUTING'] || 'DYNWAVE';
  const infiltModel = project.options['INFILTRATION'] || 'GREEN_AMPT';

  const currentTime = results?.timeSteps[timeStep]?.dateTime || '';

  const ctxObj = contextMenu?.obj;
  const isLinkType = ctxObj && ['conduit', 'pump', 'orifice', 'weir', 'outlet'].includes(ctxObj.objType);

  return (
    <div
      className="w-full h-screen flex flex-col overflow-hidden select-none"
      style={{ fontFamily: "'Inter', 'Segoe UI', -apple-system, sans-serif", backgroundColor: '#f5f5f5', color: '#2a2a3e' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      data-testid="swmm-ui-root"
    >
      <input ref={fileInputRef} type="file" accept=".inp,.INP" onChange={handleFileInput} className="hidden" data-testid="file-input" />

      <div className="h-7 flex items-center px-3 text-xs gap-2 shrink-0" style={{ backgroundColor: '#2c3e6b' }}>
        <span className="font-bold" style={{ color: '#ffffff' }}>&#9670;</span>
        <span className="font-semibold text-white">SWMM5-UI</span>
        <span className="text-white/70 truncate max-w-[120px] md:max-w-none">{fileName}</span>
        <div className="flex-1" />
        <span className="text-[10px] text-white/50 mobile-hidden">Stormwater Management Model</span>
        {isMobile && (
          <div className="flex items-center gap-1">
            <button onClick={() => setMobilePanel(p => p === 'left' ? 'none' : 'left')} className="p-1 rounded" data-testid="btn-mobile-left-panel">
              <PanelLeftOpen className="w-4 h-4 text-white/70" />
            </button>
            <button onClick={() => setMobilePanel(p => p === 'right' ? 'none' : 'right')} className="p-1 rounded" data-testid="btn-mobile-right-panel">
              <PanelRightOpen className="w-4 h-4 text-white/70" />
            </button>
          </div>
        )}
      </div>

      <div className="h-8 flex items-stretch shrink-0" style={{ backgroundColor: '#3a5070', borderBottom: '1px solid #d0d0d8' }}>
        {menus.map(m => (
          <button
            key={m}
            onClick={() => setActiveMenu(m)}
            className="px-4 flex items-center text-xs transition-all duration-150"
            style={{
              backgroundColor: activeMenu === m ? '#4a6a9a' : 'transparent',
              color: activeMenu === m ? '#fff' : 'rgba(255,255,255,0.85)',
              fontWeight: activeMenu === m ? 700 : 400,
              borderBottom: activeMenu === m ? '2px solid #ffffff' : '2px solid transparent',
            }}
            data-testid={`menu-${m.toLowerCase()}`}
          >
            {m}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1 pr-3">
          <ToolbarIconButton icon={<Save className="w-3.5 h-3.5" />} onClick={handleSave} title="Save" testId="btn-save" />
          <ToolbarIconButton icon={<FolderOpen className="w-3.5 h-3.5" />} onClick={() => fileInputRef.current?.click()} title="Open" testId="btn-open" />
          <ToolbarIconButton icon={<Search className="w-3.5 h-3.5" />} title="Find" testId="btn-find" />
        </div>
      </div>

      <div className="h-[52px] md:h-[52px] flex items-center px-1 md:px-2 gap-0.5 shrink-0 overflow-x-auto" style={{ backgroundColor: '#f0f0f4', borderBottom: '1px solid #d0d0d8' }}>
        {activeMenu === 'File' && (
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<FilePlus className="w-4 h-4" />} label="New" onClick={handleNewProject} testId="btn-new" />
            <ToolbarButton icon={<FolderOpen className="w-4 h-4" />} label="Open" onClick={() => fileInputRef.current?.click()} testId="btn-open-file" />
            <ToolbarButton icon={<Github className="w-4 h-4" />} label="GitHub" onClick={() => { setOpenDialog('github'); if (ghBrowseItems.length === 0) ghBrowse(''); }} testId="btn-github" />
            <ToolbarButton icon={<Save className="w-4 h-4" />} label="Save" onClick={handleSave} testId="btn-save-file" />
            <ToolbarButton icon={<Download className="w-4 h-4" />} label="Export" testId="btn-export" />
            <ToolbarButton icon={<Upload className="w-4 h-4" />} label="Import" testId="btn-import" />
            <ToolbarButton icon={<Settings className="w-4 h-4" />} label="Prefs" onClick={() => setOpenDialog('preferences')} testId="btn-prefs" />
            <div className="w-px h-8 mx-1" style={{ backgroundColor: '#d0d0d8' }} />
            <div className="relative">
              <ToolbarButton icon={<BookOpen className="w-4 h-4" />} label="Samples" onClick={() => setShowSamplesMenu(v => !v)} testId="btn-samples" />
              {showSamplesMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSamplesMenu(false)} />
                  <div className="absolute left-0 top-full mt-0.5 z-50 min-w-[260px] max-h-[400px] overflow-y-auto rounded shadow-lg border" style={{ backgroundColor: '#ffffff', borderColor: '#d0d0d8' }}>
                    <button
                      className="w-full text-left px-3 py-2 text-xs hover:bg-black/[0.04] text-[#2a2a3e]"
                      onClick={() => { setShowSamplesMenu(false); handleLoadSample('Greenville_US.inp'); }}
                      data-testid="btn-sample-greenville-us"
                    >
                      Greenville (US Customary Units)
                      <span className="block text-[10px] text-[#6b6b7b]">All SWMM5 features - CFS, Green-Ampt, DynWave</span>
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 text-xs hover:bg-black/[0.04] text-[#2a2a3e]"
                      onClick={() => { setShowSamplesMenu(false); handleLoadSample('Greenville_SI.inp'); }}
                      data-testid="btn-sample-greenville-si"
                    >
                      Greenville (SI / Metric Units)
                      <span className="block text-[10px] text-[#6b6b7b]">All SWMM5 features - CMS, Green-Ampt, DynWave</span>
                    </button>
                    <div className="border-t" style={{ borderColor: '#d0d0d8' }} />
                    <button
                      className="w-full text-left px-3 py-2 text-xs hover:bg-black/[0.04] text-[#2a2a3e]"
                      onClick={() => { setShowSamplesMenu(false); handleLoadSample('User1.inp'); }}
                      data-testid="btn-sample-user1"
                    >
                      User1 — Mountain Drainage
                      <span className="block text-[10px] text-[#6b6b7b]">58 subcatchments, CMS, Horton, DynWave</span>
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 text-xs hover:bg-black/[0.04] text-[#2a2a3e]"
                      onClick={() => { setShowSamplesMenu(false); handleLoadSample('User2.inp'); }}
                      data-testid="btn-sample-user2"
                    >
                      User2 — Urban Collection
                      <span className="block text-[10px] text-[#6b6b7b]">17 subcatchments, CFS, storage nodes, DynWave</span>
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 text-xs hover:bg-black/[0.04] text-[#2a2a3e]"
                      onClick={() => { setShowSamplesMenu(false); handleLoadSample('User3.inp'); }}
                      data-testid="btn-sample-user3"
                    >
                      User3 — Large Metro Network
                      <span className="block text-[10px] text-[#6b6b7b]">100+ subcatchments, CMS, dual drainage, DynWave</span>
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 text-xs hover:bg-black/[0.04] text-[#2a2a3e]"
                      onClick={() => { setShowSamplesMenu(false); handleLoadSample('User4.inp'); }}
                      data-testid="btn-sample-user4"
                    >
                      User4 — Regional Stormwater
                      <span className="block text-[10px] text-[#6b6b7b]">98 subcatchments, CFS, large network, DynWave</span>
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 text-xs hover:bg-black/[0.04] text-[#2a2a3e]"
                      onClick={() => { setShowSamplesMenu(false); handleLoadSample('User5.inp'); }}
                      data-testid="btn-sample-user5"
                    >
                      User5 — Complex Watershed
                      <span className="block text-[10px] text-[#6b6b7b]">96 subcatchments, CFS, Froude-limited, DynWave</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {activeMenu === 'Edit' && (
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<Copy className="w-4 h-4" />} label="Copy" onClick={handleCopy} testId="btn-copy" />
            <ToolbarButton icon={<ClipboardPaste className="w-4 h-4" />} label="Paste" onClick={handlePaste} testId="btn-paste" />
            <ToolbarButton icon={<ArrowLeftRight className="w-4 h-4" />} label="Reverse" onClick={handleReverseLink} testId="btn-reverse" />
            <ToolbarButton icon={<List className="w-4 h-4" />} label="Group Edit" testId="btn-group-edit" />
            <ToolbarButton icon={<Trash2 className="w-4 h-4" />} label="Delete" onClick={handleDelete} testId="btn-delete" />
          </div>
        )}
        {activeMenu === 'View' && (
          <div className="flex items-center gap-4 px-2 w-full">
            <ThemeCombo label="Subcatchments" value={subcatchTheme} onChange={setSubcatchTheme}
              options={[['imperv', '% Imperv'], ['runoff', 'Runoff'], ['rainfall', 'Rainfall'], ['infiltration', 'Infiltration']]} testId="combo-subcatch" />
            <ThemeCombo label="Nodes" value={nodeTheme} onChange={setNodeTheme}
              options={[['depth', 'Depth'], ['head', 'Head']]} testId="combo-nodes" />
            <ThemeCombo label="Links" value={linkTheme} onChange={setLinkTheme}
              options={[['flow', 'Flow'], ['depth', 'Depth'], ['velocity', 'Velocity']]} testId="combo-links" />
            <div className="flex-1" />
            {results && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#6b6b7b]">Time:</span>
                <input
                  type="range"
                  min={0}
                  max={maxTimeStep}
                  value={timeStep}
                  onChange={e => setTimeStep(+e.target.value)}
                  className="w-28"
                  style={{ accentColor: '#2c6eb5' }}
                  data-testid="time-slider"
                />
                <span className="text-[10px] font-mono text-[#2c6eb5] min-w-[70px]" data-testid="time-display">
                  {currentTime.split(' ')[1] || `Step ${timeStep}`}
                </span>
                <button
                  onClick={() => setIsAnimating(!isAnimating)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border"
                  style={{ borderColor: '#d0d0d8', color: isAnimating ? '#d04040' : '#2c6eb5' }}
                  data-testid="btn-animate"
                >
                  {isAnimating ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {isAnimating ? 'Stop' : 'Animate'}
                </button>
              </div>
            )}
          </div>
        )}
        {activeMenu === 'Map' && (
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<ZoomIn className="w-4 h-4" />} label="Zoom In" testId="btn-zoom-in" />
            <ToolbarButton icon={<ZoomOut className="w-4 h-4" />} label="Zoom Out" testId="btn-zoom-out" />
            <ToolbarButton icon={<Maximize className="w-4 h-4" />} label="Extent" testId="btn-extent" />
            <ToolbarButton icon={<Settings className="w-4 h-4" />} label="Options" testId="btn-map-options" />
            <ToolbarButton icon={<Search className="w-4 h-4" />} label="Query" onClick={() => setShowQueryPanel(!showQueryPanel)} testId="btn-query" />
            <ToolbarButton icon={<Download className="w-4 h-4" />} label="Export" onClick={() => setOpenDialog('export')} testId="btn-map-export" />
          </div>
        )}
        {activeMenu === 'Project' && (
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<Settings className="w-4 h-4" />} label="Setup" testId="btn-setup" />
            <ToolbarButton icon={<Search className="w-4 h-4" />} label="Locate" onClick={() => setShowLocator(!showLocator)} testId="btn-locate" />
            <ToolbarButton icon={<List className="w-4 h-4" />} label="Summary" testId="btn-summary" />
            <ToolbarButton icon={<FileText className="w-4 h-4" />} label="Details" testId="btn-details" />
            <div className="w-px h-8 bg-[#d0d0d8] mx-1" />
            <ToolbarButton
              icon={simStatus === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              label="Run"
              accent
              onClick={handleRunSimulation}
              disabled={simStatus === 'running'}
              testId="btn-run"
            />
            <ToolbarButton icon={<BarChart3 className="w-4 h-4" />} label="Report" onClick={() => { if (reportContent) setShowReportDialog(true); else toast({ title: 'No Report', description: 'Run a simulation first to generate a report' }); }} testId="btn-report" />
            <div className="w-px h-8 bg-[#d0d0d8] mx-1" />
            <ToolbarButton
              icon={<Scissors className="w-4 h-4" />}
              label="CFL"
              onClick={() => setShowCflPanel(!showCflPanel)}
              testId="btn-cfl"
            />
            {cflAnalysis && cflAnalysis.flaggedCount > 0 && (
              <span className="text-[9px] text-[#d04040] font-medium -ml-1 mt-0.5" data-testid="cfl-badge">
                {cflAnalysis.flaggedCount}
              </span>
            )}
            <div className="w-px h-8 bg-[#d0d0d8] mx-1" />
            <button
              onClick={() => {
                const modes: Array<'local' | 'remote' | 'mock'> = [];
                if (localAvailable) modes.push('local');
                if (remoteAvailable) modes.push('remote');
                modes.push('mock');
                const idx = modes.indexOf(engineMode);
                setEngineMode(modes[(idx + 1) % modes.length]);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium transition-colors border ${
                engineMode === 'local' || engineMode === 'remote'
                  ? 'bg-[rgba(44,110,181,0.12)] border-[#2c6eb5] text-[#2c6eb5]'
                  : 'bg-transparent border-[#d0d0d8] text-[#6b6b7b] hover:text-[#2a2a3e]'
              } cursor-pointer`}
              title="Cycle engine mode: Local → Remote → Mock"
              data-testid="btn-engine-toggle"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${engineMode === 'local' ? 'bg-[#2a8a4a]' : engineMode === 'remote' ? 'bg-[#2c6eb5]' : 'bg-[#9090a0]'}`} />
              {engineMode === 'local' ? 'Local 5.2.4' : engineMode === 'remote' ? 'Remote 5.2.4' : 'Mock Engine'}
            </button>
          </div>
        )}
        {activeMenu === 'Help' && (
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<HelpCircle className="w-4 h-4" />} label="Topics" testId="btn-topics" />
            <ToolbarButton icon={<FileText className="w-4 h-4" />} label="Tutorial" testId="btn-tutorial" />
            <ToolbarButton icon={<AlertTriangle className="w-4 h-4" />} label="Errors" testId="btn-errors" />
            <ToolbarButton icon={<Info className="w-4 h-4" />} label="About" testId="btn-about" />
          </div>
        )}
      </div>

      {simStatus === 'running' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]" data-testid="progress-monitor-overlay">
          <div className="bg-white border border-[#d0d0d8] rounded-lg shadow-xl w-[90vw] max-w-[360px] overflow-hidden" data-testid="progress-monitor">
            <div className="px-4 py-2.5 border-b border-[#d0d0d8] bg-[#2c3e6b]">
              <span className="text-xs text-white">SWMM5 Progress Monitor</span>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#2c6eb5] animate-spin shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-[#2a2a3e] mb-0.5">
                    {simProgressMsg || 'Running simulation...'}
                  </div>
                  <div className="text-[10px] text-[#6b6b7b]">
                    {engineMode === 'local' ? 'EPA SWMM 5.2.4 (Local)' : engineMode === 'remote' ? 'EPA SWMM 5.2.4 (Remote)' : 'Mock Engine'}
                  </div>
                </div>
                <span className="text-xs text-[#2c6eb5] font-mono tabular-nums" data-testid="text-progress-pct">
                  {Math.round(simProgress)}%
                </span>
              </div>
              <div className="w-full bg-[#e8e8ee] rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-[#2c6eb5] rounded-full transition-all duration-300"
                  style={{ width: `${simProgress}%` }}
                  data-testid="progress-bar-fill"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="text-[9px] text-[#9090a0]">
                  {simProgress < 30 ? 'Initializing hydraulic engine...' :
                   simProgress < 60 ? 'Computing hydraulic routing...' :
                   simProgress < 90 ? 'Processing time steps...' :
                   'Finalizing results...'}
                </div>
                <button
                  onClick={handleStopSimulation}
                  className="flex items-center gap-1 px-2.5 py-1 text-[10px] text-[#d04040] bg-[#d04040]/10 border border-[#d04040]/30 rounded hover:bg-[#d04040]/20 transition-colors"
                  data-testid="btn-stop-simulation"
                >
                  <X className="w-3 h-3" /> Stop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {isMobile && mobilePanel !== 'none' && (
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setMobilePanel('none')} data-testid="mobile-panel-backdrop" />
        )}
        <div
          className={`${isMobile ? (mobilePanel === 'left' ? 'fixed left-0 top-0 bottom-0 z-50 w-[260px] shadow-xl' : 'hidden') : 'w-[170px]'} shrink-0 overflow-hidden flex flex-col`}
          style={{ backgroundColor: '#f8f8fa', borderRight: '1px solid #d0d0d8' }}
        >
          {isMobile && mobilePanel === 'left' && (
            <div className="h-8 flex items-center justify-between px-3 border-b" style={{ backgroundColor: '#2c3e6b', borderColor: '#d0d0d8' }}>
              <span className="text-xs text-white">Tools & Locator</span>
              <button onClick={() => setMobilePanel('none')} className="p-1" data-testid="btn-close-left-panel"><X className="w-4 h-4 text-white/70" /></button>
            </div>
          )}
          {showLocator && (
            <ObjectLocatorPanel
              project={project}
              onLocate={handleLocateObject}
              onClose={() => setShowLocator(false)}
            />
          )}
          {showQueryPanel && (
            <MapQueryPanel
              query={mapQuery}
              onQueryChange={setMapQuery}
              onClose={() => {
                setShowQueryPanel(false);
                setMapQuery(prev => ({ ...prev, active: false }));
              }}
              matchCount={mapQuery.active ? evaluateQuery(mapQuery, project).size : 0}
            />
          )}
          <div className="flex-1 overflow-hidden">
            <LegendPanel
              subcatchTheme={subcatchTheme}
              nodeTheme={nodeTheme}
              linkTheme={linkTheme}
              showSubcatch={showSubcatch}
              setShowSubcatch={setShowSubcatch}
              layerVisibility={layerVisibility}
              setLayerVisibility={setLayerVisibility}
            />
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          <NetworkMap
            ref={networkMapRef}
            project={project}
            selectedObj={selectedObj}
            onSelectObj={setSelectedObj}
            showSubcatchments={showSubcatch}
            subcatchTheme={subcatchTheme}
            nodeTheme={nodeTheme}
            linkTheme={linkTheme}
            timeStep={timeStep}
            results={results}
            layerVisibility={layerVisibility}
            interactionMode={interactionMode}
            preferences={preferences}
            queryMatchIds={queryMatchIds}
            queryObjectType={queryObjectType}
            cflFlaggedIds={cflFlaggedIds}
            discretizedJunctionIds={discretizationResult?.newJunctionIds || null}
            onCreateNode={handleCreateNode}
            onStartLink={handleStartLink}
            onCompleteLink={handleCompleteLink}
            onAddLinkVertex={handleAddLinkVertex}
            onMoveNode={handleMoveNode}
            onContextMenu={handleContextMenu}
            onGroupSelectPoint={handleGroupSelectPoint}
            onGroupSelectComplete={handleGroupSelectComplete}
            onEscapeMode={handleEscapeMode}
            linkDrawState={linkDrawState}
            groupSelectPoints={groupSelectPoints}
            groupSelectedIds={groupSelectedIds}
          />

          <SpeedBar
            interactionMode={interactionMode}
            onSetMode={(mode) => {
              setInteractionMode(mode);
              setLinkDrawState(null);
              if (mode !== 'groupSelect') {
                setGroupSelectPoints([]);
                setGroupSelectedIds(null);
              }
            }}
            onDelete={handleDelete}
            onRunSimulation={handleRunSimulation}
            onFullExtent={handleFullExtent}
            simRunning={simStatus === 'running'}
            isMobile={isMobile}
          />

          {interactionMode !== 'select' && (
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded text-[11px] z-10"
              style={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #2c6eb5', color: '#2c6eb5' }}
              data-testid="mode-indicator"
            >
              {interactionMode === 'addJunction' && 'Click to place Junction (Esc to cancel)'}
              {interactionMode === 'addOutfall' && 'Click to place Outfall (Esc to cancel)'}
              {interactionMode === 'addStorage' && 'Click to place Storage (Esc to cancel)'}
              {interactionMode === 'addConduit' && (linkDrawState ? 'Click node to complete Conduit, or click map for vertex (Esc to cancel)' : 'Click start node for Conduit (Esc to cancel)')}
              {interactionMode === 'addPump' && (linkDrawState ? 'Click node to complete Pump (Esc to cancel)' : 'Click start node for Pump (Esc to cancel)')}
              {interactionMode === 'addLabel' && 'Click to place Label (Esc to cancel)'}
              {interactionMode === 'groupSelect' && 'Click to add polygon points, double-click or right-click to close (Esc to cancel)'}
              {interactionMode === 'query' && 'Query mode active'}
            </div>
          )}

          {showCflPanel && cflAnalysis && (
            <div
              className="absolute top-2 right-2 w-[calc(100%-16px)] md:w-[320px] max-h-[calc(100%-16px)] overflow-y-auto z-20 rounded-lg shadow-xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.97)', border: '1px solid #d0d0d8' }}
              data-testid="cfl-panel"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#d0d0d8]">
                <div className="flex items-center gap-2">
                  <Scissors className="w-3.5 h-3.5 text-[#2c6eb5]" />
                  <span className="text-[11px] font-semibold text-[#2a2a3e]">CFL Stability Analysis</span>
                </div>
                <button onClick={() => setShowCflPanel(false)} className="text-[#6b6b7b] hover:text-[#2a2a3e]" data-testid="btn-cfl-close">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="px-3 py-2 space-y-2 text-[10px]">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-[#6b6b7b]">Routing Step:</span>
                  <span className="text-[#2a2a3e]">{cflAnalysis.routingStep}s</span>
                  <span className="text-[#6b6b7b]">Flow Units:</span>
                  <span className="text-[#2a2a3e]">{cflAnalysis.units}</span>
                  <span className="text-[#6b6b7b]">Gravity:</span>
                  <span className="text-[#2a2a3e]">{cflAnalysis.gravity.toFixed(3)} {cflAnalysis.units === 'CFS' || cflAnalysis.units === 'GPM' || cflAnalysis.units === 'MGD' ? 'ft/s²' : 'm/s²'}</span>
                  <span className="text-[#6b6b7b]">Total Conduits:</span>
                  <span className="text-[#2a2a3e]">{cflAnalysis.totalCount}</span>
                  <span className="text-[#6b6b7b]">CFL Violations:</span>
                  <span className={cflAnalysis.flaggedCount > 0 ? 'text-[#d04040] font-semibold' : 'text-[#2a8a4a]'}>
                    {cflAnalysis.flaggedCount > 0 ? `${cflAnalysis.flaggedCount} conduits` : 'None'}
                  </span>
                  {cflAnalysis.flaggedCount > 0 && (
                    <>
                      <span className="text-[#6b6b7b]">Worst Courant:</span>
                      <span className="text-[#d04040]">{cflAnalysis.worstCourant.toFixed(2)} ({cflAnalysis.worstConduitId})</span>
                    </>
                  )}
                </div>

                {cflAnalysis.flaggedCount > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <Switch
                      checked={cflShowFlagged}
                      onCheckedChange={setCflShowFlagged}
                      className="data-[state=checked]:bg-[#ff5555]"
                      data-testid="switch-cfl-highlight"
                    />
                    <Label className="text-[10px] text-[#6b6b7b] cursor-pointer">Highlight flagged on map</Label>
                  </div>
                )}
              </div>

              {cflAnalysis.flaggedCount > 0 && (
                <>
                  <div className="border-t border-[#d0d0d8] px-3 py-2">
                    <div className="text-[10px] font-semibold text-[#2a2a3e] mb-2">Flagged Conduits</div>
                    <div className="max-h-[120px] overflow-y-auto space-y-0.5">
                      {cflAnalysis.conduits
                        .filter(c => c.violatesCfl)
                        .sort((a, b) => b.courantNumber - a.courantNumber)
                        .map(c => (
                          <button
                            key={c.conduitId}
                            onClick={() => handleLocateObject('conduit', c.conduitId)}
                            className="w-full flex items-center justify-between px-2 py-1 rounded text-[9px] hover:bg-black/[0.04] cursor-pointer transition-colors"
                            data-testid={`cfl-conduit-${c.conduitId}`}
                          >
                            <span className="text-[#2a2a3e] font-mono">{c.conduitId}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[#6b6b7b]">L={c.length.toFixed(0)}</span>
                              <span className="text-[#6b6b7b]">D={c.diameter.toFixed(2)}</span>
                              <span className="text-[#d04040] font-semibold">Cr={c.courantNumber.toFixed(1)}</span>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className="border-t border-[#d0d0d8] px-3 py-2 space-y-2">
                    <div className="text-[10px] font-semibold text-[#2a2a3e]">Discretization Settings</div>

                    <div className="flex items-center gap-2">
                      <Label className="text-[9px] text-[#6b6b7b] w-[70px]">Method:</Label>
                      <select
                        value={discretizationSettings.method}
                        onChange={e => setDiscretizationSettings(prev => ({ ...prev, method: e.target.value as 'fixed_interval' | 'dx_d_ratio' }))}
                        className="flex-1 text-[9px] rounded px-1.5 py-0.5 bg-[#ffffff] text-[#2a2a3e] border border-[#d0d0d8]"
                        data-testid="select-disc-method"
                      >
                        <option value="fixed_interval">Fixed Interval</option>
                        <option value="dx_d_ratio">Δx/D Ratio</option>
                      </select>
                    </div>

                    {discretizationSettings.method === 'fixed_interval' ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Label className="text-[9px] text-[#6b6b7b] w-[70px]">Min Length:</Label>
                          <Input
                            type="number"
                            value={discretizationSettings.fixedMinLength}
                            onChange={e => setDiscretizationSettings(prev => ({ ...prev, fixedMinLength: parseFloat(e.target.value) || 0 }))}
                            className="flex-1 h-6 text-[9px] bg-[#ffffff] border-[#d0d0d8] text-[#2a2a3e]"
                            data-testid="input-disc-min"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-[9px] text-[#6b6b7b] w-[70px]">Max Length:</Label>
                          <Input
                            type="number"
                            value={discretizationSettings.fixedMaxLength}
                            onChange={e => setDiscretizationSettings(prev => ({ ...prev, fixedMaxLength: parseFloat(e.target.value) || 0 }))}
                            className="flex-1 h-6 text-[9px] bg-[#ffffff] border-[#d0d0d8] text-[#2a2a3e]"
                            data-testid="input-disc-max"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Label className="text-[9px] text-[#6b6b7b] w-[70px]">Δx/D Ratio:</Label>
                        <Input
                          type="number"
                          value={discretizationSettings.dxDRatio}
                          onChange={e => setDiscretizationSettings(prev => ({ ...prev, dxDRatio: parseFloat(e.target.value) || 1 }))}
                          className="flex-1 h-6 text-[9px] bg-[#ffffff] border-[#d0d0d8] text-[#2a2a3e]"
                          data-testid="input-disc-dxd"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={discretizationSettings.lengtheningEnabled}
                        onCheckedChange={v => setDiscretizationSettings(prev => ({ ...prev, lengtheningEnabled: v }))}
                        className="data-[state=checked]:bg-[#2c6eb5]"
                        data-testid="switch-lengthening"
                      />
                      <Label className="text-[9px] text-[#6b6b7b]">Lengthen short conduits</Label>
                    </div>

                    {discretizationSettings.lengtheningEnabled && (
                      <div className="flex items-center gap-2">
                        <Label className="text-[9px] text-[#6b6b7b] w-[70px]">Step (s):</Label>
                        <Input
                          type="number"
                          value={discretizationSettings.lengtheningStep}
                          onChange={e => setDiscretizationSettings(prev => ({ ...prev, lengtheningStep: parseFloat(e.target.value) || 1 }))}
                          className="flex-1 h-6 text-[9px] bg-[#ffffff] border-[#d0d0d8] text-[#2a2a3e]"
                          data-testid="input-lengthening-step"
                        />
                      </div>
                    )}

                    <Button
                      size="sm"
                      onClick={handleDiscretize}
                      className="w-full bg-[#2c6eb5] text-white hover:bg-[#3a7ec5] text-[10px] h-7"
                      data-testid="btn-discretize"
                    >
                      <Scissors className="w-3 h-3 mr-1.5" />
                      Discretize {cflAnalysis.flaggedCount} Conduit{cflAnalysis.flaggedCount !== 1 ? 's' : ''}
                    </Button>
                  </div>
                </>
              )}

              {discretizationResult && (
                <div className="border-t border-[#d0d0d8] px-3 py-2">
                  <div className="text-[10px] font-semibold text-[#2a8a4a] mb-1">Discretization Applied</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
                    <span className="text-[#6b6b7b]">Conduits Split:</span>
                    <span className="text-[#2a2a3e]">{discretizationResult.stats.splitCount}</span>
                    <span className="text-[#6b6b7b]">New Junctions:</span>
                    <span className="text-[#2a2a3e]">{discretizationResult.stats.newJunctionCount}</span>
                    <span className="text-[#6b6b7b]">New Conduit Count:</span>
                    <span className="text-[#2a2a3e]">{discretizationResult.stats.newConduitCount}</span>
                    {discretizationResult.stats.lengtheningCount > 0 && (
                      <>
                        <span className="text-[#6b6b7b]">Lengthened:</span>
                        <span className="text-[#2a2a3e]">{discretizationResult.stats.lengtheningCount} (+{discretizationResult.stats.lengtheningTotalAdded.toFixed(1)})</span>
                      </>
                    )}
                    <span className="text-[#6b6b7b]">Method:</span>
                    <span className="text-[#2a2a3e]">{discretizationResult.stats.method === 'fixed_interval' ? 'Fixed Interval' : 'Δx/D Ratio'}</span>
                  </div>
                </div>
              )}

              {cflAnalysis.flaggedCount === 0 && !discretizationResult && (
                <div className="px-3 py-3 text-center">
                  <Check className="w-5 h-5 text-[#2a8a4a] mx-auto mb-1" />
                  <div className="text-[10px] text-[#2a8a4a] font-medium">All conduits pass CFL criteria</div>
                  <div className="text-[9px] text-[#6b6b7b] mt-0.5">No discretization needed for stability</div>
                </div>
              )}

              <div className="px-3 py-2 border-t border-[#d0d0d8] mt-1">
                <div className="text-[8px] text-[#9090a0] leading-relaxed" data-testid="text-cfl-citation">
                  ReSWMM — J. Vasconcelos, R.L. Pachaly (Auburn University)
                </div>
              </div>
            </div>
          )}

          {!results && Object.keys(project.coordinates).length > 0 && interactionMode === 'select' && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-[11px] text-[#6b6b7b] bg-white/80 backdrop-blur-sm border border-[#d0d0d8]" data-testid="hint-run">
              Click <strong className="text-[#2c6eb5]">Project &gt; Run</strong> to simulate, or drag an .inp file here
            </div>
          )}

          {Object.keys(project.coordinates).length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 md:gap-4 text-[#6b6b7b] px-4" data-testid="empty-state">
              <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-[#f0f0f4] border border-[#d0d0d8] flex items-center justify-center">
                <FolderOpen className="w-6 h-6 md:w-8 md:h-8 text-[#2c6eb5] opacity-60" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[#2a2a3e]">No Network Loaded</p>
                <p className="text-xs mt-1">Open an INP file or load from GitHub</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-white border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4]"
                  data-testid="btn-open-empty"
                >
                  <FolderOpen className="w-3.5 h-3.5 mr-1.5" /> Open File
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setOpenDialog('github'); if (ghBrowseItems.length === 0) ghBrowse(''); }}
                  className="bg-white border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4]"
                  data-testid="btn-github-empty"
                >
                  <Github className="w-3.5 h-3.5 mr-1.5" /> From GitHub
                </Button>
              </div>
              <div className="text-center mt-2 max-w-[400px]">
                <p className="text-[10px] text-[#9090a0] mb-2">Or load a sample project:</p>
                <div className="flex flex-wrap gap-1.5 md:gap-2 justify-center">
                  <Button variant="outline" size="sm" onClick={() => handleLoadSample('Greenville_US.inp')} className="bg-white border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4] text-[10px] md:text-[11px] h-7 md:h-8 px-2 md:px-3" data-testid="btn-sample-us-empty">
                    <BookOpen className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1" /> US
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleLoadSample('Greenville_SI.inp')} className="bg-white border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4] text-[10px] md:text-[11px] h-7 md:h-8 px-2 md:px-3" data-testid="btn-sample-si-empty">
                    <BookOpen className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1" /> SI
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleLoadSample('User1.inp')} className="bg-white border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4] text-[10px] md:text-[11px] h-7 md:h-8 px-2 md:px-3" data-testid="btn-sample-user1-empty">
                    <BookOpen className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1" /> User1
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleLoadSample('User2.inp')} className="bg-white border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4] text-[10px] md:text-[11px] h-7 md:h-8 px-2 md:px-3" data-testid="btn-sample-user2-empty">
                    <BookOpen className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1" /> User2
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleLoadSample('User3.inp')} className="bg-white border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4] text-[10px] md:text-[11px] h-7 md:h-8 px-2 md:px-3" data-testid="btn-sample-user3-empty">
                    <BookOpen className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1" /> User3
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleLoadSample('User4.inp')} className="bg-white border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4] text-[10px] md:text-[11px] h-7 md:h-8 px-2 md:px-3" data-testid="btn-sample-user4-empty">
                    <BookOpen className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1" /> User4
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleLoadSample('User5.inp')} className="bg-white border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4] text-[10px] md:text-[11px] h-7 md:h-8 px-2 md:px-3" data-testid="btn-sample-user5-empty">
                    <BookOpen className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1" /> User5
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className={`${isMobile ? (mobilePanel === 'right' ? 'fixed right-0 top-0 bottom-0 z-50 w-[280px] shadow-xl' : 'hidden') : 'w-[220px]'} shrink-0 overflow-hidden`}
          style={{ backgroundColor: '#f8f8fa', borderLeft: '1px solid #d0d0d8' }}
        >
          {isMobile && mobilePanel === 'right' && (
            <div className="h-8 flex items-center justify-between px-3 border-b" style={{ backgroundColor: '#2c3e6b', borderColor: '#d0d0d8' }}>
              <span className="text-xs text-white">Project Explorer</span>
              <button onClick={() => setMobilePanel('none')} className="p-1" data-testid="btn-close-right-panel"><X className="w-4 h-4 text-white/70" /></button>
            </div>
          )}
          <ProjectExplorer
            project={project}
            selectedObj={selectedObj}
            onSelectObj={setSelectedObj}
            results={results}
            timeStep={timeStep}
          />
        </div>
      </div>

      <div className="h-6 flex items-center px-2 md:px-3 shrink-0 overflow-x-auto" style={{ backgroundColor: '#f0f0f4', borderTop: '1px solid #d0d0d8' }}>
        <StatusItem text={`Flow: ${flowUnits}`} />
        <span className="mobile-hidden"><StatusItem text={`Routing: ${routingModel}`} /></span>
        <span className="mobile-hidden"><StatusItem text={`Infiltration: ${infiltModel}`} /></span>
        <StatusItem
          text={simStatus === 'current' ? 'Results are Current' : simStatus === 'running' ? (simProgressMsg || 'Running...') : 'No Results'}
          color={simStatus === 'current' ? '#2a8a4a' : simStatus === 'running' ? '#c08820' : '#6b6b7b'}
          bold={simStatus === 'current'}
        />
        {cflAnalysis && cflAnalysis.flaggedCount > 0 && (
          <StatusItem
            text={`CFL: ${cflAnalysis.flaggedCount} violations`}
            color="#d04040"
          />
        )}
        {cflAnalysis && cflAnalysis.flaggedCount === 0 && cflAnalysis.totalCount > 0 && (
          <StatusItem
            text="CFL: OK"
            color="#2a8a4a"
          />
        )}
        <StatusItem
          text={engineMode === 'local' ? 'Engine: Local 5.2.4' : engineMode === 'remote' ? 'Engine: Remote 5.2.4' : 'Engine: Mock'}
          color={engineMode === 'local' ? '#2a8a4a' : engineMode === 'remote' ? '#2c6eb5' : '#6b6b7b'}
        />
        <div className="flex-1" />
        <span className="text-[9px] font-mono text-[#9090a0]" data-testid="status-counts">
          {project.junctions.length + project.outfalls.length + project.storageUnits.length + project.dividers.length} nodes
          {' | '}
          {project.conduits.length + project.pumps.length + project.weirs.length + project.orifices.length + project.outlets.length} links
          {' | '}
          {project.subcatchments.length} subcatch
        </span>
        <span className="text-[9px] text-[#9090a0] mx-2">|</span>
        <a
          href="https://github.com/SWMMEnablement"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] text-[#6b6b7b] hover:text-[#2c6eb5] transition-colors"
          data-testid="link-credit"
        >
          Created by SWMMEnablement
        </a>
      </div>

      <Dialog open={openDialog === 'github'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-lg" data-testid="github-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#2a2a3e]">
              <Github className="w-5 h-5" /> SWMM5 Model Repository
            </DialogTitle>
            <DialogDescription className="text-[#6b6b7b]">
              Browse {ghBrowseOwner}/{ghBrowseRepo} — select an INP file to load
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-[#6b6b7b] bg-[#f0f0f4] rounded px-2 py-1.5 border border-[#d0d0d8]">
              <Folder className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate font-mono" data-testid="text-gh-path">/{ghBrowsePath || ''}</span>
            </div>
            {ghBrowsePath && (
              <button
                onClick={() => {
                  const parent = ghBrowsePath.includes('/') ? ghBrowsePath.substring(0, ghBrowsePath.lastIndexOf('/')) : '';
                  ghBrowse(parent);
                }}
                className="flex items-center gap-1 text-xs text-[#2c6eb5] hover:underline"
                data-testid="btn-gh-back"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
            <div className="border border-[#d0d0d8] rounded max-h-[320px] overflow-y-auto" data-testid="gh-file-list">
              {ghBrowseLoading && (
                <div className="flex items-center justify-center py-8 text-[#6b6b7b]">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
                </div>
              )}
              {ghBrowseError && (
                <div className="py-4 px-3 text-xs text-[#d04040]" data-testid="text-gh-error">{ghBrowseError}</div>
              )}
              {!ghBrowseLoading && !ghBrowseError && ghBrowseItems.length === 0 && (
                <div className="py-4 px-3 text-xs text-[#9090a0] text-center">No items found</div>
              )}
              {!ghBrowseLoading && ghBrowseItems.map((item) => {
                const isInp = item.name.toLowerCase().endsWith('.inp');
                const isDir = item.type === 'dir';
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      if (isDir) {
                        ghBrowse(item.path);
                      } else if (isInp) {
                        handleGhFileSelect(item);
                      }
                    }}
                    disabled={!isDir && !isInp}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left border-b border-[#f0f0f4] last:border-b-0 transition-colors
                      ${isDir ? 'hover:bg-[#f0f0f4] cursor-pointer text-[#2a2a3e] font-medium' : ''}
                      ${isInp ? 'hover:bg-blue-50 cursor-pointer text-[#2c6eb5]' : ''}
                      ${!isDir && !isInp ? 'opacity-40 cursor-default text-[#9090a0]' : ''}`}
                    data-testid={`gh-item-${item.name}`}
                  >
                    {isDir ? <Folder className="w-3.5 h-3.5 text-[#c08820] shrink-0" /> : <File className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{item.name}</span>
                    {item.size && !isDir ? <span className="ml-auto text-[10px] text-[#9090a0] shrink-0">{(item.size / 1024).toFixed(0)} KB</span> : null}
                  </button>
                );
              })}
            </div>
            {loading && (
              <div className="flex items-center justify-center py-2 text-xs text-[#2c6eb5]">
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Loading model...
              </div>
            )}
            <details className="text-[10px] text-[#9090a0]">
              <summary className="cursor-pointer hover:text-[#6b6b7b]">Or paste a direct GitHub URL</summary>
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="https://github.com/user/repo/blob/main/model.inp"
                  value={githubUrl}
                  onChange={e => setGithubUrl(e.target.value)}
                  className="bg-white border-[#d0d0d8] text-[#2a2a3e] placeholder:text-[#9090a0] text-xs h-7"
                  data-testid="input-github-url"
                />
                <Button size="sm" onClick={handleGithubLoad} disabled={loading || !githubUrl.trim()}
                  className="bg-[#2c6eb5] text-white hover:bg-[#3a7ec5] h-7 text-xs"
                  data-testid="btn-github-load"
                >
                  Load
                </Button>
              </div>
            </details>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'preferences'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-md" data-testid="preferences-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#2a2a3e]">
              <Settings className="w-5 h-5" /> Preferences
            </DialogTitle>
            <DialogDescription className="text-[#6b6b7b]">
              Configure application behavior and display settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="pref-flyover" className="text-[#2a2a3e] text-xs">Flyover Map Hints</Label>
              <Switch
                id="pref-flyover"
                checked={preferences.flyoverHints}
                onCheckedChange={v => updatePreference('flyoverHints', v)}
                data-testid="switch-flyover-hints"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="pref-confirm" className="text-[#2a2a3e] text-xs">Confirm Deletions</Label>
              <Switch
                id="pref-confirm"
                checked={preferences.confirmDeletions}
                onCheckedChange={v => updatePreference('confirmDeletions', v)}
                data-testid="switch-confirm-deletions"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="pref-precision" className="text-[#2a2a3e] text-xs">Numerical Precision</Label>
              <select
                id="pref-precision"
                value={preferences.numericalPrecision}
                onChange={e => updatePreference('numericalPrecision', +e.target.value)}
                className="text-xs rounded px-2 py-1"
                style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
                data-testid="select-numerical-precision"
              >
                {[0, 1, 2, 3, 4, 5, 6].map(n => (
                  <option key={n} value={n}>{n} decimal places</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="pref-blink" className="text-[#2a2a3e] text-xs">Blinking Map Marker</Label>
              <Switch
                id="pref-blink"
                checked={preferences.blinkingMapMarker}
                onCheckedChange={v => updatePreference('blinkingMapMarker', v)}
                data-testid="switch-blinking-marker"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="pref-nodeids" className="text-[#2a2a3e] text-xs">Show Node IDs</Label>
              <Switch
                id="pref-nodeids"
                checked={preferences.showNodeIds}
                onCheckedChange={v => updatePreference('showNodeIds', v)}
                data-testid="switch-show-node-ids"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="pref-linkids" className="text-[#2a2a3e] text-xs">Show Link IDs</Label>
              <Switch
                id="pref-linkids"
                checked={preferences.showLinkIds}
                onCheckedChange={v => updatePreference('showLinkIds', v)}
                data-testid="switch-show-link-ids"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="pref-bgcolor" className="text-[#2a2a3e] text-xs">Background Color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="pref-bgcolor"
                  type="color"
                  value={preferences.mapBackgroundColor}
                  onChange={e => updatePreference('mapBackgroundColor', e.target.value)}
                  className="w-8 h-8 rounded border border-[#d0d0d8] cursor-pointer"
                  style={{ backgroundColor: 'transparent', padding: 0 }}
                  data-testid="input-background-color"
                />
                <span className="text-[10px] font-mono text-[#6b6b7b]" data-testid="text-background-color">{preferences.mapBackgroundColor}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const def = { ...DEFAULT_PREFERENCES };
                  setPreferences(def);
                  savePreferences(def);
                }}
                className="bg-[#f0f0f4] border-[#d0d0d8] text-[#2a2a3e]"
                data-testid="btn-reset-preferences"
              >
                Reset Defaults
              </Button>
              <Button
                size="sm"
                onClick={() => setOpenDialog(null)}
                className="bg-[#2c6eb5] text-white"
                data-testid="btn-close-preferences"
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'export'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-sm" data-testid="export-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#2a2a3e]">
              <Download className="w-5 h-5" /> Export Map
            </DialogTitle>
            <DialogDescription className="text-[#6b6b7b]">
              Export the current map view as a PNG image
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="export-legend" className="text-[#2a2a3e] text-xs">Include Legend</Label>
              <Switch
                id="export-legend"
                checked={exportIncludeLegend}
                onCheckedChange={setExportIncludeLegend}
                data-testid="switch-export-legend"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                onClick={handleExportToFile}
                className="bg-[#2c6eb5] text-white w-full"
                data-testid="btn-export-file"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Save as PNG File
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportToClipboard}
                className="bg-[#f0f0f4] border-[#d0d0d8] text-[#2a2a3e] w-full"
                data-testid="btn-export-clipboard"
              >
                <Clipboard className="w-3.5 h-3.5 mr-1.5" />
                Copy to Clipboard
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'groupEdit'} onOpenChange={v => { if (!v) { setOpenDialog(null); setGroupSelectedIds(null); setGroupSelectPoints([]); setInteractionMode('select'); } }}>
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-sm" data-testid="group-edit-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#2a2a3e]">
              Group Edit — {groupSelectedIds?.size || 0} Objects
            </DialogTitle>
            <DialogDescription className="text-[#6b6b7b]">
              Apply a property change to all selected objects
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Label className="text-[#2a2a3e] text-xs w-20">Property</Label>
              <select
                value={groupEditProp}
                onChange={e => setGroupEditProp(e.target.value)}
                className="flex-1 text-xs rounded px-2 py-1.5"
                style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
                data-testid="select-group-property"
              >
                <option value="elevation">Elevation</option>
                <option value="maxDepth">Max Depth</option>
                <option value="initDepth">Init Depth</option>
                <option value="surDepth">Surcharge Depth</option>
                <option value="roughness">Roughness</option>
                <option value="length">Length</option>
                <option value="inOffset">Inlet Offset</option>
                <option value="outOffset">Outlet Offset</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[#2a2a3e] text-xs w-20">Value</Label>
              <Input
                value={groupEditValue}
                onChange={e => setGroupEditValue(e.target.value)}
                className="bg-white border-[#d0d0d8] text-[#2a2a3e]"
                data-testid="input-group-value"
              />
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGroupDelete}
                className="bg-transparent border-[#d04040] text-[#d04040] hover:bg-[#d04040]/10"
                data-testid="btn-group-delete"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Delete All
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setOpenDialog(null); setGroupSelectedIds(null); setGroupSelectPoints([]); setInteractionMode('select'); }}
                  className="bg-[#f0f0f4] border-[#d0d0d8] text-[#2a2a3e]"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleGroupEdit}
                  className="bg-[#2c6eb5] text-white"
                  data-testid="btn-group-apply"
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-3xl max-h-[85vh] flex flex-col" data-testid="report-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#2a2a3e]">
              <BarChart3 className="w-4 h-4" /> SWMM Report
            </DialogTitle>
            <DialogDescription className="text-xs text-[#6b6b7b]">
              Full simulation report output (.rpt file contents)
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            <pre
              className="text-[11px] leading-[1.4] p-3 rounded border border-[#d0d0d8] bg-[#f8f8fa] whitespace-pre overflow-x-auto font-mono"
              style={{ maxHeight: 'calc(85vh - 120px)' }}
              data-testid="report-content"
            >
              {reportContent || 'No report available.'}
            </pre>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (reportContent) {
                  navigator.clipboard.writeText(reportContent);
                  toast({ title: 'Copied', description: 'Report copied to clipboard' });
                }
              }}
              className="bg-white border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4]"
              data-testid="btn-copy-report"
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (reportContent) {
                  const blob = new Blob([reportContent], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = (fileName || 'model').replace(/\.inp$/i, '') + '.rpt';
                  a.click();
                  URL.revokeObjectURL(url);
                }
              }}
              className="bg-white border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4]"
              data-testid="btn-download-report"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download .rpt
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] py-1 rounded shadow-xl"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: '#ffffff',
            border: '1px solid #d0d0d8',
          }}
          data-testid="context-menu"
        >
          {contextMenu.obj && (
            <>
              <div className="px-3 py-1 text-[10px] text-[#6b6b7b] border-b border-[#d0d0d8]" data-testid="context-menu-title">
                {contextMenu.obj.objType} — {contextMenu.obj.id}
              </div>
              <ContextMenuItem icon={<Copy className="w-3 h-3" />} label="Copy" onClick={handleCopy} testId="ctx-copy" />
              <ContextMenuItem icon={<ClipboardPaste className="w-3 h-3" />} label="Paste" onClick={handlePaste} disabled={!copiedObj || copiedObj.objType !== ctxObj?.objType} testId="ctx-paste" />
              {isLinkType && (
                <ContextMenuItem icon={<RotateCcw className="w-3 h-3" />} label="Reverse" onClick={handleReverseLink} testId="ctx-reverse" />
              )}
              <div className="h-px my-0.5" style={{ backgroundColor: '#d0d0d8' }} />
              <ContextMenuItem icon={<Trash2 className="w-3 h-3" />} label="Delete" onClick={() => { if (contextMenu?.obj) deleteObject(contextMenu.obj); closeContextMenu(); }} danger testId="ctx-delete" />
            </>
          )}
          {!contextMenu.obj && (
            <div className="px-3 py-1.5 text-[10px] text-[#9090a0]">No object selected</div>
          )}
        </div>
      )}
    </div>
  );
}

function ContextMenuItem({ icon, label, onClick, disabled, danger, testId }: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick?.(); }}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-black/[0.04] cursor-pointer'}
        ${danger ? 'text-[#d04040]' : 'text-[#2a2a3e]'}`}
      data-testid={testId}
    >
      {icon}
      {label}
    </button>
  );
}

function ToolbarButton({ icon, label, accent, onClick, disabled, testId }: {
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center px-3 py-1 rounded min-w-[54px] transition-colors
        ${accent ? 'bg-[rgba(44,110,181,0.12)] border border-[#2c6eb5]' : 'border border-transparent hover:bg-black/[0.04]'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      data-testid={testId}
    >
      <span className={accent ? 'text-[#2c6eb5]' : 'text-[#4a4a5a]'}>{icon}</span>
      <span className={`text-[9px] mt-0.5 ${accent ? 'text-[#2c6eb5]' : 'text-[#6b6b7b]'}`}>{label}</span>
    </button>
  );
}

function ToolbarIconButton({ icon, onClick, title, testId }: {
  icon: React.ReactNode;
  onClick?: () => void;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1 text-[#6b6b7b] hover:text-[#2a2a3e] transition-colors"
      data-testid={testId}
    >
      {icon}
    </button>
  );
}

function ThemeCombo({ label, value, onChange, options, testId }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-[#6b6b7b] whitespace-nowrap">{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-[10px] rounded px-1.5 py-0.5"
        style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
        data-testid={testId}
      >
        {options.map(([val, lbl]) => (
          <option key={val} value={val}>{lbl}</option>
        ))}
      </select>
    </div>
  );
}

function StatusItem({ text, color, bold }: { text: string; color?: string; bold?: boolean }) {
  return (
    <div
      className="px-3 text-[10px]"
      style={{
        color: color || '#6b6b7b',
        fontWeight: bold ? 600 : 400,
        borderRight: '1px solid #d0d0d8',
      }}
      data-testid={`status-${text.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {text}
    </div>
  );
}

function pointInPolygonWorld(x: number, y: number, polygon: [number, number][]): boolean {
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
