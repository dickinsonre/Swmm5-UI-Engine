import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { SwmmProject, SelectedObject, SimulationResults } from '@/lib/swmm-types';
import { createEmptyProject } from '@/lib/swmm-types';
import { parseInpFile, SAMPLE_INP } from '@/lib/inp-parser';
import { createMockEngine, createRemoteEngine, createLocalEngine, checkRemoteEngine, checkLocalEngine } from '@/lib/swmm-engine';
import { computeCflAnalysis, discretizeProject, getDefaultSettings } from '@/lib/cfl-analysis';
import type { CflAnalysisResult, DiscretizationSettings, DiscretizationResult } from '@/lib/cfl-analysis';
import { importCsvNodes, importCsvLinks, parseDxfFile, importDxfEntities, importGeoJsonNodes, importGeoJsonLinks, parseGeoJsonToNetwork, exportNodesCsv, exportLinksCsv, exportDxf } from '@/lib/import-export';
import type { SwmmEngine } from '@/lib/swmm-engine';
import NetworkMap, { type NetworkMapHandle } from '@/components/swmm/NetworkMap';
import { LegendPanel, ObjectLocatorPanel, MapQueryPanel, evaluateQuery } from '@/components/swmm/Panels';
import type { MapQuery } from '@/components/swmm/Panels';
import ProjectExplorer from '@/components/swmm/ProjectExplorer';
import SpeedBar from '@/components/swmm/SpeedBar';
import type { InteractionMode } from '@/components/swmm/SpeedBar';
import { useToast } from '@/hooks/use-toast';
import {
  FolderOpen, Save, FilePlus, Play, Pause, Download, Upload, Settings,
  ZoomIn, ZoomOut, Maximize, Info, HelpCircle, FileText, Clipboard,
  ArrowLeftRight, Trash2, Search, BarChart3, List, Github,
  Loader2, Check, AlertTriangle, Copy, ClipboardPaste, RotateCcw, X, BookOpen,
  Scissors, ChevronLeft, Folder, File, PanelLeftOpen, PanelRightOpen, Menu,
  Droplets, CloudRain, CheckCircle2, Clock, TrendingUp,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
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
  const [openDialog, setOpenDialog] = useState<'file' | 'github' | 'preferences' | 'export' | 'groupEdit' | 'importData' | 'exportData' | 'profilePlot' | 'timeSeries' | null>(null);
  const [importTab, setImportTab] = useState<'csv-nodes' | 'csv-links' | 'dxf' | 'geojson'>('csv-nodes');
  const [importMode, setImportMode] = useState<'add' | 'modify'>('add');
  const [importPreviewText, setImportPreviewText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [dxfLayers, setDxfLayers] = useState<string[]>([]);
  const [dxfSelectedLayers, setDxfSelectedLayers] = useState<Set<string>>(new Set());
  const [dxfEntities, setDxfEntities] = useState<Array<{ layer: string; type: string; points: [number, number][] }>>([]);
  const [geojsonFeatures, setGeojsonFeatures] = useState<any[]>([]);
  const [geojsonFields, setGeojsonFields] = useState<string[]>([]);
  const [geojsonIdField, setGeojsonIdField] = useState('');
  const [geojsonElevField, setGeojsonElevField] = useState('');
  const [geojsonType, setGeojsonType] = useState<'nodes' | 'links'>('nodes');
  const importFileRef = useRef<HTMLInputElement>(null);
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
  const [multiSelectIds, setMultiSelectIds] = useState<Set<string> | null>(null);
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

  const undoStackRef = useRef<SwmmProject[]>([]);
  const redoStackRef = useRef<SwmmProject[]>([]);
  const lastProjectRef = useRef<SwmmProject>(project);

  const pushUndo = useCallback((proj: SwmmProject) => {
    undoStackRef.current = [...undoStackRef.current.slice(-49), proj];
    redoStackRef.current = [];
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, project];
    setProject(prev);
    lastProjectRef.current = prev;
    toast({ title: 'Undo', description: 'Reverted last change' });
  }, [project, toast]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, project];
    setProject(next);
    lastProjectRef.current = next;
    toast({ title: 'Redo', description: 'Reapplied change' });
  }, [project, toast]);

  useEffect(() => {
    if (project !== lastProjectRef.current) {
      pushUndo(lastProjectRef.current);
      lastProjectRef.current = project;
    }
  }, [project, pushUndo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const handleUpdateProject = useCallback((updater: (prev: SwmmProject) => SwmmProject) => {
    setProject(updater);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const maxTimeStep = results ? results.timeSteps.length - 1 : 0;

  const queryMatchIds = useMemo(() => {
    if (!mapQuery.active) return null;
    return evaluateQuery(mapQuery, project, results, timeStep);
  }, [mapQuery, project, results, timeStep]);
  const queryObjectType = mapQuery.active ? mapQuery.objectType : null;

  const handleFileOpen = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseInpFile(text);
      setProject(parsed);
      setFileName(file.name);
      setResults(null);
      setReportContent(null);
      setSimStatus('none');
      setTimeStep(0);
      setSelectedObj(null);
      setMultiSelectIds(null);
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
      setMultiSelectIds(null);
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
      setReportContent(null);
      setSimStatus('none');
      setTimeStep(0);
      setSelectedObj(null);
      setMultiSelectIds(null);
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
    setMultiSelectIds(null);
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
      setReportContent(null);
      setSimStatus('none');
      setTimeStep(0);
      setSelectedObj(null);
      setMultiSelectIds(null);
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

  const handleImportFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext === 'dxf') {
        setImportTab('dxf');
        const parsed = parseDxfFile(text);
        setDxfLayers(parsed.layers);
        setDxfSelectedLayers(new Set(parsed.layers));
        setDxfEntities(parsed.entities);
        setImportPreviewText(`${parsed.entities.length} entities found across ${parsed.layers.length} layers`);
      } else if (ext === 'geojson' || ext === 'json') {
        setImportTab('geojson');
        try {
          const parsed = parseGeoJsonToNetwork(text, 'nodes');
          setGeojsonFeatures(parsed.features);
          setGeojsonFields(parsed.fields);
          if (parsed.fields.length > 0) setGeojsonIdField(parsed.fields[0]);
          setImportPreviewText(`${parsed.features.length} features, ${parsed.fields.length} fields`);
        } catch (err: any) {
          setImportPreviewText(`Parse error: ${err.message}`);
        }
      } else {
        setImportPreviewText(text);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleImportExecute = useCallback(() => {
    const newProject = JSON.parse(JSON.stringify(project)) as SwmmProject;
    let msg = '';
    if (importTab === 'csv-nodes') {
      const res = importCsvNodes(newProject, importPreviewText, importMode);
      msg = `Added ${res.nodesAdded} nodes, modified ${res.nodesModified}`;
      if (res.errors.length > 0) msg += `. Errors: ${res.errors.slice(0, 3).join('; ')}`;
    } else if (importTab === 'csv-links') {
      const res = importCsvLinks(newProject, importPreviewText, importMode);
      msg = `Added ${res.linksAdded} links, modified ${res.linksModified}`;
      if (res.errors.length > 0) msg += `. Errors: ${res.errors.slice(0, 3).join('; ')}`;
    } else if (importTab === 'dxf') {
      const res = importDxfEntities(newProject, dxfEntities, dxfSelectedLayers);
      msg = `Added ${res.nodesAdded} nodes, ${res.linksAdded} links from DXF`;
    } else if (importTab === 'geojson') {
      if (geojsonType === 'nodes') {
        const res = importGeoJsonNodes(newProject, geojsonFeatures, geojsonIdField, geojsonElevField);
        msg = `Added ${res.nodesAdded} nodes from GeoJSON`;
        if (res.errors.length > 0) msg += `. Errors: ${res.errors.slice(0, 3).join('; ')}`;
      } else {
        const res = importGeoJsonLinks(newProject, geojsonFeatures, geojsonIdField);
        msg = `Added ${res.linksAdded} links, ${res.nodesAdded} nodes from GeoJSON`;
        if (res.errors.length > 0) msg += `. Errors: ${res.errors.slice(0, 3).join('; ')}`;
      }
    }
    setProject(newProject);
    setOpenDialog(null);
    toast({ title: 'Import Complete', description: msg });
  }, [project, importTab, importPreviewText, importMode, dxfEntities, dxfSelectedLayers, geojsonFeatures, geojsonIdField, geojsonElevField, geojsonType, toast]);

  const handleExportData = useCallback((format: 'csv-nodes' | 'csv-links' | 'dxf') => {
    let content = '';
    let filename = '';
    let mimeType = 'text/plain';
    if (format === 'csv-nodes') {
      content = exportNodesCsv(project);
      filename = fileName.replace(/\.inp$/i, '') + '_nodes.csv';
      mimeType = 'text/csv';
    } else if (format === 'csv-links') {
      content = exportLinksCsv(project);
      filename = fileName.replace(/\.inp$/i, '') + '_links.csv';
      mimeType = 'text/csv';
    } else if (format === 'dxf') {
      content = exportDxf(project);
      filename = fileName.replace(/\.inp$/i, '') + '.dxf';
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: `Saved ${filename}` });
    setOpenDialog(null);
  }, [project, fileName, toast]);

  useEffect(() => {
    let localOk = false;
    checkLocalEngine().then(available => {
      localOk = available;
      setLocalAvailable(available);
      if (available) setEngineMode('local');
    });
    checkRemoteEngine().then(available => {
      setRemoteAvailable(available);
      if (available && !localOk) setEngineMode('remote');
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

  const handleSelectObj = useCallback((obj: SelectedObject | null) => {
    setSelectedObj(obj);
    setMultiSelectIds(null);
  }, []);

  const handleShiftClick = useCallback((id: string, _objType: string) => {
    setMultiSelectIds(prev => {
      const next = new Set(prev || []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size > 0 ? next : null;
    });
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
      <input ref={importFileRef} type="file" accept=".csv,.dxf,.geojson,.json" onChange={handleImportFileSelect} className="hidden" data-testid="import-file-input" />

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
            <ToolbarButton icon={<Download className="w-4 h-4" />} label="Export" onClick={() => setOpenDialog('exportData')} testId="btn-export" />
            <ToolbarButton icon={<Upload className="w-4 h-4" />} label="Import" onClick={() => { setImportPreviewText(''); setImportFileName(''); setDxfLayers([]); setDxfSelectedLayers(new Set()); setDxfEntities([]); setGeojsonFeatures([]); setGeojsonFields([]); setGeojsonIdField(''); setGeojsonElevField(''); setOpenDialog('importData'); }} testId="btn-import" />
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
            <ToolbarButton icon={<RotateCcw className="w-4 h-4" />} label="Undo" onClick={handleUndo} testId="btn-undo" />
            <ToolbarButton icon={<RotateCcw className="w-4 h-4 scale-x-[-1]" />} label="Redo" onClick={handleRedo} testId="btn-redo" />
            <div className="w-px h-5 bg-[#d0d0d8] mx-1" />
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
              primary
              onClick={handleRunSimulation}
              disabled={simStatus === 'running'}
              testId="btn-run"
            />
            <ToolbarButton icon={<BarChart3 className="w-4 h-4" />} label="Report" onClick={() => { if (reportContent) setShowReportDialog(true); else toast({ title: 'No Report', description: 'Run a simulation first to generate a report' }); }} testId="btn-report" />
            <ToolbarButton icon={<ArrowLeftRight className="w-4 h-4" />} label="Profile" onClick={() => setOpenDialog('profilePlot')} testId="btn-profile-plot" />
            <ToolbarButton icon={<TrendingUp className="w-4 h-4" />} label="Graph" onClick={() => { if (results) setOpenDialog('timeSeries'); else toast({ title: 'No Results', description: 'Run a simulation first to view time series graphs' }); }} testId="btn-graph" />
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
              matchCount={mapQuery.active ? evaluateQuery(mapQuery, project, results, timeStep).size : 0}
              hasResults={!!results}
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
            onSelectObj={handleSelectObj}
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
            onShiftClick={handleShiftClick}
            linkDrawState={linkDrawState}
            groupSelectPoints={groupSelectPoints}
            groupSelectedIds={groupSelectedIds}
            multiSelectIds={multiSelectIds}
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
            onSelectObj={handleSelectObj}
            results={results}
            timeStep={timeStep}
            onUpdateProject={handleUpdateProject}
          />
        </div>
      </div>

      <div className="h-7 flex items-center px-1 md:px-2 shrink-0 overflow-x-auto gap-0.5" style={{ backgroundColor: '#f0f0f4', borderTop: '1px solid #d0d0d8' }} data-testid="status-bar">
        <StatusItem text={flowUnits} icon={<Droplets className="w-3 h-3" />} />
        <span className="mobile-hidden"><StatusItem text={routingModel} icon={<ArrowLeftRight className="w-3 h-3" />} /></span>
        <span className="mobile-hidden"><StatusItem text={infiltModel} icon={<CloudRain className="w-3 h-3" />} /></span>
        <StatusItem
          text={simStatus === 'current' ? 'Results Current' : simStatus === 'running' ? (simProgressMsg || 'Running...') : 'No Results'}
          color={simStatus === 'current' ? '#2a8a4a' : simStatus === 'running' ? '#c08820' : '#6b6b7b'}
          bold={simStatus === 'current'}
          icon={simStatus === 'current' ? <CheckCircle2 className="w-3 h-3" /> : simStatus === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
        />
        {cflAnalysis && cflAnalysis.flaggedCount > 0 && (
          <StatusItem
            text={`CFL: ${cflAnalysis.flaggedCount}`}
            color="#d04040"
            icon={<AlertTriangle className="w-3 h-3" />}
            onClick={() => setShowCflPanel(true)}
          />
        )}
        {cflAnalysis && cflAnalysis.flaggedCount === 0 && cflAnalysis.totalCount > 0 && (
          <StatusItem
            text="CFL: OK"
            color="#2a8a4a"
            icon={<CheckCircle2 className="w-3 h-3" />}
          />
        )}
        <StatusItem
          text={engineMode === 'local' ? 'Local 5.2.4' : engineMode === 'remote' ? 'Remote 5.2.4' : 'Mock'}
          color={engineMode === 'local' ? '#2a8a4a' : engineMode === 'remote' ? '#2c6eb5' : '#6b6b7b'}
          icon={<span className={`w-2 h-2 rounded-full inline-block ${engineMode === 'local' ? 'bg-[#2a8a4a]' : engineMode === 'remote' ? 'bg-[#2c6eb5]' : 'bg-[#9090a0]'}`} />}
        />
        <div className="flex-1" />
        <span className="text-[9px] font-mono text-[#6b6b7b] flex items-center gap-1.5" data-testid="status-counts">
          <span className="bg-[#e8edf2] px-1.5 py-0.5 rounded text-[#4a4a5a]">{project.junctions.length + project.outfalls.length + project.storageUnits.length + project.dividers.length} nodes</span>
          <span className="bg-[#e8edf2] px-1.5 py-0.5 rounded text-[#4a4a5a]">{project.conduits.length + project.pumps.length + project.weirs.length + project.orifices.length + project.outlets.length} links</span>
          <span className="bg-[#e8edf2] px-1.5 py-0.5 rounded text-[#4a4a5a]">{project.subcatchments.length} subcatch</span>
        </span>
        <span className="text-[9px] text-[#9090a0] mx-1.5">|</span>
        <a
          href="https://github.com/SWMMEnablement"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] text-[#6b6b7b] hover:text-[#2c6eb5] transition-colors"
          data-testid="link-credit"
        >
          SWMMEnablement
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

      <Dialog open={openDialog === 'importData'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-lg" data-testid="import-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#2a2a3e]">
              <Upload className="w-5 h-5" /> Import Data
            </DialogTitle>
            <DialogDescription className="text-[#6b6b7b]">
              Import nodes and links from CSV, DXF, or GeoJSON files
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-1">
              {(['csv-nodes', 'csv-links', 'dxf', 'geojson'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setImportTab(tab)}
                  className="px-2.5 py-1 text-[10px] rounded"
                  style={{
                    backgroundColor: importTab === tab ? '#2c6eb5' : '#f0f0f4',
                    color: importTab === tab ? '#ffffff' : '#2a2a3e',
                    border: `1px solid ${importTab === tab ? '#2c6eb5' : '#d0d0d8'}`,
                  }}
                  data-testid={`tab-import-${tab}`}
                >
                  {tab === 'csv-nodes' ? 'CSV Nodes' : tab === 'csv-links' ? 'CSV Links' : tab.toUpperCase()}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => importFileRef.current?.click()}
              className="w-full bg-[#f0f0f4] border-[#d0d0d8] text-[#2a2a3e]"
              data-testid="btn-import-browse"
            >
              <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
              {importFileName || 'Choose File...'}
            </Button>

            {(importTab === 'csv-nodes' || importTab === 'csv-links') && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-[#2a2a3e] w-16">Mode</Label>
                  <select
                    value={importMode}
                    onChange={e => setImportMode(e.target.value as 'add' | 'modify')}
                    className="flex-1 text-xs rounded px-2 py-1"
                    style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
                    data-testid="select-import-mode"
                  >
                    <option value="add">Add New</option>
                    <option value="modify">Modify Existing</option>
                  </select>
                </div>
                <div className="text-[10px] text-[#6b6b7b] bg-[#f8f8fa] rounded p-2 border border-[#d0d0d8]">
                  {importTab === 'csv-nodes' ? (
                    <>Expected columns: <strong>ID, X, Y, Elevation, MaxDepth, Type</strong> (Type: junction/outfall/storage)</>
                  ) : (
                    <>Expected columns: <strong>ID, From, To, Length, Roughness, Diameter</strong></>
                  )}
                </div>
                <textarea
                  value={importPreviewText}
                  onChange={e => setImportPreviewText(e.target.value)}
                  className="w-full h-28 text-[10px] font-mono rounded p-2"
                  style={{ backgroundColor: '#f8f8fa', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
                  placeholder="Paste CSV data here or browse for a file..."
                  data-testid="textarea-import-csv"
                />
              </div>
            )}

            {importTab === 'dxf' && (
              <div className="space-y-2">
                <div className="text-[10px] text-[#6b6b7b]">{importPreviewText}</div>
                {dxfLayers.length > 0 && (
                  <div className="bg-[#f8f8fa] rounded p-2 border border-[#d0d0d8] max-h-32 overflow-y-auto">
                    <div className="text-[10px] text-[#6b6b7b] mb-1 font-semibold">Select Layers:</div>
                    {dxfLayers.map(layer => (
                      <label key={layer} className="flex items-center gap-1.5 text-[10px] text-[#2a2a3e] cursor-pointer py-0.5">
                        <input
                          type="checkbox"
                          checked={dxfSelectedLayers.has(layer)}
                          onChange={e => {
                            const next = new Set(dxfSelectedLayers);
                            e.target.checked ? next.add(layer) : next.delete(layer);
                            setDxfSelectedLayers(next);
                          }}
                          data-testid={`checkbox-dxf-layer-${layer}`}
                        />
                        {layer}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {importTab === 'geojson' && (
              <div className="space-y-2">
                <div className="text-[10px] text-[#6b6b7b]">{importPreviewText}</div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-[#2a2a3e] w-16">Type</Label>
                  <select
                    value={geojsonType}
                    onChange={e => setGeojsonType(e.target.value as 'nodes' | 'links')}
                    className="flex-1 text-xs rounded px-2 py-1"
                    style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
                    data-testid="select-geojson-type"
                  >
                    <option value="nodes">Nodes (Points)</option>
                    <option value="links">Links (Lines)</option>
                  </select>
                </div>
                {geojsonFields.length > 0 && (
                  <>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-[#2a2a3e] w-16">ID Field</Label>
                      <select
                        value={geojsonIdField}
                        onChange={e => setGeojsonIdField(e.target.value)}
                        className="flex-1 text-xs rounded px-2 py-1"
                        style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
                        data-testid="select-geojson-id"
                      >
                        <option value="">(auto-generate)</option>
                        {geojsonFields.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    {geojsonType === 'nodes' && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-[#2a2a3e] w-16">Elev</Label>
                        <select
                          value={geojsonElevField}
                          onChange={e => setGeojsonElevField(e.target.value)}
                          className="flex-1 text-xs rounded px-2 py-1"
                          style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
                          data-testid="select-geojson-elev"
                        >
                          <option value="">(none)</option>
                          {geojsonFields.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenDialog(null)}
                className="bg-[#f0f0f4] border-[#d0d0d8] text-[#2a2a3e]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleImportExecute}
                className="bg-[#2c6eb5] text-white"
                disabled={
                  (importTab === 'csv-nodes' || importTab === 'csv-links') ? !importPreviewText :
                  importTab === 'dxf' ? dxfEntities.length === 0 :
                  geojsonFeatures.length === 0
                }
                data-testid="btn-import-execute"
              >
                <Upload className="w-3.5 h-3.5 mr-1" />
                Import
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'exportData'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-sm" data-testid="export-data-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#2a2a3e]">
              <Download className="w-5 h-5" /> Export Data
            </DialogTitle>
            <DialogDescription className="text-[#6b6b7b]">
              Export project data to CSV or DXF format
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportData('csv-nodes')}
              className="w-full bg-[#f0f0f4] border-[#d0d0d8] text-[#2a2a3e] justify-start"
              data-testid="btn-export-csv-nodes"
            >
              <FileText className="w-3.5 h-3.5 mr-2" />
              Export Nodes as CSV
              <span className="ml-auto text-[10px] text-[#6b6b7b]">{project.junctions.length + project.outfalls.length + project.storageUnits.length} nodes</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportData('csv-links')}
              className="w-full bg-[#f0f0f4] border-[#d0d0d8] text-[#2a2a3e] justify-start"
              data-testid="btn-export-csv-links"
            >
              <FileText className="w-3.5 h-3.5 mr-2" />
              Export Links as CSV
              <span className="ml-auto text-[10px] text-[#6b6b7b]">{project.conduits.length} links</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportData('dxf')}
              className="w-full bg-[#f0f0f4] border-[#d0d0d8] text-[#2a2a3e] justify-start"
              data-testid="btn-export-dxf"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 mr-2" />
              Export Network as DXF
              <span className="ml-auto text-[10px] text-[#6b6b7b]">CAD format</span>
            </Button>
            <div className="border-t pt-2 mt-2" style={{ borderColor: '#d0d0d8' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setOpenDialog('export'); }}
                className="w-full bg-[#f0f0f4] border-[#d0d0d8] text-[#2a2a3e] justify-start"
                data-testid="btn-export-map-png"
              >
                <Download className="w-3.5 h-3.5 mr-2" />
                Export Map as PNG Image
              </Button>
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

      <Dialog open={openDialog === 'profilePlot'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="max-w-4xl bg-white border-[#d0d0d8]">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" /> Profile Plot
            </DialogTitle>
            <DialogDescription>Select conduits to define a longitudinal path and view the profile.</DialogDescription>
          </DialogHeader>
          <ProfilePlotContent project={project} results={results} timeStep={timeStep} />
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'timeSeries'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="max-w-5xl bg-white border-[#d0d0d8]" data-testid="time-series-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Time Series Graph
            </DialogTitle>
            <DialogDescription>View simulation results over time for any node, link, or subcatchment.</DialogDescription>
          </DialogHeader>
          {results && <TimeSeriesPlotContent project={project} results={results} selectedObj={selectedObj} timeStep={timeStep} />}
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

function ToolbarButton({ icon, label, accent, primary, onClick, disabled, testId }: {
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
  primary?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center px-3 py-1 rounded min-w-[54px] transition-colors
        ${primary ? 'bg-[#1a7a3a] border border-[#15692f] shadow-sm' : accent ? 'bg-[rgba(44,110,181,0.12)] border border-[#2c6eb5]' : 'border border-transparent hover:bg-black/[0.04]'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : primary ? 'cursor-pointer hover:bg-[#1e8a42]' : 'cursor-pointer'}`}
      data-testid={testId}
    >
      <span className={primary ? 'text-white' : accent ? 'text-[#2c6eb5]' : 'text-[#4a4a5a]'}>{icon}</span>
      <span className={`text-[9px] mt-0.5 ${primary ? 'text-white font-semibold' : accent ? 'text-[#2c6eb5]' : 'text-[#6b6b7b]'}`}>{label}</span>
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

function StatusItem({ text, color, bold, icon, onClick }: { text: string; color?: string; bold?: boolean; icon?: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] flex items-center gap-1 ${onClick ? 'cursor-pointer hover:bg-black/[0.06] rounded transition-colors' : ''}`}
      style={{
        color: color || '#6b6b7b',
        fontWeight: bold ? 600 : 400,
        borderRight: onClick ? 'none' : '1px solid #d0d0d8',
      }}
      data-testid={`status-${text.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {icon && <span className="flex items-center">{icon}</span>}
      {text}
    </div>
  );
}

const TS_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#65a30d'];
const NODE_VARS: { key: string; label: string; unit: string }[] = [
  { key: 'depth', label: 'Depth', unit: 'ft' },
  { key: 'head', label: 'Head', unit: 'ft' },
  { key: 'totalInflow', label: 'Total Inflow', unit: 'CFS' },
  { key: 'lateralInflow', label: 'Lateral Inflow', unit: 'CFS' },
  { key: 'flooding', label: 'Flooding', unit: 'CFS' },
  { key: 'volume', label: 'Volume', unit: 'ft³' },
];
const LINK_VARS: { key: string; label: string; unit: string }[] = [
  { key: 'flow', label: 'Flow', unit: 'CFS' },
  { key: 'velocity', label: 'Velocity', unit: 'ft/s' },
  { key: 'depth', label: 'Depth', unit: 'ft' },
  { key: 'capacity', label: 'Capacity', unit: '' },
  { key: 'volume', label: 'Volume', unit: 'ft³' },
];
const SUBCATCH_VARS: { key: string; label: string; unit: string }[] = [
  { key: 'rainfall', label: 'Rainfall', unit: 'in/hr' },
  { key: 'runoff', label: 'Runoff', unit: 'CFS' },
  { key: 'infiltration', label: 'Infiltration', unit: 'in/hr' },
  { key: 'evap', label: 'Evaporation', unit: 'in/hr' },
  { key: 'gwOutflow', label: 'GW Outflow', unit: 'CFS' },
  { key: 'moisture', label: 'Soil Moisture', unit: '' },
];

function TimeSeriesPlotContent({ project, results, selectedObj, timeStep }: {
  project: SwmmProject;
  results: SimulationResults;
  selectedObj: SelectedObject;
  timeStep: number;
}) {
  const nodeIds = useMemo(() => [
    ...project.junctions.map(j => j.id),
    ...project.outfalls.map(o => o.id),
    ...project.storageUnits.map(s => s.id),
    ...project.dividers.map(d => d.id),
  ], [project]);
  const linkIds = useMemo(() => [
    ...project.conduits.map(c => c.id),
    ...project.pumps.map(p => p.id),
    ...project.weirs.map(w => w.id),
    ...project.orifices.map(o => o.id),
    ...project.outlets.map(o => o.id),
  ], [project]);
  const subcatchIds = useMemo(() => project.subcatchments.map(s => s.id), [project]);

  const initCategory = selectedObj
    ? (nodeIds.includes(selectedObj.id) ? 'node' : linkIds.includes(selectedObj.id) ? 'link' : subcatchIds.includes(selectedObj.id) ? 'subcatch' : 'node')
    : 'node';

  const [category, setCategory] = useState<'node' | 'link' | 'subcatch'>(initCategory);
  const [elementIds, setElementIds] = useState<string[]>(selectedObj ? [selectedObj.id] : []);
  const [activeVars, setActiveVars] = useState<string[]>(() => {
    if (initCategory === 'node') return ['depth'];
    if (initCategory === 'link') return ['flow'];
    return ['runoff'];
  });
  const [searchText, setSearchText] = useState('');
  const [showCompare, setShowCompare] = useState(false);

  const varDefs = category === 'node' ? NODE_VARS : category === 'link' ? LINK_VARS : SUBCATCH_VARS;
  const allIds = category === 'node' ? nodeIds : category === 'link' ? linkIds : subcatchIds;

  const filteredIds = useMemo(() => {
    if (!searchText) return allIds.slice(0, 100);
    const lower = searchText.toLowerCase();
    return allIds.filter(id => id.toLowerCase().includes(lower)).slice(0, 100);
  }, [allIds, searchText]);

  const chartData = useMemo(() => {
    if (elementIds.length === 0 || activeVars.length === 0) return [];
    return results.timeSteps.map((ts, i) => {
      const row: Record<string, number | string> = { time: ts.dateTime, idx: i };
      for (const elId of elementIds) {
        for (const v of activeVars) {
          const key = elementIds.length > 1 ? `${elId}_${v}` : v;
          if (category === 'node') {
            const nr = ts.nodes[elId];
            row[key] = nr ? (nr as Record<string, number>)[v] ?? 0 : 0;
          } else if (category === 'link') {
            const lr = ts.links[elId];
            row[key] = lr ? (lr as Record<string, number>)[v] ?? 0 : 0;
          } else {
            const sr = ts.subcatchments[elId];
            row[key] = sr ? (sr as Record<string, number>)[v] ?? 0 : 0;
          }
        }
      }
      return row;
    });
  }, [results, elementIds, activeVars, category]);

  const lineKeys = useMemo(() => {
    const keys: { key: string; label: string; color: string }[] = [];
    let ci = 0;
    for (const elId of elementIds) {
      for (const v of activeVars) {
        const varDef = varDefs.find(vd => vd.key === v);
        const key = elementIds.length > 1 ? `${elId}_${v}` : v;
        const label = elementIds.length > 1 ? `${elId} — ${varDef?.label || v}` : (varDef?.label || v);
        keys.push({ key, label, color: TS_COLORS[ci % TS_COLORS.length] });
        ci++;
      }
    }
    return keys;
  }, [elementIds, activeVars, varDefs]);

  const peakValues = useMemo(() => {
    if (chartData.length === 0 || lineKeys.length === 0) return {};
    const peaks: Record<string, { max: number; time: string }> = {};
    for (const lk of lineKeys) {
      let maxVal = -Infinity;
      let maxTime = '';
      for (const row of chartData) {
        const val = row[lk.key] as number;
        if (val > maxVal) { maxVal = val; maxTime = row.time as string; }
      }
      peaks[lk.key] = { max: maxVal, time: maxTime };
    }
    return peaks;
  }, [chartData, lineKeys]);

  const handleCategoryChange = (cat: 'node' | 'link' | 'subcatch') => {
    setCategory(cat);
    setElementIds([]);
    setSearchText('');
    if (cat === 'node') setActiveVars(['depth']);
    else if (cat === 'link') setActiveVars(['flow']);
    else setActiveVars(['runoff']);
  };

  const toggleElement = (id: string) => {
    if (showCompare) {
      setElementIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, 6));
    } else {
      setElementIds([id]);
    }
  };

  const toggleVar = (key: string) => {
    setActiveVars(prev => prev.includes(key) ? prev.filter(v => v !== key) : [...prev, key]);
  };

  return (
    <div className="flex gap-3" style={{ minHeight: 420 }} data-testid="time-series-content">
      <div className="w-44 shrink-0 flex flex-col gap-2 border-r border-[#d0d0d8] pr-3">
        <div className="flex gap-1">
          {(['node', 'link', 'subcatch'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`flex-1 text-[10px] py-1 rounded font-medium transition-colors ${
                category === cat ? 'bg-[#2c6eb5] text-white' : 'bg-[#e8edf2] text-[#4a4a5a] hover:bg-[#d0d8e4]'
              }`}
              data-testid={`ts-cat-${cat}`}
            >
              {cat === 'node' ? 'Nodes' : cat === 'link' ? 'Links' : 'Subcatch'}
            </button>
          ))}
        </div>

        <Input
          placeholder="Search..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="h-6 text-[10px] bg-white border-[#d0d0d8]"
          data-testid="ts-search"
        />

        <label className="flex items-center gap-1.5 text-[9px] text-[#6b6b7b] cursor-pointer">
          <input type="checkbox" checked={showCompare} onChange={() => setShowCompare(!showCompare)} className="w-3 h-3 accent-[#2c6eb5]" />
          Compare (multi-select)
        </label>

        <div className="flex-1 overflow-y-auto border border-[#d0d0d8] rounded" style={{ maxHeight: 220 }}>
          {filteredIds.map(id => (
            <div
              key={id}
              onClick={() => toggleElement(id)}
              className={`px-2 py-[3px] text-[10px] font-mono cursor-pointer transition-colors truncate ${
                elementIds.includes(id) ? 'bg-[#2c6eb5] text-white' : 'text-[#2a2a3e] hover:bg-[#e8edf2]'
              }`}
              data-testid={`ts-el-${id}`}
            >
              {id}
            </div>
          ))}
          {filteredIds.length === 0 && <div className="px-2 py-2 text-[9px] text-[#9090a0] text-center">No results</div>}
        </div>

        <div className="text-[9px] font-semibold text-[#4a4a5a] mt-1">Variables</div>
        {varDefs.map(v => (
          <label key={v.key} className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-[#f0f0f4] rounded px-1 py-px" data-testid={`ts-var-${v.key}`}>
            <input
              type="checkbox"
              checked={activeVars.includes(v.key)}
              onChange={() => toggleVar(v.key)}
              className="w-3 h-3 accent-[#2c6eb5]"
            />
            <span className={activeVars.includes(v.key) ? 'text-[#2a2a3e] font-medium' : 'text-[#6b6b7b]'}>{v.label}</span>
            {v.unit && <span className="text-[8px] text-[#9090a0] ml-auto">{v.unit}</span>}
          </label>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {elementIds.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[#9090a0] text-sm">
            Select a {category === 'node' ? 'node' : category === 'link' ? 'link' : 'subcatchment'} to view its time series
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[#9090a0] text-sm">No data available</div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold text-[#2c3e6b]">
                {elementIds.length === 1 ? elementIds[0] : `${elementIds.length} elements`}
                {activeVars.length === 1 && ` — ${varDefs.find(v => v.key === activeVars[0])?.label}`}
              </div>
              {Object.keys(peakValues).length > 0 && (
                <div className="flex gap-3">
                  {lineKeys.map(lk => {
                    const p = peakValues[lk.key];
                    return p ? (
                      <span key={lk.key} className="text-[9px] text-[#6b6b7b]">
                        <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: lk.color }} />
                        Peak: <span className="font-mono font-medium text-[#2a2a3e]">{p.max.toFixed(2)}</span> at {p.time}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>
            <div className="flex-1" style={{ minHeight: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 9, fill: '#6b6b7b' }}
                    interval="preserveStartEnd"
                    minTickGap={50}
                  />
                  <YAxis tick={{ fontSize: 9, fill: '#6b6b7b' }} width={55} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, backgroundColor: '#fff', border: '1px solid #d0d0d8', borderRadius: 6 }}
                    labelStyle={{ fontWeight: 600, color: '#2c3e6b' }}
                  />
                  {lineKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
                  {lineKeys.map(lk => (
                    <Line
                      key={lk.key}
                      type="monotone"
                      dataKey={lk.key}
                      name={lk.label}
                      stroke={lk.color}
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                    />
                  ))}
                  {results.timeSteps.length > 0 && timeStep > 0 && timeStep < results.timeSteps.length && (
                    <Line
                      dataKey={() => null}
                      stroke="transparent"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-2 mt-2 text-[9px] text-[#6b6b7b]">
              <span>{results.timeSteps.length} time steps</span>
              <span>·</span>
              <span>Duration: {results.timeSteps.length > 0 ? results.timeSteps[results.timeSteps.length - 1].dateTime : '—'}</span>
              {elementIds.length === 1 && activeVars.length === 1 && peakValues[activeVars[0]] && (
                <>
                  <span>·</span>
                  <span className="font-medium text-[#2c6eb5]">
                    Peak {varDefs.find(v => v.key === activeVars[0])?.label}: {peakValues[activeVars[0]].max.toFixed(3)} {varDefs.find(v => v.key === activeVars[0])?.unit} at {peakValues[activeVars[0]].time}
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ProfilePlotContent({ project, results, timeStep }: {
  project: SwmmProject;
  results: SimulationResults | null;
  timeStep: number;
}) {
  const [selectedConduits, setSelectedConduits] = useState<string[]>([]);
  const [inputVal, setInputVal] = useState('');

  const allConduitIds = useMemo(() => project.conduits.map(c => c.id), [project.conduits]);

  const addConduit = useCallback((id: string) => {
    if (id && allConduitIds.includes(id) && !selectedConduits.includes(id)) {
      setSelectedConduits(prev => [...prev, id]);
      setInputVal('');
    }
  }, [allConduitIds, selectedConduits]);

  const autoTrace = useCallback(() => {
    if (selectedConduits.length === 0) return;
    const lastConduit = project.conduits.find(c => c.id === selectedConduits[selectedConduits.length - 1]);
    if (!lastConduit) return;
    const path = [...selectedConduits];
    let currentNode = lastConduit.toNode;
    for (let i = 0; i < 100; i++) {
      const next = project.conduits.find(c => c.fromNode === currentNode && !path.includes(c.id));
      if (!next) break;
      path.push(next.id);
      currentNode = next.toNode;
    }
    setSelectedConduits(path);
  }, [selectedConduits, project.conduits]);

  const profileData = useMemo(() => {
    if (selectedConduits.length === 0) return [];
    const data: { station: number; invert: number; crown: number; ground: number; hgl?: number; label: string }[] = [];
    let station = 0;

    for (let i = 0; i < selectedConduits.length; i++) {
      const conduit = project.conduits.find(c => c.id === selectedConduits[i]);
      if (!conduit) continue;

      const findNode = (nid: string) =>
        project.junctions.find(j => j.id === nid)
        || project.outfalls.find(o => o.id === nid)
        || project.storageUnits.find(s => s.id === nid)
        || project.dividers.find(d => d.id === nid);
      const fromJunction = findNode(conduit.fromNode);
      const toJunction = findNode(conduit.toNode);

      if (!fromJunction || !toJunction) continue;

      const fromElev = fromJunction.elevation ?? 0;
      const toElev = toJunction.elevation ?? 0;
      const xs = project.xsections[conduit.id];
      const geom1 = xs?.geom1 ?? 1;
      const conduitLength = conduit.length ?? 100;
      const inOff = conduit.inOffset ?? 0;
      const outOff = conduit.outOffset ?? 0;
      const fromMaxDepth = (fromJunction as any).maxDepth ?? 0;
      const toMaxDepth = (toJunction as any).maxDepth ?? 0;

      if (i === 0) {
        const fromHgl = results?.timeSteps[timeStep]?.nodes[conduit.fromNode];
        data.push({
          station,
          invert: fromElev,
          crown: fromElev + inOff + geom1,
          ground: fromElev + fromMaxDepth,
          hgl: fromHgl ? fromElev + fromHgl.depth : undefined,
          label: conduit.fromNode,
        });
      }

      station += conduitLength;
      const toHgl = results?.timeSteps[timeStep]?.nodes[conduit.toNode];
      data.push({
        station,
        invert: toElev,
        crown: toElev + outOff + geom1,
        ground: toElev + toMaxDepth,
        hgl: toHgl ? toElev + toHgl.depth : undefined,
        label: conduit.toNode,
      });
    }
    return data;
  }, [selectedConduits, project, results, timeStep]);

  const suggestions = useMemo(() => {
    if (!inputVal) return [];
    const lower = inputVal.toLowerCase();
    return allConduitIds.filter(id => id.toLowerCase().includes(lower) && !selectedConduits.includes(id)).slice(0, 8);
  }, [inputVal, allConduitIds, selectedConduits]);

  return (
    <div className="space-y-3" data-testid="profile-plot-content">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && suggestions.length > 0) addConduit(suggestions[0]); }}
            placeholder="Type conduit ID..."
            className="w-full text-[11px] px-2 py-1.5 rounded border border-[#d0d0d8] bg-white text-[#2a2a3e] outline-none focus:border-[#2c6eb5]"
            data-testid="input-profile-conduit"
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 bg-white border border-[#d0d0d8] rounded-b shadow-lg max-h-32 overflow-y-auto">
              {suggestions.map(id => (
                <button
                  key={id}
                  onClick={() => addConduit(id)}
                  className="w-full text-left px-2 py-1 text-[11px] text-[#2a2a3e] hover:bg-[#e8f0fb]"
                  data-testid={`profile-suggest-${id}`}
                >
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={autoTrace} disabled={selectedConduits.length === 0} className="text-[11px] h-7 bg-white border-[#d0d0d8] text-[#2a2a3e]" data-testid="btn-auto-trace">
          Auto-Trace
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSelectedConduits([])} className="text-[11px] h-7 bg-white border-[#d0d0d8] text-[#2a2a3e]" data-testid="btn-clear-profile">
          Clear
        </Button>
      </div>

      {selectedConduits.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedConduits.map((id, i) => (
            <span key={id} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-[#e8f0fb] text-[#2c6eb5] border border-[#b8d4f0]" data-testid={`profile-chip-${id}`}>
              {i + 1}. {id}
              <button onClick={() => setSelectedConduits(prev => prev.filter(c => c !== id))} className="text-[#6b6b7b] hover:text-[#2a2a3e]">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {profileData.length > 0 ? (
        <div className="h-[350px] w-full" data-testid="profile-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={profileData} margin={{ top: 10, right: 20, bottom: 30, left: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
              <XAxis
                dataKey="station"
                label={{ value: 'Station (ft)', position: 'bottom', offset: 10, style: { fontSize: 11, fill: '#6b6b7b' } }}
                tick={{ fontSize: 10, fill: '#6b6b7b' }}
              />
              <YAxis
                label={{ value: 'Elevation (ft)', angle: -90, position: 'insideLeft', offset: -35, style: { fontSize: 11, fill: '#6b6b7b' } }}
                tick={{ fontSize: 10, fill: '#6b6b7b' }}
                domain={['dataMin - 1', 'dataMax + 1']}
              />
              <Tooltip
                contentStyle={{ fontSize: 11, border: '1px solid #d0d0d8' }}
                formatter={(value: number, name: string) => [value?.toFixed(2), name]}
                labelFormatter={(label) => {
                  const pt = profileData.find(d => d.station === label);
                  return `Station: ${label}${pt?.label ? ` (${pt.label})` : ''}`;
                }}
              />
              <Area type="stepAfter" dataKey="ground" stroke="#8b7355" fill="#d4c5a0" fillOpacity={0.3} name="Ground" strokeWidth={1.5} />
              <Area type="monotone" dataKey="crown" stroke="#555566" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Crown" />
              <Area type="monotone" dataKey="invert" stroke="#2a2a3e" fill="#e0e0e8" fillOpacity={0.4} name="Invert" strokeWidth={2} />
              {results && (
                <Area type="monotone" dataKey="hgl" stroke="#2c6eb5" fill="#2c6eb5" fillOpacity={0.15} name="HGL" strokeWidth={2} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[200px] flex items-center justify-center text-[12px] text-[#9090a0] border border-dashed border-[#d0d0d8] rounded" data-testid="profile-empty">
          Add conduits above to generate the profile plot
        </div>
      )}
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
