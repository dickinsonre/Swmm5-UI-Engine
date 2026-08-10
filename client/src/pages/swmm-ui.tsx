import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { SwmmProject, SelectedObject, SimulationResults } from '@/lib/swmm-types';
import { createEmptyProject } from '@/lib/swmm-types';
import {
  NODE_INPUT_VARS, NODE_VARS, LINK_INPUT_VARS, LINK_VARS, SUB_INPUT_VARS, SUB_VARS, SYS_VARS,
  getNodeCategories, getLinkCategories, getSubCategories, getSystemCategories,
  getNodeVarByKey, getLinkVarByKey, getSubVarByKey, getSystemVarByKey,
} from '@/lib/swmm-variables';
import { parseInpFile, projectToInp } from '@/lib/inp-parser';
import { createMockEngine, createRemoteEngine, createLocalEngine, createWasmEngine, createWasm6Engine, checkRemoteEngine, checkLocalEngine, checkWasmEngine, checkWasm6Engine } from '@/lib/swmm-engine';
import { computeCflAnalysis, discretizeProject, getDefaultSettings } from '@/lib/cfl-analysis';
import type { CflAnalysisResult, DiscretizationSettings, DiscretizationResult } from '@/lib/cfl-analysis';
import { importCsvNodes, importCsvLinks, parseDxfFile, importDxfEntities, importGeoJsonNodes, importGeoJsonLinks, parseGeoJsonToNetwork, exportNodesCsv, exportLinksCsv, exportDxf } from '@/lib/import-export';
import type { SwmmEngine } from '@/lib/swmm-engine';
import NetworkMap, { type NetworkMapHandle } from '@/components/swmm/NetworkMap';
import { LegendPanel, ObjectLocatorPanel, MapQueryPanel, evaluateQuery } from '@/components/swmm/Panels';
import type { MapQuery } from '@/components/swmm/Panels';
import ProjectExplorer from '@/components/swmm/ProjectExplorer';
import AnalysisOptionsDialog from '@/components/swmm/AnalysisOptionsDialog';
import DataEditorDialog from '@/components/swmm/DataEditors';
import AboutDialog from '@/components/swmm/AboutDialog';
import ProjectDefaultsDialog from '@/components/swmm/ProjectDefaultsDialog';
import TableViewDialog from '@/components/swmm/TableViewDialog';
import PropertyEditor from '@/components/swmm/PropertyEditor';
import { SubDialogRouter, type SubDialogState } from '@/components/swmm/SubDialogs';
import AIAssistPanel, { runDiagnostics } from '@/components/swmm/AIAssistPanel';
import { HelpTopicsDialog, HelpTutorialDialog, HelpErrorsDialog } from '@/components/swmm/HelpDialogs';
import HelpManualsDialog from '@/components/swmm/HelpManualsDialog';
import AppsLauncherDialog from '@/components/swmm/AppsLauncherDialog';
import RptHtmlView from '@/components/swmm/RptHtmlView';
import EngineDiagnosticsDialog from '@/components/swmm/EngineDiagnosticsDialog';
import ModelHealthDialog from '@/components/swmm/ModelHealthDialog';
import RoundTripAuditDialog from '@/components/swmm/RoundTripAuditDialog';
import { runRoundTripAudit, evaluateSaveGate } from '@/lib/roundtrip-audit';
import PhaseSpaceDialog, { objTypeToElementType, type PhaseSpaceTarget } from '@/components/swmm/PhaseSpaceDialog';
import Viewer3DDialog from '@/components/swmm/Viewer3DDialog';
import DiagramGalleryDialog from '@/components/swmm/DiagramGallery';
import { buildProvenance, type RunProvenance } from '@/lib/engine-diagnostics';
import { REGRESSION_METRICS, extractRunSnapshot, compareSnapshots, comparisonToCsv, getDefaultTolerances, type RunSnapshot, type ToleranceSet } from '@/lib/regression-compare';
import SpeedBar from '@/components/swmm/SpeedBar';
import SectionGridView from '@/components/swmm/SectionGridView';
import DiffToolDialog from '@/components/swmm/DiffToolDialog';
import BatchRunnerDialog from '@/components/swmm/BatchRunnerDialog';
import type { BatchEngineId } from '@/lib/batch-compare';
import ProvenanceBadge from '@/components/swmm/ProvenanceBadge';
import { SyntheticResultsBanner, SyntheticResultsLabel, SYNTHETIC_TEXT_HEADER, drawSyntheticWatermark } from '@/components/swmm/SyntheticWarning';
import { computeIntegrityInfo, IntegrityChip, IntegrityReportDialog, RecoveryDialog } from '@/components/swmm/IntegrityStatus';
import { buildModelHealthReport } from '@/lib/model-health';
import { saveSnapshot, getRecoverableSnapshot, setRecoveryBaseline, clearSnapshots, type AutosaveSnapshot } from '@/lib/autosave';
import type { InteractionMode } from '@/components/swmm/SpeedBar';
import { useToast } from '@/hooks/use-toast';
import {
  FolderOpen, Save, FilePlus, Play, Pause, Download, Upload, Settings,
  ZoomIn, ZoomOut, Maximize, Info, HelpCircle, FileText, Clipboard,
  ArrowLeftRight, Trash2, Search, BarChart3, List, Github,
  Loader2, Check, AlertTriangle, Copy, ClipboardPaste, RotateCcw, X, BookOpen, LayoutGrid,
  Scissors, ChevronLeft, Folder, File, PanelLeftOpen, PanelRightOpen, Menu,
  Droplets, CloudRain, CheckCircle2, Clock, TrendingUp, Target, Table2, Calculator, Zap, Activity, HeartPulse, Box, ShieldCheck,
  Moon, Sun, GitCompareArrows, LogOut,
  Layers,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ScatterChart, Scatter, ReferenceLine, BarChart, Bar } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export interface SwmmPreferences {
  flyoverHints: boolean;
  confirmDeletions: boolean;
  numericalPrecision: number;
  blinkingMapMarker: boolean;
  showNodeIds: boolean;
  showLinkIds: boolean;
  mapBackgroundColor: string;
  nodeSize: number;
  showMinimap: boolean;
  backdropImage: string;
  backdropOffsetX: number;
  backdropOffsetY: number;
  backdropScale: number;
  backdropOpacity: number;
}

const DEFAULT_PREFERENCES: SwmmPreferences = {
  flyoverHints: true,
  confirmDeletions: true,
  numericalPrecision: 2,
  blinkingMapMarker: true,
  showNodeIds: true,
  showLinkIds: true,
  mapBackgroundColor: '#ffffff',
  nodeSize: 1.0,
  showMinimap: true,
  backdropImage: '',
  backdropOffsetX: 0,
  backdropOffsetY: 0,
  backdropScale: 1.0,
  backdropOpacity: 0.5,
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
  try {
    const toSave = { ...prefs };
    if (toSave.backdropImage && toSave.backdropImage.length > 500000) {
      toSave.backdropImage = '';
    }
    localStorage.setItem('swmm5-preferences', JSON.stringify(toSave));
  } catch {
  }
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
  const [project, setProject] = useState<SwmmProject>(() => createEmptyProject());
  const [fileName, setFileName] = useState('Greenville_SI.inp');
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MenuTab>('Project');
  const [selectedObj, setSelectedObj] = useState<SelectedObject>(null);
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('swmm5-dark-mode') === 'true'; } catch { return false; }
  });
  const toggleDarkMode = () => {
    setDarkMode(d => {
      try { localStorage.setItem('swmm5-dark-mode', String(!d)); } catch {}
      return !d;
    });
  };
  useEffect(() => {
    document.body.classList.toggle('app-dark', darkMode);
    return () => { document.body.classList.remove('app-dark'); };
  }, [darkMode]);
  const [showSubcatch, setShowSubcatch] = useState(true);
  const [subcatchTheme, setSubcatchTheme] = useState('imperv');
  const [nodeTheme, setNodeTheme] = useState('depth');
  const [linkTheme, setLinkTheme] = useState('flow');
  const [systemTheme, setSystemTheme] = useState('sysRunoff');
  const [showSystemPanel, setShowSystemPanel] = useState(false);
  const [timeStep, setTimeStep] = useState(0);
  const [simStatus, setSimStatus] = useState<'none' | 'running' | 'current' | 'outdated'>('none');
  const [simProgress, setSimProgress] = useState(0);
  const [simProgressMsg, setSimProgressMsg] = useState('');
  const [engineMode, setEngineMode] = useState<'mock' | 'remote' | 'local' | 'wasm' | 'wasm6'>('mock');
  const [localAvailable, setLocalAvailable] = useState(false);
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [wasmAvailable, setWasmAvailable] = useState(false);
  const [wasm6Available, setWasm6Available] = useState(false);
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [isAnimating, setIsAnimating] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(150);
  const [openDialog, setOpenDialog] = useState<'file' | 'github' | 'preferences' | 'export' | 'groupEdit' | 'importData' | 'exportData' | 'profilePlot' | 'timeSeries' | 'calibration' | 'analysisOptions' | 'dataEditor' | 'projectDefaults' | 'about' | 'tableView' | 'newProject' | 'mapOptions' | 'frequencyAnalysis' | 'statisticsReport' | 'findObject' | 'helpTopics' | 'helpTutorial' | 'helpErrors' | 'helpManuals' | 'appsLauncher' | 'scatterPlot' | 'transectEditor' | 'splitScreen' | 'engineDiagnostics' | 'modelHealth' | 'roundtripAudit' | 'phaseSpace' | 'projectSummary' | 'projectDetails' | 'viewer3d' | 'diagramGallery' | 'diffTool' | 'batchRunner' | null>(null);
  const [phaseSpaceTarget, setPhaseSpaceTarget] = useState<PhaseSpaceTarget | null>(null);
  const [detailsView, setDetailsView] = useState<'grid' | 'inp'>('grid');
  const [findSearchTerm, setFindSearchTerm] = useState('');
  const [dataEditorSection, setDataEditorSection] = useState<string>('');
  const [dataEditorItem, setDataEditorItem] = useState<string>('');
  const [analysisOptionsTab, setAnalysisOptionsTab] = useState<string>('General');
  const [tableViewMode, setTableViewMode] = useState<'byObject' | 'byVariable'>('byObject');
  const [calibrationData, setCalibrationData] = useState<CalibrationDataSet[]>([]);
  const calibFileRef = useRef<HTMLInputElement>(null);
  const [activeSubDialog, setActiveSubDialog] = useState<SubDialogState>(null);
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
  const GH_REPOS = [
    { owner: 'SWMMEnablement', repo: '1729-SWMM5-Models', branch: 'main' },
    { owner: 'SWMMBobSWMM6', repo: '1729-SWMM5-Models-2030', branch: 'master' },
  ];
  const [ghBrowseOwner, setGhBrowseOwner] = useState('SWMMEnablement');
  const [ghBrowseRepo, setGhBrowseRepo] = useState('1729-SWMM5-Models');
  const [ghBrowsePath, setGhBrowsePath] = useState('');
  const [ghBrowseItems, setGhBrowseItems] = useState<{name:string;type:string;path:string;size?:number;download_url?:string}[]>([]);
  const [ghBrowseLoading, setGhBrowseLoading] = useState(false);
  const [ghBrowseError, setGhBrowseError] = useState('');
  const [preferences, setPreferences] = useState<SwmmPreferences>(loadPreferences);
  const [uiMode, setUiMode] = useState<'standard' | 'expert'>(() => {
    try {
      const stored = localStorage.getItem('swmm5-ui-mode');
      if (stored === 'expert' || stored === 'standard') return stored;
    } catch {}
    return 'standard';
  });
  const expertMode = uiMode === 'expert';
  const toggleUiMode = useCallback(() => {
    setUiMode(prev => {
      const next = prev === 'expert' ? 'standard' : 'expert';
      try { localStorage.setItem('swmm5-ui-mode', next); } catch {}
      return next;
    });
  }, []);
  const uiModeHintShown = useRef(false);
  useEffect(() => {
    if (uiModeHintShown.current) return;
    uiModeHintShown.current = true;
    try {
      if (!localStorage.getItem('swmm5-ui-mode')) {
        localStorage.setItem('swmm5-ui-mode', 'standard');
        setTimeout(() => {
          toast({
            title: 'Standard mode',
            description: 'You are in Standard mode with the core workflow. Switch to Expert in the menu bar for advanced diagnostics, calibration, and comparison tools.',
          });
        }, 1500);
      }
    } catch {}
  }, [toast]);

  const updatePreference = useCallback(<K extends keyof SwmmPreferences>(key: K, value: SwmmPreferences[K]) => {
    setPreferences(prev => {
      const next = { ...prev, [key]: value };
      savePreferences(next);
      return next;
    });
  }, []);
  const [recentFiles, setRecentFiles] = useState<{ name: string; source: string; timestamp: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem('swmm_recent_files') || '[]'); } catch { return []; }
  });
  const [showRecentMenu, setShowRecentMenu] = useState(false);
  const addRecentFile = useCallback((name: string, source: string = 'local') => {
    setRecentFiles(prev => {
      const filtered = prev.filter(f => f.name !== name);
      const next = [{ name, source, timestamp: Date.now() }, ...filtered].slice(0, 10);
      try { localStorage.setItem('swmm_recent_files', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const [loading, setLoading] = useState(false);
  const [showSamplesMenu, setShowSamplesMenu] = useState(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const suppressedExpertToolRef = useRef<InteractionMode | null>(null);
  useEffect(() => {
    const expertOnly = ['addDivider', 'addOrifice', 'addWeir', 'addOutlet', 'measure'];
    if (!expertMode && expertOnly.includes(interactionMode)) {
      suppressedExpertToolRef.current = interactionMode;
      setInteractionMode('select');
    } else if (expertMode && suppressedExpertToolRef.current) {
      setInteractionMode(suppressedExpertToolRef.current);
      suppressedExpertToolRef.current = null;
    }
  }, [expertMode, interactionMode]);
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
  const [showAIAssist, setShowAIAssist] = useState(false);
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
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [reportViewMode, setReportViewMode] = useState<'text' | 'html'>('text');
  const [splitScreenProject, setSplitScreenProject] = useState<{ project: SwmmProject; results: SimulationResults; fileName: string } | null>(null);
  const [regressionBaseline, setRegressionBaseline] = useState<RunSnapshot | null>(null);
  const [isModified, setIsModified] = useState(false);
  const [showIntegrityReport, setShowIntegrityReport] = useState(false);
  const [recoverySnapshot, setRecoverySnapshot] = useState<AutosaveSnapshot | null>(null);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [saveAuditWarning, setSaveAuditWarning] = useState<{ diffCount: number; omittedCount: number; onConfirm: () => void } | null>(null);
  const [auditWarnDontAskAgain, setAuditWarnDontAskAgain] = useState(false);
  // In-memory only: resets on page reload so users are re-warned after loading a new session
  const auditWarnSuppressedRef = useRef(false);
  const [snapshotRefresh, setSnapshotRefresh] = useState(0);
  const justLoadedRef = useRef(false);
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
      if (justLoadedRef.current) {
        justLoadedRef.current = false;
      } else {
        setIsModified(true);
      }
    }
  }, [project, pushUndo]);

  useEffect(() => {
    const snap = getRecoverableSnapshot();
    if (snap) {
      setRecoverySnapshot(snap);
      setShowRecoveryDialog(true);
    }
  }, []);

  useEffect(() => {
    if (!isModified) return;
    const timer = setTimeout(() => {
      try {
        const inp = projectToInp(project);
        const res = saveSnapshot(fileName, inp);
        if (!res.ok) {
          if (res.error && res.error !== autosaveError) {
            setAutosaveError(res.error);
            toast({ title: 'Autosave Failed', description: res.error, variant: 'destructive' });
          }
        } else {
          setAutosaveError(null);
          setSnapshotRefresh(n => n + 1);
        }
      } catch {}
    }, 3000);
    return () => clearTimeout(timer);
  }, [project, fileName, isModified]); // eslint-disable-line react-hooks/exhaustive-deps

  const healthReport = useMemo(() => {
    try { return buildModelHealthReport(project, results); } catch { return null; }
  }, [project, results]);
  const aiErrorCount = useMemo(() => {
    try { return runDiagnostics(project).filter(d => d.severity === 'error').length; } catch { return 0; }
  }, [project]);
  const integrityInfo = useMemo(
    () => computeIntegrityInfo(project, results, healthReport, isModified),
    [project, results, healthReport, isModified]
  );

  const handleRestoreSnapshot = useCallback((snap: AutosaveSnapshot) => {
    try {
      const parsed = parseInpFile(snap.inp);
      justLoadedRef.current = true;
      setProject(parsed);
      setFileName(snap.fileName);
      setResults(null);
      setReportContent(null);
      setSimStatus('none');
      setTimeStep(0);
      setSelectedObj(null);
      setMultiSelectIds(null);
      setIsModified(false);
      setShowRecoveryDialog(false);
      setShowIntegrityReport(false);
      setRecoveryBaseline(snap.timestamp);
      toast({ title: 'Snapshot Restored', description: `Recovered ${snap.fileName} autosaved at ${new Date(snap.timestamp).toLocaleTimeString()}` });
    } catch (e: any) {
      toast({ title: 'Recovery Failed', description: e.message, variant: 'destructive' });
    }
  }, [toast]);

  const handleClearSnapshots = useCallback(() => {
    clearSnapshots();
    setAutosaveError(null);
    setSnapshotRefresh(n => n + 1);
    toast({ title: 'Autosave Storage Cleared', description: 'All saved snapshots were removed from browser storage' });
  }, [toast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setFindSearchTerm('');
        setOpenDialog('findObject');
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

  useEffect(() => {
    if (initialLoadDone) return;
    setInitialLoadDone(true);

    const params = new URLSearchParams(window.location.search);
    const inpUrl = params.get('inp');
    const ghUrl = params.get('github');

    if (inpUrl || ghUrl) {
      const url = inpUrl || (ghUrl ? ghUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/') : '');
      if (url) {
        fetch(url)
          .then(r => { if (!r.ok) throw new Error('Failed to fetch'); return r.text(); })
          .then(text => {
            const parsed = parseInpFile(text);
            justLoadedRef.current = true;
            setProject(parsed);
            const name = url.split('/').pop() || 'model.inp';
            setFileName(name);
            toast({ title: 'Loaded from URL', description: `${name} loaded from shared link` });
          })
          .catch(() => {
            fetch('/samples/Greenville_SI.inp')
              .then(r => r.ok ? r.text() : '')
              .then(text => { if (text) { justLoadedRef.current = true; setProject(parseInpFile(text)); setFileName('Greenville_SI.inp'); } });
          });
        return;
      }
    }

    fetch('/samples/Greenville_SI.inp')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.text(); })
      .then(text => {
        const parsed = parseInpFile(text);
        justLoadedRef.current = true;
        setProject(parsed);
        setFileName('Greenville_SI.inp');
      })
      .catch(() => {});
  }, [initialLoadDone]);

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
      justLoadedRef.current = true;
      setProject(parsed);
      setFileName(file.name);
      setIsModified(false);
      setResults(null);
      setReportContent(null);
      setSimStatus('none');
      setTimeStep(0);
      setSelectedObj(null);
      setMultiSelectIds(null);
      addRecentFile(file.name, 'local');
      toast({ title: 'File Loaded', description: `${file.name} — ${describeProject(parsed)}` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setOpenDialog(null);
  }, [toast, addRecentFile]);

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
      justLoadedRef.current = true;
      setProject(parsed);
      setFileName(name);
      setIsModified(false);
      setResults(null);
      setSimStatus('none');
      setTimeStep(0);
      setSelectedObj(null);
      setMultiSelectIds(null);
      addRecentFile(name, 'github');
      toast({ title: 'File Loaded', description: `${name} from GitHub — ${describeProject(parsed)}` });
      setOpenDialog(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [githubUrl, toast, addRecentFile]);

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
    const dlUrl = item.download_url || `https://raw.githubusercontent.com/${ghBrowseOwner}/${ghBrowseRepo}/${GH_REPOS.find(r => r.owner === ghBrowseOwner && r.repo === ghBrowseRepo)?.branch || 'main'}/${item.path}`;
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
      toast({ title: 'File Loaded', description: `${item.name} from GitHub — ${describeProject(parsed)}` });
      setOpenDialog(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast, ghBrowseOwner, ghBrowseRepo]);

  const ghRepoMounted = useRef(false);
  useEffect(() => {
    if (!ghRepoMounted.current) { ghRepoMounted.current = true; return; }
    ghBrowse('');
  }, [ghBrowseOwner, ghBrowseRepo]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewProject = useCallback(() => {
    justLoadedRef.current = true;
    setProject(createEmptyProject());
    setFileName('Untitled.inp');
    setIsModified(false);
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
      justLoadedRef.current = true;
      setProject(parsed);
      setFileName(sampleName);
      setIsModified(false);
      setResults(null);
      setReportContent(null);
      setSimStatus('none');
      setTimeStep(0);
      setSelectedObj(null);
      setMultiSelectIds(null);
      addRecentFile(sampleName, 'sample');
      toast({ title: 'Sample Loaded', description: `${sampleName} loaded successfully` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  }, [toast, addRecentFile]);

  /** Run audit and call `proceed` immediately if clean, or show a warning dialog first. */
  const withAuditCheck = useCallback((proceed: () => void) => {
    const report = runRoundTripAudit(project);
    const gate = evaluateSaveGate(report);
    if (gate.clean || auditWarnSuppressedRef.current) {
      proceed();
      return;
    }
    setAuditWarnDontAskAgain(false);
    setSaveAuditWarning({ diffCount: gate.diffCount, omittedCount: gate.omittedCount, onConfirm: proceed });
  }, [project]);

  const handleSave = useCallback(async () => {
    const doSave = async () => {
      const { projectToInp } = await import('@/lib/inp-parser');
      const text = projectToInp(project);
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      setIsModified(false);
      saveSnapshot(fileName, text, true);
      setRecoveryBaseline();
      setSnapshotRefresh(n => n + 1);
      toast({ title: 'Saved', description: `${fileName} downloaded` });
    };
    withAuditCheck(doSave);
  }, [project, fileName, toast, withAuditCheck]);

  const handleSaveAs = useCallback(async () => {
    const input = window.prompt('Save As — enter a file name:', fileName);
    if (input === null) return;
    let newName = input.trim();
    if (!newName) return;
    if (!/\.inp$/i.test(newName)) newName += '.inp';
    const doSaveAs = async () => {
      const { projectToInp } = await import('@/lib/inp-parser');
      const text = projectToInp(project);
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = newName;
      a.click();
      URL.revokeObjectURL(url);
      setFileName(newName);
      setIsModified(false);
      saveSnapshot(newName, text, true);
      setRecoveryBaseline();
      setSnapshotRefresh(n => n + 1);
      toast({ title: 'Saved', description: `${newName} downloaded` });
    };
    withAuditCheck(doSaveAs);
  }, [project, fileName, toast, withAuditCheck]);

  const handleExit = useCallback(() => {
    const doExit = () => {
      const base = (fileName || 'model').replace(/\.inp$/i, '');
      const synthetic = results?.engineUsed === 'mock';
      const files: { name: string; data: BlobPart; type: string }[] = [];
      const text = projectToInp(project);
      files.push({ name: `${base}.inp`, data: text, type: 'text/plain' });
      const rpt = results?.reportContent ?? reportContent;
      if (rpt) files.push({ name: `${base}${synthetic ? '_SYNTHETIC' : ''}.rpt`, data: rpt, type: 'text/plain' });
      if (results?.outRaw && results.outRaw.length > 0 && !synthetic) {
        // Copy into a plain ArrayBuffer so the Blob is backed by exactly these bytes.
        files.push({ name: `${base}.out`, data: results.outRaw.slice().buffer as ArrayBuffer, type: 'application/octet-stream' });
      }
      files.forEach((f, i) => setTimeout(() => {
        const blob = new Blob([f.data], { type: f.type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }, i * 400));
      setIsModified(false);
      saveSnapshot(fileName, text, true);
      setRecoveryBaseline();
      setSnapshotRefresh(n => n + 1);
      const skipped = !rpt ? ' (no report yet — run a simulation to also get .rpt/.out)' : (!results?.outRaw || synthetic) ? ' (no binary .out available for this run)' : '';
      toast({ title: 'Project files saved', description: `Downloading ${files.map(f => f.name).join(', ')}${skipped}. They land together in your Downloads folder.` });
    };
    withAuditCheck(doExit);
  }, [project, fileName, results, reportContent, toast, withAuditCheck]);

  const getCurrentInpForDiff = useCallback(() => ({ name: fileName, text: projectToInp(project) }), [project, fileName]);

  const handleViewTable = useCallback((section: string) => {
    const optionsSections = ['OPTIONS', 'opt-general', 'opt-hydrology', 'opt-hydraulics', 'opt-routing', 'opt-quality', 'opt-dates', 'opt-timesteps', 'opt-reporting'];
    if (optionsSections.includes(section)) {
      const tabMap: Record<string, string> = { 'opt-general': 'General', 'opt-hydrology': 'General', 'opt-hydraulics': 'Dynamic Wave', 'opt-routing': 'General', 'opt-quality': 'General', 'opt-dates': 'Dates', 'opt-timesteps': 'Time Steps', 'opt-reporting': 'Interface Files', 'OPTIONS': 'General' };
      setAnalysisOptionsTab(tabMap[section] || 'General');
      setOpenDialog('analysisOptions');
      return;
    }
    const editorSections = ['TIMESERIES', 'CURVES', 'PATTERNS', 'CONTROLS', 'POLLUTANTS', 'LANDUSES', 'LID_CONTROLS', 'EVAPORATION', 'AQUIFERS', 'TRANSECTS', 'SNOWPACKS', 'GROUNDWATER', 'DWF', 'TREATMENT', 'ADJUSTMENTS', 'STREETS', 'INLETS'];
    if (editorSections.includes(section)) {
      setDataEditorSection(section);
      setDataEditorItem('');
      setOpenDialog('dataEditor');
      return;
    }
  }, []);

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
  const [runProvenance, setRunProvenance] = useState<RunProvenance | null>(null);
  const [showMockConfirm, setShowMockConfirm] = useState(false);

  const startSimulation = useCallback(async () => {
    // Revalidate SWMM6 artifact availability just before running — a stale
    // engineMode (artifacts removed after page load) should fail loudly with
    // guidance rather than a confusing engine error mid-run.
    if (engineMode === 'wasm6') {
      const stillAvailable = await checkWasm6Engine();
      if (!stillAvailable) {
        setWasm6Available(false);
        setEngineMode(wasmAvailable ? 'wasm' : localAvailable ? 'local' : remoteAvailable ? 'remote' : 'mock');
        toast({
          title: 'SWMM6 Engine Unavailable',
          description: 'OpenSWMM 6 WASM artifacts are no longer served. Engine reset — pick a mode and run again.',
          variant: 'destructive',
        });
        return;
      }
    }

    setSimStatus('running');
    setSimProgress(0);
    setSimProgressMsg('Initializing...');
    const runStartedAt = Date.now();

    const abortCtrl = new AbortController();
    simAbortRef.current = abortCtrl;

    const engine: SwmmEngine = engineMode === 'local' ? createLocalEngine() : engineMode === 'wasm' ? createWasmEngine() : engineMode === 'wasm6' ? createWasm6Engine() : engineMode === 'remote' ? createRemoteEngine() : createMockEngine();

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
      setRunProvenance(buildProvenance(res, engine.mode, runStartedAt, Date.now()));
      setResults(res);
      setReportContent(res.reportContent || null);
      if (res.reportContent) {
        setShowReportDialog(true);
      }
      setSimStatus('current');
      setTimeStep(0);
      // Label by the engine that ACTUALLY ran (local can silently fall back).
      const usedEngine = res.engineUsed || engine.mode;
      const engineLabel = usedEngine === 'local' ? 'EPA SWMM 5.2.4 (Local)' : usedEngine === 'wasm' ? 'EPA SWMM 5.2.4 (WASM)' : usedEngine === 'wasm6' ? 'OpenSWMM 6.0.0-alpha.3 (WASM)' : usedEngine === 'remote' ? 'EPA SWMM 5.2.4 (Remote)' : 'Mock Engine';
      toast({ title: 'Simulation Complete', description: `${res.timeSteps.length} time steps computed (${engineLabel})` });
    } catch (e: any) {
      if (progressInterval) clearInterval(progressInterval);
      if (e.reportContent != null && e.reportContent !== '') {
        setReportContent(e.reportContent);
        setShowReportDialog(true);
      }
      if (abortCtrl.signal.aborted) {
        setSimStatus('none');
        setSimProgressMsg('');
        toast({ title: 'Simulation Stopped', description: 'Simulation was cancelled by user' });
        return;
      }
      setSimStatus('none');
      setSimProgressMsg('');
      toast({ title: 'Simulation Error', description: e.message, variant: 'destructive' });
    } finally {
      simAbortRef.current = null;
    }
  }, [project, toast, engineMode, wasmAvailable, localAvailable, remoteAvailable]);

  const handleRunSimulation = useCallback(() => {
    if (engineMode === 'mock') {
      setShowMockConfirm(true);
      return;
    }
    const missingFiles = Object.entries(project.timeseriesFiles || {});
    if (missingFiles.length > 0) {
      const names = missingFiles.map(([name, file]) => `"${name}" (${file})`).slice(0, 3).join(', ');
      const extra = missingFiles.length > 3 ? ` and ${missingFiles.length - 3} more` : '';
      toast({
        title: `⚠ External Time-Series Files Not Loaded`,
        description: `This model references ${missingFiles.length} FILE-backed time series: ${names}${extra}. These data sources cannot be read in the browser — rainfall, inflows, or boundary conditions will be missing from the simulation. Results may appear successful but will be incorrect.`,
        variant: 'destructive',
      });
    }
    startSimulation();
  }, [engineMode, project.timeseriesFiles, startSimulation, toast]);

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

    const isMock = results?.engineUsed === 'mock';

    if (!includeLegend) {
      if (!isMock) return mapCanvas;
      const wmCanvas = document.createElement('canvas');
      wmCanvas.width = mapCanvas.width;
      wmCanvas.height = mapCanvas.height;
      const wmCtx = wmCanvas.getContext('2d');
      if (!wmCtx) return mapCanvas;
      wmCtx.drawImage(mapCanvas, 0, 0);
      drawSyntheticWatermark(wmCtx, wmCanvas.width, wmCanvas.height);
      return wmCanvas;
    }

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
    const nodeVarInfo = getNodeVarByKey(nodeTheme);
    const linkVarInfo = getLinkVarByKey(linkTheme);
    const nodeLabels: Record<string, string> = { none: 'Nodes' };
    if (nodeVarInfo) nodeLabels[nodeTheme] = nodeVarInfo.name + (nodeVarInfo.units ? ` (${nodeVarInfo.units})` : '');
    const linkLabels: Record<string, string> = { none: 'Links', cfl: 'CFL Courant #' };
    if (linkVarInfo) linkLabels[linkTheme] = linkVarInfo.name + (linkVarInfo.units ? ` (${linkVarInfo.units})` : '');
    const nodeLabel = nodeLabels[nodeTheme] || 'Nodes';
    const linkLabel = linkLabels[linkTheme] || 'Links';

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

    if (isMock) drawSyntheticWatermark(ctx, exportCanvas.width, exportCanvas.height);

    return exportCanvas;
  }, [nodeTheme, linkTheme, results]);

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
    let wasmOk = false;
    checkLocalEngine().then(available => {
      localOk = available;
      setLocalAvailable(available);
      if (available) setEngineMode('local');
    });
    checkWasmEngine().then(available => {
      wasmOk = available;
      setWasmAvailable(available);
      if (available && !localOk) setEngineMode('wasm');
    });
    checkWasm6Engine().then(available => {
      setWasm6Available(available);
    });
    checkRemoteEngine().then(available => {
      setRemoteAvailable(available);
      if (available && !localOk && !wasmOk) setEngineMode('remote');
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

  const cflValues = useMemo(() => {
    if (!cflAnalysis) return null;
    const m = new Map<string, number>();
    for (const c of cflAnalysis.conduits) m.set(c.conduitId, c.courantNumber);
    return m;
  }, [cflAnalysis]);

  const [schematicView, setSchematicView] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => networkMapRef.current?.fitExtent(), 50);
    return () => clearTimeout(t);
  }, [schematicView]);

  const schematicProject = useMemo(() => {
    if (!schematicView) return null;
    const allLinks = [...project.conduits, ...project.pumps, ...project.weirs, ...project.orifices, ...project.outlets];
    const allNodeIds = new Set([...project.junctions, ...project.outfalls, ...project.storageUnits, ...project.dividers].map(n => n.id));
    const layer = new Map<string, number>();
    project.outfalls.forEach(o => layer.set(o.id, 0));
    for (let iter = 0; iter < 300; iter++) {
      let changed = false;
      for (const l of allLinks) {
        const lt = layer.get(l.toNode);
        if (lt !== undefined && lt + 1 < 500) {
          const cur = layer.get(l.fromNode) ?? -1;
          if (lt + 1 > cur) { layer.set(l.fromNode, lt + 1); changed = true; }
        }
      }
      if (!changed) break;
    }
    let maxLayer = 0;
    layer.forEach(v => { if (v > maxLayer) maxLayer = v; });
    const layers: string[][] = [];
    allNodeIds.forEach(id => {
      const li = layer.get(id) ?? (maxLayer + 1);
      (layers[li] ||= []).push(id);
    });
    const coords: Record<string, [number, number]> = {};
    const spacingX = 80, spacingY = 100;
    layers.forEach((ids, li) => {
      if (!ids) return;
      ids.sort();
      ids.forEach((id, i) => {
        coords[id] = [(i - (ids.length - 1) / 2) * spacingX, li * spacingY];
      });
    });
    return { ...project, coordinates: coords, vertices: {}, polygons: {}, symbols: {}, labels: [] };
  }, [schematicView, project]);

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
      if (time - lastTime > animSpeed) {
        lastTime = time;
        setTimeStep(prev => (prev + 1) % results.timeSteps.length);
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isAnimating, results, animSpeed]);

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
      } else if (mode === 'addDivider') {
        id = generateId('D', allIds);
        next.dividers = [...(prev.dividers || []), { id, elevation: 0, divertedLink: '*', type: 'CUTOFF', cutoffFlow: 0, maxDepth: 0, initDepth: 0, surDepth: 0, aponded: 0 }];
      } else if (mode === 'addRaingage') {
        id = generateId('RG', allIds);
        next.raingages = [...(prev.raingages || []), { id, format: 'INTENSITY', interval: '0:05', scf: 1.0, sourceType: 'TIMESERIES', sourceName: '*', stationId: '', units: '' }];
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
      } else if (interactionMode === 'addOrifice') {
        const id = generateId('OR', allLinkIds);
        next.orifices = [...prev.orifices, { id, fromNode: fromId, toNode: toNodeId, type: 'SIDE', offset: 0, cd: 0.65, gated: 'NO', closeTime: 0 }];
        next.xsections = { ...prev.xsections, [id]: { linkId: id, shape: 'CIRCULAR', geom1: 1, geom2: 0, geom3: 0, geom4: 0, barrels: 1 } };
        if (vertices.length > 0) { next.vertices = { ...prev.vertices, [id]: vertices }; }
      } else if (interactionMode === 'addWeir') {
        const id = generateId('W', allLinkIds);
        next.weirs = [...prev.weirs, { id, fromNode: fromId, toNode: toNodeId, type: 'TRANSVERSE', crestHeight: 0, cd: 3.33, gated: 'NO', ec: 0, cd2: 0, surcharge: 'YES' }];
        next.xsections = { ...prev.xsections, [id]: { linkId: id, shape: 'RECT_OPEN', geom1: 1, geom2: 1, geom3: 0, geom4: 0, barrels: 1 } };
        if (vertices.length > 0) { next.vertices = { ...prev.vertices, [id]: vertices }; }
      } else if (interactionMode === 'addOutlet') {
        const id = generateId('OL', allLinkIds);
        next.outlets = [...prev.outlets, { id, fromNode: fromId, toNode: toNodeId, offset: 0, type: 'TABULAR/HEAD', curveOrTable: '*' }];
        if (vertices.length > 0) { next.vertices = { ...prev.vertices, [id]: vertices }; }
      }
      return next;
    });
    setLinkDrawState(null);
    const typeNames: Record<string, string> = { addConduit: 'Conduit', addPump: 'Pump', addOrifice: 'Orifice', addWeir: 'Weir', addOutlet: 'Outlet' };
    toast({ title: 'Link Created', description: `New ${typeNames[interactionMode] || 'Link'} drawn` });
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

  const contextMenuRef = useRef<HTMLDivElement>(null);
  const ctxPrevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (contextMenu && contextMenuRef.current) {
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body && !contextMenuRef.current.contains(active)) {
        ctxPrevFocusRef.current = active;
      }
      const first = contextMenuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
      first?.focus();
    } else if (!contextMenu && ctxPrevFocusRef.current) {
      const prev = ctxPrevFocusRef.current;
      ctxPrevFocusRef.current = null;
      if (document.contains(prev)) prev.focus();
    }
  }, [contextMenu]);

  const getObjectWorldPos = useCallback((obj: SelectedObject): [number, number] | null => {
    if (!obj) return null;
    const { id, objType } = obj;
    if (['junction', 'outfall', 'divider', 'storage'].includes(objType)) {
      return project.coordinates[id] || null;
    }
    if (['conduit', 'pump', 'orifice', 'weir', 'outlet'].includes(objType)) {
      const link = [...project.conduits, ...project.pumps, ...project.orifices, ...project.weirs, ...project.outlets].find(l => l.id === id);
      if (!link) return null;
      const a = project.coordinates[link.fromNode];
      const b = project.coordinates[link.toNode];
      if (a && b) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return a || b || null;
    }
    if (objType === 'subcatchment') {
      const poly = project.polygons[id];
      if (poly && poly.length > 0) {
        const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
        const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
        return [cx, cy];
      }
      return null;
    }
    if (objType === 'raingage') {
      return project.symbols[id] || null;
    }
    return null;
  }, [project]);

  const openContextMenuForSelected = useCallback(() => {
    if (!selectedObj) return false;
    const world = getObjectWorldPos(selectedObj);
    let pos: { x: number; y: number } | null = null;
    if (world) pos = networkMapRef.current?.worldToViewport(world[0], world[1]) || null;
    if (!pos) {
      const canvas = networkMapRef.current?.getCanvas();
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        pos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      } else {
        pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      }
    }
    const menuMargin = 8;
    setContextMenu({
      x: Math.min(Math.max(pos.x, menuMargin), window.innerWidth - 180),
      y: Math.min(Math.max(pos.y, menuMargin), window.innerHeight - 240),
      obj: selectedObj,
    });
    return true;
  }, [selectedObj, getObjectWorldPos]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMenuKey = e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey);
      if (!isMenuKey) return;
      if (openDialog || activeSubDialog || showReportDialog) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (t && t.closest('[role="dialog"]')) return;
      if (contextMenu) {
        e.preventDefault();
        setContextMenu(null);
        return;
      }
      if (openContextMenuForSelected()) e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openContextMenuForSelected, contextMenu, openDialog, activeSubDialog, showReportDialog]);

  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    const menu = contextMenuRef.current;
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1].focus();
    }
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

  const handleCopyId = useCallback(() => {
    const target = contextMenu?.obj || selectedObj;
    if (!target) return;
    navigator.clipboard.writeText(target.id).then(() => {
      toast({ title: 'Copied', description: `"${target.id}" copied to clipboard` });
    }).catch(() => {
      toast({ title: 'Copy ID', description: target.id });
    });
    closeContextMenu();
  }, [contextMenu, selectedObj, toast, closeContextMenu]);

  const handleFindConnected = useCallback(() => {
    const target = contextMenu?.obj || selectedObj;
    if (!target) return;
    const id = target.id;
    const t = target.objType;
    const connected: string[] = [];
    if (['junction', 'outfall', 'storage', 'divider'].includes(t)) {
      for (const c of project.conduits) {
        if (c.fromNode === id || c.toNode === id) connected.push(`Conduit: ${c.id}`);
      }
      for (const p of project.pumps) {
        if (p.fromNode === id || p.toNode === id) connected.push(`Pump: ${p.id}`);
      }
      for (const o of (project.orifices || [])) {
        if (o.fromNode === id || o.toNode === id) connected.push(`Orifice: ${o.id}`);
      }
      for (const w of (project.weirs || [])) {
        if (w.fromNode === id || w.toNode === id) connected.push(`Weir: ${w.id}`);
      }
      for (const o of (project.outlets || [])) {
        if (o.fromNode === id || o.toNode === id) connected.push(`Outlet: ${o.id}`);
      }
      for (const sc of project.subcatchments) {
        if (sc.outlet === id) connected.push(`Subcatchment: ${sc.id}`);
      }
    } else if (['conduit', 'pump', 'orifice', 'weir', 'outlet'].includes(t)) {
      const link = [...project.conduits, ...project.pumps, ...(project.orifices || []), ...(project.weirs || []), ...(project.outlets || [])].find(l => l.id === id);
      if (link) {
        connected.push(`From: ${(link as any).fromNode || (link as any).from}`);
        connected.push(`To: ${(link as any).toNode || (link as any).to}`);
      }
    }
    toast({ title: `Connected to ${id}`, description: connected.length > 0 ? connected.join(', ') : 'None found' });
    closeContextMenu();
  }, [contextMenu, selectedObj, project, toast, closeContextMenu]);

  const handleOpenProperties = useCallback(() => {
    const target = contextMenu?.obj || selectedObj;
    if (target) {
      setSelectedObj(target);
    }
    closeContextMenu();
  }, [contextMenu, selectedObj, closeContextMenu]);

  const handleFindObject = useCallback((id: string, objType: string) => {
    const coord = project.coordinates[id];
    if (coord && networkMapRef.current) {
      networkMapRef.current.centerOnWorld(coord[0], coord[1]);
      setSelectedObj({ id, objType: objType as any });
    } else if (project.symbols && project.symbols[id] && networkMapRef.current) {
      const sym = project.symbols[id];
      networkMapRef.current.centerOnWorld(sym[0], sym[1]);
      setSelectedObj({ id, objType: objType as any });
    } else if (project.polygons && project.polygons[id]) {
      const poly = project.polygons[id];
      if (poly.length > 0) {
        const cx = poly.reduce((s, v) => s + v[0], 0) / poly.length;
        const cy = poly.reduce((s, v) => s + v[1], 0) / poly.length;
        if (networkMapRef.current) networkMapRef.current.centerOnWorld(cx, cy);
        setSelectedObj({ id, objType: objType as any });
      }
    } else {
      toast({ title: 'Not Found', description: `Could not locate ${id} on the map` });
    }
    setOpenDialog(null);
  }, [project, toast]);

  const findResults = useMemo(() => {
    if (!findSearchTerm.trim()) return [];
    const term = findSearchTerm.toLowerCase();
    const matches: { id: string; objType: string; category: string }[] = [];
    for (const j of project.junctions) { if (j.id.toLowerCase().includes(term)) matches.push({ id: j.id, objType: 'junction', category: 'Junction' }); }
    for (const o of project.outfalls) { if (o.id.toLowerCase().includes(term)) matches.push({ id: o.id, objType: 'outfall', category: 'Outfall' }); }
    for (const s of project.storageUnits) { if (s.id.toLowerCase().includes(term)) matches.push({ id: s.id, objType: 'storage', category: 'Storage' }); }
    for (const d of project.dividers) { if (d.id.toLowerCase().includes(term)) matches.push({ id: d.id, objType: 'divider', category: 'Divider' }); }
    for (const c of project.conduits) { if (c.id.toLowerCase().includes(term)) matches.push({ id: c.id, objType: 'conduit', category: 'Conduit' }); }
    for (const p of project.pumps) { if (p.id.toLowerCase().includes(term)) matches.push({ id: p.id, objType: 'pump', category: 'Pump' }); }
    for (const o of (project.orifices || [])) { if (o.id.toLowerCase().includes(term)) matches.push({ id: o.id, objType: 'orifice', category: 'Orifice' }); }
    for (const w of (project.weirs || [])) { if (w.id.toLowerCase().includes(term)) matches.push({ id: w.id, objType: 'weir', category: 'Weir' }); }
    for (const o of (project.outlets || [])) { if (o.id.toLowerCase().includes(term)) matches.push({ id: o.id, objType: 'outlet', category: 'Outlet' }); }
    for (const sc of project.subcatchments) { if (sc.id.toLowerCase().includes(term)) matches.push({ id: sc.id, objType: 'subcatchment', category: 'Subcatchment' }); }
    for (const rg of (project.raingages || [])) { if (rg.id.toLowerCase().includes(term)) matches.push({ id: rg.id, objType: 'raingage', category: 'Rain Gage' }); }
    return matches.slice(0, 50);
  }, [findSearchTerm, project]);

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

  const handleHealthSelect = useCallback((objType: string, id: string) => {
    setSelectedObj({ id, objType: objType as any });
    setMultiSelectIds(null);
    const map = networkMapRef.current;
    if (!map) return;
    const coord = project.coordinates[id] || project.symbols?.[id];
    if (coord) {
      map.centerOnWorld(coord[0], coord[1]);
      return;
    }
    if (['conduit', 'pump', 'orifice', 'weir', 'outlet'].includes(objType)) {
      const link = [...project.conduits, ...project.pumps, ...project.orifices, ...project.weirs, ...project.outlets].find(l => l.id === id);
      if (link) {
        const c1 = project.coordinates[link.fromNode];
        const c2 = project.coordinates[link.toNode];
        if (c1 && c2) { map.centerOnWorld((c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2); return; }
        if (c1) { map.centerOnWorld(c1[0], c1[1]); return; }
        if (c2) { map.centerOnWorld(c2[0], c2[1]); return; }
      }
    }
    const poly = project.polygons?.[id];
    if (poly && poly.length > 0) {
      const cx = poly.reduce((s, v) => s + v[0], 0) / poly.length;
      const cy = poly.reduce((s, v) => s + v[1], 0) / poly.length;
      map.centerOnWorld(cx, cy);
    }
  }, [project]);

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

    if (interactionMode === 'addSubcatchment') {
      setProject(prev => {
        const next = { ...prev };
        const allIds = prev.subcatchments.map(s => s.id);
        const id = generateId('S', allIds);
        const outlet = prev.junctions.length > 0 ? prev.junctions[0].id : (prev.outfalls.length > 0 ? prev.outfalls[0].id : '*');
        next.subcatchments = [...prev.subcatchments, { id, rainGage: '*', outlet, area: 0, pctImperv: 25, width: 100, slope: 0.5, curbLen: 0, snowPack: '' }];
        next.subareas = { ...prev.subareas, [id]: { nImperv: 0.01, nPerv: 0.1, sImperv: 0.05, sPerv: 0.05, pctZero: 25, routeTo: 'OUTLET', pctRouted: 100 } };
        next.polygons = { ...(prev.polygons || {}), [id]: groupSelectPoints.map(p => [p[0], p[1]] as [number, number]) };
        next.infiltration = { ...(prev.infiltration || {}), [id]: Object.values(prev.infiltration)[0] || { maxRate: 3, minRate: 0.5, decay: 4, dryTime: 7, maxInfil: 0 } };
        return next;
      });
      setGroupSelectPoints([]);
      toast({ title: 'Subcatchment Created', description: 'New subcatchment polygon drawn on map' });
      return;
    }

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
  }, [groupSelectPoints, project, toast, interactionMode, generateId]);

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
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextMenu) setContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
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
        <IntegrityChip info={integrityInfo} onClick={() => setShowIntegrityReport(true)} />
        <div className="flex-1" />
        <span className="text-[10px] text-white/50 mobile-hidden">Stormwater Management Model</span>
        {isMobile && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setMobilePanel(p => p === 'left' ? 'none' : 'left')}
              className="p-1.5 rounded-md transition-colors"
              style={{ backgroundColor: mobilePanel === 'left' ? 'rgba(255,255,255,0.2)' : 'transparent' }}
              data-testid="btn-mobile-left-panel"
            >
              <PanelLeftOpen className="w-4 h-4 text-white/80" />
            </button>
            <button
              onClick={() => setMobilePanel(p => p === 'right' ? 'none' : 'right')}
              className="p-1.5 rounded-md transition-colors"
              style={{ backgroundColor: mobilePanel === 'right' ? 'rgba(255,255,255,0.2)' : 'transparent' }}
              data-testid="btn-mobile-right-panel"
            >
              <PanelRightOpen className="w-4 h-4 text-white/80" />
            </button>
          </div>
        )}
      </div>

      <div className="h-8 flex items-stretch shrink-0" style={{ backgroundColor: '#3a5070', borderBottom: '1px solid #d0d0d8' }}>
        {menus.map(m => (
          <button
            key={m}
            onClick={() => setActiveMenu(m)}
            className="px-2 sm:px-4 flex items-center text-[11px] sm:text-xs transition-all duration-150"
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
        <button
          onClick={toggleUiMode}
          className="flex items-center gap-1.5 px-2 sm:px-2.5 my-1 mr-1 rounded text-[10px] font-medium transition-colors border"
          style={{
            backgroundColor: expertMode ? 'rgba(232,138,26,0.18)' : 'rgba(255,255,255,0.08)',
            borderColor: expertMode ? '#e88a1a' : 'rgba(255,255,255,0.25)',
            color: expertMode ? '#ffd9a8' : 'rgba(255,255,255,0.85)',
          }}
          title={expertMode ? 'Expert mode: full interface. Click for Standard mode.' : 'Standard mode: core workflow. Click for Expert mode with advanced tools.'}
          data-testid="btn-ui-mode"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${expertMode ? 'bg-[#e88a1a]' : 'bg-[#8ab4e8]'}`} />
          {expertMode ? 'Expert' : 'Standard'}
        </button>
        <div className="flex items-center gap-1 pr-2 sm:pr-3">
          <ToolbarIconButton
            icon={darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            testId="btn-dark-mode"
          />
          <ToolbarIconButton icon={<Save className="w-3.5 h-3.5" />} onClick={handleSave} title="Save" testId="btn-save" />
          <ToolbarIconButton icon={<FolderOpen className="w-3.5 h-3.5" />} onClick={() => fileInputRef.current?.click()} title="Open" testId="btn-open" />
          <span className="hidden sm:inline"><ToolbarIconButton icon={<Search className="w-3.5 h-3.5" />} title="Find" testId="btn-find" /></span>
        </div>
      </div>

      <div className="h-[40px] sm:h-[52px] flex items-center px-1 md:px-2 gap-0.5 shrink-0 overflow-x-auto" style={{ backgroundColor: '#f0f0f4', borderBottom: '1px solid #d0d0d8' }}>
        {activeMenu === 'File' && (
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<FilePlus className="w-4 h-4" />} label="New" onClick={handleNewProject} testId="btn-new" />
            <ToolbarButton icon={<FolderOpen className="w-4 h-4" />} label="Open" onClick={() => fileInputRef.current?.click()} testId="btn-open-file" />
            <ToolbarButton icon={<Github className="w-4 h-4" />} label="GitHub" onClick={() => { setOpenDialog('github'); if (ghBrowseItems.length === 0) ghBrowse(''); }} testId="btn-github" />
            <ToolbarButton icon={<Save className="w-4 h-4" />} label="Save" onClick={handleSave} testId="btn-save-file" />
            <ToolbarButton icon={<Save className="w-4 h-4" />} label="Save As" onClick={handleSaveAs} testId="btn-save-as" />
            <ToolbarButton icon={<GitCompareArrows className="w-4 h-4" />} label="Diff" onClick={() => setOpenDialog('diffTool')} testId="btn-diff" />
            <ToolbarButton icon={<LogOut className="w-4 h-4" />} label="Exit" onClick={handleExit} testId="btn-exit" />
            <ToolbarButton icon={<Download className="w-4 h-4" />} label="Export" onClick={() => setOpenDialog('exportData')} testId="btn-export" />
            <ToolbarButton icon={<Upload className="w-4 h-4" />} label="Import" onClick={() => { setImportPreviewText(''); setImportFileName(''); setDxfLayers([]); setDxfSelectedLayers(new Set()); setDxfEntities([]); setGeojsonFeatures([]); setGeojsonFields([]); setGeojsonIdField(''); setGeojsonElevField(''); setOpenDialog('importData'); }} testId="btn-import" />
            <ToolbarButton icon={<Settings className="w-4 h-4" />} label="Prefs" onClick={() => setOpenDialog('preferences')} testId="btn-prefs" />
            <ToolbarButton icon={<Folder className="w-4 h-4" />} label="Defaults" onClick={() => setOpenDialog('projectDefaults')} testId="btn-defaults" />
            <div className="w-px h-8 mx-1" style={{ backgroundColor: '#d0d0d8' }} />
            <ToolbarButton icon={<BookOpen className="w-4 h-4" />} label="Samples" onClick={() => setShowSamplesMenu(v => !v)} testId="btn-samples" />
            <div className="relative">
              <ToolbarButton icon={<Clock className="w-4 h-4" />} label="Recent" onClick={() => setShowRecentMenu(v => !v)} testId="btn-recent" />
              {showRecentMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-[#d0d0d8] rounded-lg shadow-lg z-50 min-w-[200px] py-1" data-testid="recent-menu">
                  {recentFiles.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-[#9090a0]">No recent files</div>
                  ) : (
                    recentFiles.map((f, i) => (
                      <button key={i} className="w-full text-left px-3 py-1.5 text-[11px] text-[#2a2a3e] hover:bg-[#f0f0f4] flex items-center gap-2 transition-colors" data-testid={`recent-file-${i}`}
                        onClick={() => { setShowRecentMenu(false); if (f.source === 'sample') handleLoadSample(f.name); else toast({ title: 'Recent File', description: `${f.name} — re-open via File > Open or GitHub` }); }}>
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-[9px] text-[#9090a0] shrink-0">{f.source}</span>
                      </button>
                    ))
                  )}
                </div>
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
          <div className="flex items-center gap-2 sm:gap-4 px-1 sm:px-2 w-full overflow-x-auto">
            <ThemeCombo label="Sub" value={subcatchTheme} onChange={setSubcatchTheme}
              options={SUB_INPUT_VARS.map(v => [v.key, v.name] as [string, string])}
              groups={getSubCategories().filter(g => expertMode || g.label === 'Standard (EPA)').map(g => ({ label: g.label, items: g.vars.map(v => [v.key, v.name] as [string, string]) }))}
              testId="combo-subcatch" />
            <ThemeCombo label="Nodes" value={nodeTheme} onChange={setNodeTheme}
              options={NODE_INPUT_VARS.map(v => [v.key, v.name] as [string, string])}
              groups={getNodeCategories().filter(g => expertMode || g.label === 'Standard (EPA)').map(g => ({ label: g.label, items: g.vars.map(v => [v.key, v.name] as [string, string]) }))}
              testId="combo-nodes" />
            <ThemeCombo label="Links" value={linkTheme} onChange={setLinkTheme}
              options={[['cfl', 'CFL (Courant #)'] as [string, string], ...LINK_INPUT_VARS.map(v => [v.key, v.name] as [string, string])]}
              groups={getLinkCategories().filter(g => expertMode || g.label === 'Standard (EPA)').map(g => ({ label: g.label, items: g.vars.map(v => [v.key, v.name] as [string, string]) }))}
              testId="combo-links" />
            <button
              onClick={() => setSchematicView(v => !v)}
              className={`shrink-0 text-[10px] px-2 py-1 rounded border transition-colors ${schematicView ? 'bg-[#2c6eb5] text-white border-[#2c6eb5]' : 'bg-white text-[#2a2a3e] border-[#d0d0d8] hover:bg-[#e8f0fb]'}`}
              title="Toggle between GIS coordinates and auto-layout schematic view"
              data-testid="btn-schematic-toggle"
            >
              {schematicView ? 'Schematic' : 'GIS'}
            </button>
            {expertMode && <ThemeCombo label="System" value={systemTheme} onChange={(v) => { setSystemTheme(v); setShowSystemPanel(true); }}
              options={[]}
              groups={getSystemCategories().map(g => ({ label: g.label, items: g.vars.map(v => [v.key, v.name] as [string, string]) }))}
              testId="combo-system" />}
            <div className="flex-1 min-w-0" />
            {results && (
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <input
                  type="range"
                  min={0}
                  max={maxTimeStep}
                  value={timeStep}
                  onChange={e => setTimeStep(+e.target.value)}
                  className="w-16 sm:w-28"
                  style={{ accentColor: '#2c6eb5' }}
                  data-testid="time-slider"
                />
                <span className="text-[9px] sm:text-[10px] font-mono text-[#2c6eb5] min-w-[50px] sm:min-w-[70px]" data-testid="time-display">
                  {currentTime.split(' ')[1] || `Step ${timeStep}`}
                </span>
                <button
                  onClick={() => setIsAnimating(!isAnimating)}
                  className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-1 text-[9px] sm:text-[10px] rounded border shrink-0"
                  style={{ borderColor: '#d0d0d8', color: isAnimating ? '#d04040' : '#2c6eb5' }}
                  data-testid="btn-animate"
                >
                  {isAnimating ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span className="hidden sm:inline">{isAnimating ? 'Stop' : 'Animate'}</span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[8px] text-[#6b6b7b]">Speed</span>
                  <input
                    type="range"
                    min={20}
                    max={500}
                    step={10}
                    value={520 - animSpeed}
                    onChange={e => setAnimSpeed(520 - +e.target.value)}
                    className="w-12"
                    style={{ accentColor: '#2c6eb5' }}
                    data-testid="anim-speed-slider"
                  />
                </div>
              </div>
            )}
          </div>
        )}
        {activeMenu === 'Map' && (
          <div className="flex items-center gap-0.5 flex-wrap">
            <ToolbarButton icon={<ZoomIn className="w-4 h-4" />} label="Zoom In" testId="btn-zoom-in" />
            <ToolbarButton icon={<ZoomOut className="w-4 h-4" />} label="Zoom Out" testId="btn-zoom-out" />
            <ToolbarButton icon={<Maximize className="w-4 h-4" />} label="Extent" onClick={() => networkMapRef.current?.fitExtent()} testId="btn-extent" />
            <ToolbarButton icon={<Settings className="w-4 h-4" />} label="Options" onClick={() => setOpenDialog('mapOptions')} testId="btn-map-options" />
            <ToolbarButton icon={<Search className="w-4 h-4" />} label="Query" onClick={() => setShowQueryPanel(!showQueryPanel)} testId="btn-query" />
            <ToolbarButton icon={<Download className="w-4 h-4" />} label="Export" onClick={() => setOpenDialog('export')} testId="btn-map-export" />
            <div className="w-px h-8 bg-[#d0d0d8] mx-1" />
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-[#6b6b7b]">Size</span>
              <input type="range" min={0.3} max={3} step={0.1} value={preferences.nodeSize}
                onChange={e => updatePreference('nodeSize', +e.target.value)}
                className="w-14" style={{ accentColor: '#2c6eb5' }} data-testid="slider-node-size" />
            </div>
            <label className="flex items-center gap-1 text-[9px] text-[#6b6b7b] cursor-pointer ml-1" data-testid="toggle-minimap">
              <input type="checkbox" checked={preferences.showMinimap} onChange={e => updatePreference('showMinimap', e.target.checked)}
                className="w-3 h-3 rounded" style={{ accentColor: '#2c6eb5' }} />
              Mini
            </label>
          </div>
        )}
        {activeMenu === 'Project' && (
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<Settings className="w-4 h-4" />} label="Options" onClick={() => setOpenDialog('analysisOptions')} testId="btn-analysis-options" />
            <ToolbarButton icon={<Search className="w-4 h-4" />} label="Locate" onClick={() => setShowLocator(!showLocator)} testId="btn-locate" />
            <ToolbarButton icon={<HeartPulse className="w-4 h-4" />} label="Health" onClick={() => setOpenDialog('modelHealth')} testId="btn-model-health" />
            <ToolbarButton icon={<ShieldCheck className="w-4 h-4" />} label="Audit" onClick={() => setOpenDialog('roundtripAudit')} testId="btn-roundtrip-audit" />
            {expertMode && <ToolbarButton icon={<Activity className="w-4 h-4" />} label="Phase" onClick={() => {
              const et = selectedObj ? objTypeToElementType(selectedObj.objType) : null;
              setPhaseSpaceTarget(selectedObj && et ? { id: selectedObj.id, elementType: et } : null);
              setOpenDialog('phaseSpace');
            }} testId="btn-phase-space" />}
            <ToolbarButton icon={<Box className="w-4 h-4" />} label="3D" onClick={() => setOpenDialog('viewer3d')} testId="btn-3d-viewer" />
            <ToolbarButton icon={<LayoutGrid className="w-4 h-4" />} label="Diagrams" onClick={() => setOpenDialog('diagramGallery')} testId="btn-diagram-gallery" />
            <ToolbarButton icon={<List className="w-4 h-4" />} label="Summary" onClick={() => setOpenDialog('projectSummary')} testId="btn-summary" />
            <ToolbarButton icon={<FileText className="w-4 h-4" />} label="Details" onClick={() => setOpenDialog('projectDetails')} testId="btn-details" />
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
            <ToolbarButton icon={<Calculator className="w-4 h-4" />} label="Stats" onClick={() => { if (results) setOpenDialog('statisticsReport'); else toast({ title: 'No Results', description: 'Run a simulation first to view statistics' }); }} testId="btn-statistics" />
            <ToolbarButton icon={<ArrowLeftRight className="w-4 h-4" />} label="Profile" onClick={() => setOpenDialog('profilePlot')} testId="btn-profile-plot" />
            <ToolbarButton icon={<TrendingUp className="w-4 h-4" />} label="Graph" onClick={() => { if (results) setOpenDialog('timeSeries'); else toast({ title: 'No Results', description: 'Run a simulation first to view time series graphs' }); }} testId="btn-graph" />
            {expertMode && <ToolbarButton icon={<Target className="w-4 h-4" />} label="Calibrate" onClick={() => setOpenDialog('calibration')} testId="btn-calibration" />}
            <ToolbarButton icon={<Table2 className="w-4 h-4" />} label="Table" onClick={() => setOpenDialog('tableView')} testId="btn-table-view" />
            {expertMode && <ToolbarButton icon={<Activity className="w-4 h-4" />} label="Scatter" onClick={() => { if (results) setOpenDialog('scatterPlot'); else toast({ title: 'No Results', description: 'Run a simulation first' }); }} testId="btn-scatter-plot" />}
            {expertMode && <ToolbarButton icon={<Droplets className="w-4 h-4" />} label="Transect" onClick={() => setOpenDialog('transectEditor')} testId="btn-transect-editor" />}
            {expertMode && <ToolbarButton icon={<PanelLeftOpen className="w-4 h-4" />} label="Compare" onClick={() => setOpenDialog('splitScreen')} testId="btn-split-screen" />}
            <ToolbarButton icon={<Layers className="w-4 h-4" />} label="Batch" onClick={() => setOpenDialog('batchRunner')} testId="btn-batch-runner" />
            <ToolbarButton icon={<Search className="w-4 h-4" />} label="Find" onClick={() => { setFindSearchTerm(''); setOpenDialog('findObject'); }} testId="btn-find" />
            <ToolbarButton icon={<Info className="w-4 h-4" />} label="About" onClick={() => setOpenDialog('about')} testId="btn-about" />
            <div className="w-px h-8 bg-[#d0d0d8] mx-1" />
            {expertMode && <ToolbarButton
              icon={<Scissors className="w-4 h-4" />}
              label="CFL"
              onClick={() => setShowCflPanel(!showCflPanel)}
              testId="btn-cfl"
            />}
            {expertMode && cflAnalysis && cflAnalysis.flaggedCount > 0 && (
              <span className="text-[9px] text-[#d04040] font-medium -ml-1 mt-0.5" data-testid="cfl-badge">
                {cflAnalysis.flaggedCount}
              </span>
            )}
            <ToolbarButton
              icon={<Zap className="w-4 h-4" />}
              label="AI Assist"
              onClick={() => setShowAIAssist(!showAIAssist)}
              testId="btn-ai-assist"
              badge={aiErrorCount}
            />
            <div className="w-px h-8 bg-[#d0d0d8] mx-1" />
            <button
              onClick={() => {
                const modes: Array<'local' | 'wasm' | 'wasm6' | 'remote' | 'mock'> = [];
                if (localAvailable) modes.push('local');
                if (wasmAvailable) modes.push('wasm');
                if (wasm6Available) modes.push('wasm6');
                if (remoteAvailable) modes.push('remote');
                modes.push('mock');
                const idx = modes.indexOf(engineMode);
                setEngineMode(modes[(idx + 1) % modes.length]);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium transition-colors border ${
                engineMode === 'local' || engineMode === 'remote' || engineMode === 'wasm' || engineMode === 'wasm6'
                  ? 'bg-[rgba(44,110,181,0.12)] border-[#2c6eb5] text-[#2c6eb5]'
                  : 'bg-transparent border-[#d0d0d8] text-[#6b6b7b] hover:text-[#2a2a3e]'
              } cursor-pointer`}
              title="Cycle engine mode: Local → WASM 5 → WASM 6 → Remote → Mock"
              data-testid="btn-engine-toggle"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${engineMode === 'local' ? 'bg-[#2a8a4a]' : engineMode === 'wasm' ? 'bg-[#e88a1a]' : engineMode === 'wasm6' ? 'bg-[#8a4ae2]' : engineMode === 'remote' ? 'bg-[#2c6eb5]' : 'bg-[#9090a0]'}`} />
              {engineMode === 'local' ? 'Local 5.2.4' : engineMode === 'wasm' ? 'WASM 5.2.4' : engineMode === 'wasm6' ? 'WASM 6.0-a3' : engineMode === 'remote' ? 'Remote 5.2.4' : 'Mock Engine'}
            </button>
          </div>
        )}
        {activeMenu === 'Help' && (
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<BookOpen className="w-4 h-4" />} label="Manuals" onClick={() => setOpenDialog('helpManuals')} testId="btn-manuals" />
            <ToolbarButton icon={<LayoutGrid className="w-4 h-4" />} label="Apps" onClick={() => setOpenDialog('appsLauncher')} testId="btn-apps" />
            <ToolbarButton icon={<HelpCircle className="w-4 h-4" />} label="Topics" onClick={() => setOpenDialog('helpTopics')} testId="btn-topics" />
            <ToolbarButton icon={<FileText className="w-4 h-4" />} label="Tutorial" onClick={() => setOpenDialog('helpTutorial')} testId="btn-tutorial" />
            <ToolbarButton icon={<AlertTriangle className="w-4 h-4" />} label="Errors" onClick={() => setOpenDialog('helpErrors')} testId="btn-errors" />
            {expertMode && <ToolbarButton icon={<Activity className="w-4 h-4" />} label="Engines" onClick={() => setOpenDialog('engineDiagnostics')} testId="btn-engine-diagnostics" />}
            <ToolbarButton icon={<Info className="w-4 h-4" />} label="About" onClick={() => setOpenDialog('about')} testId="btn-about-help" />
          </div>
        )}
      </div>

      {showSamplesMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowSamplesMenu(false)} />
          <div className="fixed left-3 right-3 sm:left-auto sm:right-auto sm:w-[300px] top-[90px] sm:top-[100px] z-50 max-h-[70vh] overflow-y-auto rounded-xl shadow-2xl border" style={{ backgroundColor: '#ffffff', borderColor: '#d0d0d8' }}>
            <div className="px-3 py-2 border-b font-medium text-xs text-[#2a2a3e]" style={{ borderColor: '#d0d0d8', backgroundColor: '#f8f8fa' }}>Sample Projects</div>
            <button
              className="w-full text-left px-3 py-2.5 text-xs hover:bg-[#f0f0f4] text-[#2a2a3e] active:bg-[#e8edf2] transition-colors"
              onClick={() => { setShowSamplesMenu(false); handleLoadSample('Greenville_US.inp'); }}
              data-testid="btn-sample-greenville-us"
            >
              Greenville (US Customary Units)
              <span className="block text-[10px] text-[#6b6b7b] mt-0.5">All SWMM5 features - CFS, Green-Ampt, DynWave</span>
            </button>
            <button
              className="w-full text-left px-3 py-2.5 text-xs hover:bg-[#f0f0f4] text-[#2a2a3e] active:bg-[#e8edf2] transition-colors"
              onClick={() => { setShowSamplesMenu(false); handleLoadSample('Greenville_SI.inp'); }}
              data-testid="btn-sample-greenville-si"
            >
              Greenville (SI / Metric Units)
              <span className="block text-[10px] text-[#6b6b7b] mt-0.5">All SWMM5 features - CMS, Green-Ampt, DynWave</span>
            </button>
            <div className="border-t" style={{ borderColor: '#e8e8ee' }} />
            <button
              className="w-full text-left px-3 py-2.5 text-xs hover:bg-[#f0f0f4] text-[#2a2a3e] active:bg-[#e8edf2] transition-colors"
              onClick={() => { setShowSamplesMenu(false); handleLoadSample('User1.inp'); }}
              data-testid="btn-sample-user1"
            >
              User1 — Mountain Drainage
              <span className="block text-[10px] text-[#6b6b7b] mt-0.5">58 subcatchments, CMS, Horton, DynWave</span>
            </button>
            <button
              className="w-full text-left px-3 py-2.5 text-xs hover:bg-[#f0f0f4] text-[#2a2a3e] active:bg-[#e8edf2] transition-colors"
              onClick={() => { setShowSamplesMenu(false); handleLoadSample('User2.inp'); }}
              data-testid="btn-sample-user2"
            >
              User2 — Urban Collection
              <span className="block text-[10px] text-[#6b6b7b] mt-0.5">17 subcatchments, CFS, storage nodes, DynWave</span>
            </button>
            <button
              className="w-full text-left px-3 py-2.5 text-xs hover:bg-[#f0f0f4] text-[#2a2a3e] active:bg-[#e8edf2] transition-colors"
              onClick={() => { setShowSamplesMenu(false); handleLoadSample('User3.inp'); }}
              data-testid="btn-sample-user3"
            >
              User3 — Large Metro Network
              <span className="block text-[10px] text-[#6b6b7b] mt-0.5">100+ subcatchments, CMS, dual drainage, DynWave</span>
            </button>
            <button
              className="w-full text-left px-3 py-2.5 text-xs hover:bg-[#f0f0f4] text-[#2a2a3e] active:bg-[#e8edf2] transition-colors"
              onClick={() => { setShowSamplesMenu(false); handleLoadSample('User4.inp'); }}
              data-testid="btn-sample-user4"
            >
              User4 — Regional Stormwater
              <span className="block text-[10px] text-[#6b6b7b] mt-0.5">98 subcatchments, CFS, large network, DynWave</span>
            </button>
            <button
              className="w-full text-left px-3 py-2.5 text-xs hover:bg-[#f0f0f4] text-[#2a2a3e] active:bg-[#e8edf2] transition-colors"
              onClick={() => { setShowSamplesMenu(false); handleLoadSample('User5.inp'); }}
              data-testid="btn-sample-user5"
            >
              User5 — Complex Watershed
              <span className="block text-[10px] text-[#6b6b7b] mt-0.5">96 subcatchments, CFS, Froude-limited, DynWave</span>
            </button>
          </div>
        </>
      )}

      {showRecentMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowRecentMenu(false)} />
      )}

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
                    {engineMode === 'local' ? 'EPA SWMM 5.2.4 (Local)' : engineMode === 'wasm' ? 'EPA SWMM 5.2.4 (WASM In-Browser)' : engineMode === 'wasm6' ? 'OpenSWMM 6.0.0-alpha.3 (WASM In-Browser)' : engineMode === 'remote' ? 'EPA SWMM 5.2.4 (Remote)' : 'Mock Engine'}
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

      {results?.engineUsed === 'mock' && <SyntheticResultsBanner />}

      <div className="flex-1 flex overflow-hidden relative">
        {isMobile && mobilePanel !== 'none' && (
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setMobilePanel('none')} data-testid="mobile-panel-backdrop" />
        )}
        <div
          className={`${isMobile ? (mobilePanel === 'left' ? 'fixed left-0 top-0 bottom-0 z-50 w-[280px] shadow-2xl animate-in slide-in-from-left duration-200' : 'hidden') : 'w-[170px]'} shrink-0 overflow-hidden flex flex-col`}
          style={{ backgroundColor: '#f8f8fa', borderRight: '1px solid #d0d0d8' }}
        >
          {isMobile && mobilePanel === 'left' && (
            <div className="h-10 flex items-center justify-between px-3 border-b shrink-0" style={{ backgroundColor: '#2c3e6b', borderColor: '#d0d0d8' }}>
              <span className="text-sm font-medium text-white">Layers & Tools</span>
              <button onClick={() => setMobilePanel('none')} className="p-1.5 rounded-full hover:bg-white/10" data-testid="btn-close-left-panel"><X className="w-4 h-4 text-white/80" /></button>
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
            project={schematicProject || project}
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
            cflValues={cflValues}
            discretizedJunctionIds={discretizationResult?.newJunctionIds || null}
            onCreateNode={schematicView ? undefined : handleCreateNode}
            onStartLink={schematicView ? undefined : handleStartLink}
            onCompleteLink={schematicView ? undefined : handleCompleteLink}
            onAddLinkVertex={schematicView ? undefined : handleAddLinkVertex}
            onMoveNode={schematicView ? undefined : handleMoveNode}
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
              suppressedExpertToolRef.current = null;
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
            expertMode={expertMode}
          />

          {interactionMode !== 'select' && (
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-[11px] z-10 max-w-[90%] text-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #2c6eb5', color: '#2c6eb5' }}
              data-testid="mode-indicator"
            >
              {interactionMode === 'addJunction' && (isMobile ? 'Tap to place Junction' : 'Click to place Junction (Esc to cancel)')}
              {interactionMode === 'addOutfall' && (isMobile ? 'Tap to place Outfall' : 'Click to place Outfall (Esc to cancel)')}
              {interactionMode === 'addStorage' && (isMobile ? 'Tap to place Storage' : 'Click to place Storage (Esc to cancel)')}
              {interactionMode === 'addConduit' && (linkDrawState ? (isMobile ? 'Tap node to complete' : 'Click node to complete Conduit, or click map for vertex (Esc to cancel)') : (isMobile ? 'Tap start node' : 'Click start node for Conduit (Esc to cancel)'))}
              {interactionMode === 'addPump' && (linkDrawState ? (isMobile ? 'Tap node to complete' : 'Click node to complete Pump (Esc to cancel)') : (isMobile ? 'Tap start node' : 'Click start node for Pump (Esc to cancel)'))}
              {interactionMode === 'addLabel' && (isMobile ? 'Tap to place Label' : 'Click to place Label (Esc to cancel)')}
              {interactionMode === 'groupSelect' && (isMobile ? 'Tap to add polygon points' : 'Click to add polygon points, double-click or right-click to close (Esc to cancel)')}
              {interactionMode === 'query' && 'Query mode active'}
            </div>
          )}

          {expertMode && showCflPanel && cflAnalysis && (
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

          {expertMode && showSystemPanel && results && results.timeSteps[timeStep]?.system && (
            <div
              className="absolute top-2 left-2 w-[calc(100%-16px)] md:w-[300px] max-h-[calc(100%-16px)] overflow-y-auto z-20 rounded-lg shadow-xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.97)', border: '1px solid #d0d0d8' }}
              data-testid="system-panel"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#d0d0d8]">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-[#2c6eb5]" />
                  <span className="text-[11px] font-semibold text-[#2a2a3e]">System Variables</span>
                </div>
                <button onClick={() => setShowSystemPanel(false)} className="text-[#6b6b7b] hover:text-[#2a2a3e]" data-testid="btn-sys-close">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="px-3 py-2 space-y-1.5">
                {getSystemCategories().map(group => (
                  <div key={group.label}>
                    <div className="text-[9px] font-semibold text-[#6b6b7b] uppercase tracking-wide mb-0.5">{group.label}</div>
                    {group.vars.map(v => {
                      const val = results.timeSteps[timeStep]?.system?.extended?.[v.key];
                      const isSelected = v.key === systemTheme;
                      return (
                        <div
                          key={v.key}
                          className={`flex items-center justify-between px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${isSelected ? 'bg-[#e0ecff]' : 'hover:bg-[#f4f4f8]'}`}
                          onClick={() => setSystemTheme(v.key)}
                          data-testid={`sys-var-${v.key}`}
                        >
                          <span className={`flex items-center gap-1 min-w-0 ${isSelected ? 'text-[#2c6eb5] font-semibold' : 'text-[#2a2a3e]'}`}>
                            <span className="truncate">{v.name}</span>
                            <ProvenanceBadge variable={v} />
                          </span>
                          <span className="font-mono text-[#6b6b7b] shrink-0">
                            {val !== undefined ? val.toFixed(3) : '—'} <span className="text-[8px]">{v.units}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!results && Object.keys(project.coordinates).length > 0 && interactionMode === 'select' && (
            <div className="absolute bottom-14 sm:bottom-4 left-1/2 -translate-x-1/2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-[11px] text-[#6b6b7b] bg-white/80 backdrop-blur-sm border border-[#d0d0d8] max-w-[90%] text-center" data-testid="hint-run">
              {isMobile ? <>Tap <strong className="text-[#2c6eb5]">Project &gt; Run</strong> to simulate</> : <>Click <strong className="text-[#2c6eb5]">Project &gt; Run</strong> to simulate, or drag an .inp file here</>}
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

        {!isMobile && !showRightPanel && (
          <button
            onClick={() => setShowRightPanel(true)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1 rounded-l-md transition-colors"
            style={{ backgroundColor: '#e8e8f0', border: '1px solid #d0d0d8', borderRight: 'none' }}
            title="Show Project Explorer"
            data-testid="btn-show-right-panel"
          >
            <ChevronLeft className="w-4 h-4 text-[#4a4a5a] rotate-180" />
          </button>
        )}
        <div
          className={`${isMobile ? (mobilePanel === 'right' ? 'fixed right-0 top-0 bottom-0 z-50 w-[300px] shadow-2xl animate-in slide-in-from-right duration-200' : 'hidden') : (showRightPanel ? 'w-[220px]' : 'hidden')} shrink-0 overflow-hidden flex flex-col`}
          style={{ backgroundColor: '#f8f8fa', borderLeft: '1px solid #d0d0d8' }}
        >
          {isMobile && mobilePanel === 'right' && (
            <div className="h-10 flex items-center justify-between px-3 border-b shrink-0" style={{ backgroundColor: '#2c3e6b', borderColor: '#d0d0d8' }}>
              <span className="text-sm font-medium text-white">Project Explorer</span>
              <button onClick={() => setMobilePanel('none')} className="p-1.5 rounded-full hover:bg-white/10" data-testid="btn-close-right-panel"><X className="w-4 h-4 text-white/80" /></button>
            </div>
          )}
          {!isMobile && (
            <div className="h-7 flex items-center justify-between px-2 shrink-0" style={{ backgroundColor: '#e8edf2', borderBottom: '1px solid #d0d0d8' }}>
              <span className="text-[10px] font-medium text-[#4a4a5a] uppercase tracking-wide">Project Explorer</span>
              <button onClick={() => setShowRightPanel(false)} className="p-0.5 rounded hover:bg-black/[0.06] transition-colors" title="Close panel" data-testid="btn-close-explorer">
                <X className="w-3.5 h-3.5 text-[#6b6b7b]" />
              </button>
            </div>
          )}
          <div className={`${selectedObj ? 'h-[45%]' : 'flex-1'} overflow-hidden`}>
            <ProjectExplorer
              project={project}
              selectedObj={selectedObj}
              onSelectObj={handleSelectObj}
              results={results}
              timeStep={timeStep}
              onUpdateProject={handleUpdateProject}
              onViewTable={handleViewTable}
            />
          </div>
          {selectedObj && (
            <div className="flex-1 overflow-hidden border-t border-[#d0d0d8]" data-testid="property-editor-panel">
              <PropertyEditor
                project={project}
                selectedObj={selectedObj}
                onUpdateProject={handleUpdateProject}
                onClose={() => setSelectedObj(null)}
                onSubdialog={(type, objId) => setActiveSubDialog({ type, objId })}
                results={results}
                timeStep={timeStep}
              />
            </div>
          )}
        </div>
        {showAIAssist && !isMobile && (
          <div className="w-[260px] shrink-0 overflow-hidden flex flex-col" style={{ borderLeft: '1px solid #d0d0d8' }} data-testid="ai-assist-sidebar">
            <AIAssistPanel
              project={project}
              results={results}
              onSelectObject={(objType, id) => handleSelectObj({ objType: objType as NonNullable<SelectedObject>['objType'], id })}
              onUpdateProject={handleUpdateProject}
            />
          </div>
        )}
      </div>

      <div className="h-6 sm:h-7 flex items-center px-1 md:px-2 shrink-0 overflow-x-auto gap-0.5" style={{ backgroundColor: '#f0f0f4', borderTop: '1px solid #d0d0d8' }} data-testid="status-bar">
        <StatusItem text={flowUnits} icon={<Droplets className="w-3 h-3" />} />
        <span className="mobile-hidden"><StatusItem text={routingModel} icon={<ArrowLeftRight className="w-3 h-3" />} /></span>
        <span className="mobile-hidden"><StatusItem text={infiltModel} icon={<CloudRain className="w-3 h-3" />} /></span>
        <StatusItem
          text={simStatus === 'current' ? (isMobile ? 'OK' : 'Results Current') : simStatus === 'running' ? (simProgressMsg || 'Running...') : (isMobile ? 'No Sim' : 'No Results')}
          color={simStatus === 'current' ? '#2a8a4a' : simStatus === 'running' ? '#c08820' : '#6b6b7b'}
          bold={simStatus === 'current'}
          icon={simStatus === 'current' ? <CheckCircle2 className="w-3 h-3" /> : simStatus === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
        />
        {expertMode && cflAnalysis && cflAnalysis.flaggedCount > 0 && (
          <StatusItem
            text={`CFL: ${cflAnalysis.flaggedCount}`}
            color="#d04040"
            icon={<AlertTriangle className="w-3 h-3" />}
            onClick={() => setShowCflPanel(true)}
          />
        )}
        {expertMode && cflAnalysis && cflAnalysis.flaggedCount === 0 && cflAnalysis.totalCount > 0 && (
          <StatusItem
            text="CFL: OK"
            color="#2a8a4a"
            icon={<CheckCircle2 className="w-3 h-3" />}
          />
        )}
        <StatusItem
          text={engineMode === 'local' ? 'Local 5.2.4' : engineMode === 'wasm' ? 'WASM 5.2.4' : engineMode === 'wasm6' ? 'WASM 6.0-a3' : engineMode === 'remote' ? 'Remote 5.2.4' : 'Mock'}
          color={engineMode === 'local' ? '#2a8a4a' : engineMode === 'wasm' ? '#e88a1a' : engineMode === 'wasm6' ? '#8a4ae2' : engineMode === 'remote' ? '#2c6eb5' : '#6b6b7b'}
          icon={<span className={`w-2 h-2 rounded-full inline-block ${engineMode === 'local' ? 'bg-[#2a8a4a]' : engineMode === 'wasm' ? 'bg-[#e88a1a]' : engineMode === 'wasm6' ? 'bg-[#8a4ae2]' : engineMode === 'remote' ? 'bg-[#2c6eb5]' : 'bg-[#9090a0]'}`} />}
        />
        <div className="flex-1" />
        <span className="text-[8px] sm:text-[9px] font-mono text-[#6b6b7b] flex items-center gap-1 sm:gap-1.5" data-testid="status-counts">
          <span className="bg-[#e8edf2] px-1 sm:px-1.5 py-0.5 rounded text-[#4a4a5a]">{project.junctions.length + project.outfalls.length + project.storageUnits.length + project.dividers.length}<span className="hidden sm:inline"> nodes</span><span className="sm:hidden">N</span></span>
          <span className="bg-[#e8edf2] px-1 sm:px-1.5 py-0.5 rounded text-[#4a4a5a]">{project.conduits.length + project.pumps.length + project.weirs.length + project.orifices.length + project.outlets.length}<span className="hidden sm:inline"> links</span><span className="sm:hidden">L</span></span>
          <span className="hidden sm:inline bg-[#e8edf2] px-1.5 py-0.5 rounded text-[#4a4a5a]">{project.subcatchments.length} subcatch</span>
        </span>
        <span className="text-[9px] text-[#9090a0] mx-1 sm:mx-1.5 hidden sm:inline">|</span>
        <a
          href="https://github.com/SWMMEnablement"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[8px] sm:text-[9px] text-[#6b6b7b] hover:text-[#2c6eb5] transition-colors hidden sm:inline"
          data-testid="link-credit"
        >
          SWMMEnablement
        </a>
      </div>

      <Dialog open={showMockConfirm} onOpenChange={setShowMockConfirm}>
        <DialogContent className="max-w-md bg-white border-[#d0d0d8]" data-testid="mock-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#b45309]">
              <AlertTriangle className="w-5 h-5" /> Mock Engine Selected
            </DialogTitle>
            <DialogDescription className="text-[#6b6b7b]">
              You are about to run the Mock engine, which produces synthetic results.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded border border-[#f0c060] bg-[#fdf6e3] px-3 py-2 text-[11px] text-[#7a5210] leading-relaxed" data-testid="text-mock-warning">
            The Mock engine does <b>not</b> run EPA SWMM. It generates artificial, hydraulically plausible-looking numbers for interface testing only. Do not use these results for design, analysis, or any engineering decisions.
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setShowMockConfirm(false)} className="bg-[#f0f0f4] border-[#d0d0d8] text-[#2a2a3e]" data-testid="btn-mock-cancel">
              Cancel
            </Button>
            <Button size="sm" onClick={() => { setShowMockConfirm(false); startSimulation(); }} className="bg-[#b45309] text-white hover:bg-[#92400e]" data-testid="btn-mock-confirm">
              Run Synthetic Simulation
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'github'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-lg w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto" data-testid="github-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#2a2a3e]">
              <Github className="w-5 h-5" /> SWMM5 Model Repository
            </DialogTitle>
            <DialogDescription className="text-[#6b6b7b]">
              Browse {ghBrowseOwner}/{ghBrowseRepo} — select an INP file to load
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-[10px] text-[#6b6b7b] shrink-0">Repository</Label>
              <Select
                value={`${ghBrowseOwner}/${ghBrowseRepo}`}
                onValueChange={(v) => {
                  const [owner, repo] = v.split('/');
                  setGhBrowseOwner(owner);
                  setGhBrowseRepo(repo);
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-white border-[#d0d0d8] text-[#2a2a3e]" data-testid="select-gh-repo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GH_REPOS.map(r => (
                    <SelectItem key={`${r.owner}/${r.repo}`} value={`${r.owner}/${r.repo}`} className="text-xs" data-testid={`gh-repo-${r.repo}`}>
                      {r.owner}/{r.repo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-md w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto" data-testid="preferences-dialog">
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
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-sm w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto" data-testid="export-dialog">
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

      <Dialog open={openDialog === 'mapOptions'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-md w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto" data-testid="map-options-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#2c3e6b]">
              <Settings className="w-4 h-4" /> Map Options
            </DialogTitle>
            <DialogDescription className="text-[#6b6b7b]">Configure map display, backdrop image, and node sizing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#2c3e6b]">Backdrop Image</h4>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="text-[11px] h-7 border-[#d0d0d8]" data-testid="btn-load-backdrop"
                  onClick={() => {
                    const inp = document.createElement('input');
                    inp.type = 'file';
                    inp.accept = 'image/*';
                    inp.onchange = () => {
                      const file = inp.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          updatePreference('backdropImage', reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    };
                    inp.click();
                  }}
                >Load Image...</Button>
                {preferences.backdropImage && (
                  <Button size="sm" variant="outline" className="text-[11px] h-7 border-[#d0d0d8] text-red-600" data-testid="btn-clear-backdrop"
                    onClick={() => updatePreference('backdropImage', '')}
                  >Clear</Button>
                )}
              </div>
              {preferences.backdropImage && (
                <div className="space-y-2 pl-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] w-14">Opacity</Label>
                    <input type="range" min={0.05} max={1} step={0.05} value={preferences.backdropOpacity}
                      onChange={e => updatePreference('backdropOpacity', +e.target.value)}
                      className="flex-1" style={{ accentColor: '#2c6eb5' }} data-testid="slider-backdrop-opacity" />
                    <span className="text-[10px] font-mono w-8 text-right">{Math.round(preferences.backdropOpacity * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] w-14">Scale</Label>
                    <input type="range" min={0.1} max={10} step={0.1} value={preferences.backdropScale}
                      onChange={e => updatePreference('backdropScale', +e.target.value)}
                      className="flex-1" style={{ accentColor: '#2c6eb5' }} data-testid="slider-backdrop-scale" />
                    <span className="text-[10px] font-mono w-8 text-right">{(preferences.backdropScale ?? 1).toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] w-14">Offset X</Label>
                    <input type="number" value={preferences.backdropOffsetX} step={10}
                      onChange={e => updatePreference('backdropOffsetX', +e.target.value)}
                      className="flex-1 text-[10px] rounded px-1.5 py-1 border border-[#d0d0d8]" data-testid="input-backdrop-ox" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] w-14">Offset Y</Label>
                    <input type="number" value={preferences.backdropOffsetY} step={10}
                      onChange={e => updatePreference('backdropOffsetY', +e.target.value)}
                      className="flex-1 text-[10px] rounded px-1.5 py-1 border border-[#d0d0d8]" data-testid="input-backdrop-oy" />
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#2c3e6b]">Node Display</h4>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] w-14">Node Size</Label>
                <input type="range" min={0.3} max={3} step={0.1} value={preferences.nodeSize}
                  onChange={e => updatePreference('nodeSize', +e.target.value)}
                  className="flex-1" style={{ accentColor: '#2c6eb5' }} data-testid="slider-node-size-dialog" />
                <span className="text-[10px] font-mono w-8 text-right">{(preferences.nodeSize ?? 1).toFixed(1)}x</span>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#2c3e6b]">Minimap</h4>
              <div className="flex items-center gap-2">
                <Switch checked={preferences.showMinimap} onCheckedChange={v => updatePreference('showMinimap', v)} data-testid="switch-minimap" />
                <Label className="text-[10px]">Show overview minimap</Label>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#2c3e6b]">Labels</h4>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                  <input type="checkbox" checked={preferences.showNodeIds} onChange={e => updatePreference('showNodeIds', e.target.checked)}
                    className="w-3 h-3 rounded" style={{ accentColor: '#2c6eb5' }} data-testid="chk-show-node-ids" />
                  Node IDs
                </label>
                <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                  <input type="checkbox" checked={preferences.showLinkIds} onChange={e => updatePreference('showLinkIds', e.target.checked)}
                    className="w-3 h-3 rounded" style={{ accentColor: '#2c6eb5' }} data-testid="chk-show-link-ids" />
                  Link IDs
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] w-14">BG Color</Label>
              <input type="color" value={preferences.mapBackgroundColor}
                onChange={e => updatePreference('mapBackgroundColor', e.target.value)}
                className="w-8 h-6 border border-[#d0d0d8] rounded cursor-pointer" data-testid="input-map-bg-color" />
              <span className="text-[10px] font-mono text-[#6b6b7b]">{preferences.mapBackgroundColor}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'groupEdit'} onOpenChange={v => { if (!v) { setOpenDialog(null); setGroupSelectedIds(null); setGroupSelectPoints([]); setInteractionMode('select'); } }}>
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-sm w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto" data-testid="group-edit-dialog">
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
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-lg w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto" data-testid="import-dialog">
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
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-sm w-[95vw] sm:w-auto max-h-[90vh] overflow-y-auto" data-testid="export-data-dialog">
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
              <span className="ml-auto text-[10px] text-[#6b6b7b]">{project.junctions.length + project.outfalls.length + project.storageUnits.length + project.dividers.length} nodes</span>
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

      <Dialog open={showReportDialog} onOpenChange={v => { setShowReportDialog(v); if (!v) setReportSearchTerm(''); }}>
        <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-4xl w-[95vw] sm:w-auto max-h-[85vh] flex flex-col" data-testid="report-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#2a2a3e]">
              <BarChart3 className="w-4 h-4" /> SWMM Report
              {results?.engineUsed === 'mock' && <SyntheticResultsLabel />}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#6b6b7b]">
              Full simulation report output (.rpt file contents). Use the search bar to find sections.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex rounded border border-[#d0d0d8] overflow-hidden shrink-0">
              {(['text', 'html'] as const).map(m => (
                <button
                  key={m}
                  className={`px-2.5 py-1.5 text-[10px] font-semibold ${reportViewMode === m ? 'bg-[#2c6eb5] text-white' : 'bg-white text-[#4a4a5a] hover:bg-[#f0f0f4]'}`}
                  onClick={() => setReportViewMode(m)}
                  data-testid={`btn-report-view-${m}`}
                >
                  {m === 'text' ? 'Text' : 'HTML'}
                </button>
              ))}
            </div>
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#9090a0]" />
              <input
                type="text"
                placeholder="Search report..."
                value={reportSearchTerm}
                onChange={e => setReportSearchTerm(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-[11px] border border-[#d0d0d8] rounded bg-white outline-none focus:border-[#2c6eb5]"
                data-testid="input-report-search"
              />
            </div>
            {reportSearchTerm && reportContent && (
              <span className="text-[10px] text-[#6b6b7b] shrink-0">
                {(reportContent.toLowerCase().match(new RegExp(reportSearchTerm.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length} matches
              </span>
            )}
          </div>
          <div className="flex gap-1 mb-1 flex-wrap">
            {['Summary', 'Node Depth', 'Node Inflow', 'Node Flooding', 'Link Flow', 'Subcatchment Runoff', 'Cross Section', 'Continuity', 'Routing Time Step'].map(section => (
              <button
                key={section}
                className="px-2 py-0.5 text-[9px] rounded border border-[#d0d0d8] hover:bg-[#e8f0fb] text-[#4a4a5a]"
                onClick={() => {
                  setReportSearchTerm(section);
                  setTimeout(() => {
                    const mark = document.querySelector('[data-testid="report-content"] mark');
                    if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 50);
                }}
                data-testid={`report-jump-${section.toLowerCase().replace(/\s/g, '-')}`}
              >
                {section}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto min-h-0" style={{ maxHeight: 'calc(85vh - 200px)' }}>
            {reportViewMode === 'html' && reportContent ? (
              <RptHtmlView content={reportContent} searchTerm={reportSearchTerm} />
            ) : (
              <pre
                className="text-[11px] leading-[1.4] p-3 rounded border border-[#d0d0d8] bg-[#f8f8fa] whitespace-pre overflow-x-auto font-mono"
                data-testid="report-content"
              >
                {(() => {
                  const text = reportContent || 'No report available.';
                  if (!reportSearchTerm) return text;
                  const escaped = reportSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
                  return parts.map((part, i) =>
                    i % 2 === 1 ? <mark key={i} className="bg-yellow-200 text-[#2a2a3e]">{part}</mark> : part
                  );
                })()}
              </pre>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (reportContent) {
                  const text = results?.engineUsed === 'mock' ? SYNTHETIC_TEXT_HEADER + reportContent : reportContent;
                  navigator.clipboard.writeText(text);
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
                  const isMock = results?.engineUsed === 'mock';
                  const text = isMock ? SYNTHETIC_TEXT_HEADER + reportContent : reportContent;
                  const blob = new Blob([text], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = (fileName || 'model').replace(/\.inp$/i, '') + (isMock ? '_SYNTHETIC.rpt' : '.rpt');
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
        <DialogContent className="max-w-4xl w-[95vw] sm:w-auto bg-white border-[#d0d0d8] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" /> Profile Plot
              {results?.engineUsed === 'mock' && <SyntheticResultsLabel />}
            </DialogTitle>
            <DialogDescription>Select conduits to define a longitudinal path and view the profile.</DialogDescription>
          </DialogHeader>
          <ProfilePlotContent project={project} results={results} timeStep={timeStep} />
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'timeSeries'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="max-w-5xl w-[95vw] sm:w-auto bg-white border-[#d0d0d8] max-h-[90vh] overflow-y-auto" data-testid="time-series-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Time Series Graph
              {results?.engineUsed === 'mock' && <SyntheticResultsLabel />}
            </DialogTitle>
            <DialogDescription>View simulation results over time for any node, link, or subcatchment.</DialogDescription>
          </DialogHeader>
          {results && (
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => { setTableViewMode('byObject'); setOpenDialog('tableView'); }}
              data-testid="button-graph-view-table"
            >
              <Table2 className="w-3.5 h-3.5 mr-1" /> View as Data Table
            </Button>
          )}
          {results && <TimeSeriesPlotContent project={project} results={results} selectedObj={selectedObj} timeStep={timeStep} calibrationData={calibrationData} />}
        </DialogContent>
      </Dialog>

      <Dialog open={expertMode && openDialog === 'calibration'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="max-w-5xl w-[95vw] sm:w-auto bg-white border-[#d0d0d8] max-h-[90vh] overflow-y-auto" data-testid="calibration-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
              <Target className="w-4 h-4" /> Calibration Analysis
              {results?.engineUsed === 'mock' && <SyntheticResultsLabel />}
            </DialogTitle>
            <DialogDescription>Compare observed measurements against simulation results at calibration locations.</DialogDescription>
          </DialogHeader>
          <CalibrationContent
            project={project}
            results={results}
            calibrationData={calibrationData}
            onLoadData={(ds) => setCalibrationData(prev => [...prev, ds])}
            onRemoveData={(idx) => setCalibrationData(prev => prev.filter((_, i) => i !== idx))}
            onUpdateData={(idx, patch) => setCalibrationData(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d))}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'statisticsReport'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="max-w-5xl w-[95vw] sm:w-auto bg-white border-[#d0d0d8] max-h-[90vh] overflow-y-auto" data-testid="statistics-report-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
              <Calculator className="w-4 h-4" /> Statistics Report
              {results?.engineUsed === 'mock' && <SyntheticResultsLabel />}
            </DialogTitle>
            <DialogDescription>Define statistical analysis parameters for simulation results.</DialogDescription>
          </DialogHeader>
          {results && <StatisticsReportContent project={project} results={results} selectedObj={selectedObj} />}
        </DialogContent>
      </Dialog>

      <Dialog open={expertMode && openDialog === 'scatterPlot'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="max-w-5xl w-[95vw] sm:w-auto bg-white border-[#d0d0d8] max-h-[90vh] overflow-y-auto" data-testid="scatter-plot-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
              <Activity className="w-4 h-4" /> Scatter Plot
              {results?.engineUsed === 'mock' && <SyntheticResultsLabel />}
            </DialogTitle>
            <DialogDescription>Plot any two variables against each other. Select X and Y axes, overlay multiple objects.</DialogDescription>
          </DialogHeader>
          {results && <ScatterPlotContent project={project} results={results} selectedObj={selectedObj} />}
        </DialogContent>
      </Dialog>

      <Dialog open={expertMode && openDialog === 'transectEditor'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="max-w-4xl w-[95vw] sm:w-auto bg-white border-[#d0d0d8] max-h-[90vh] overflow-y-auto" data-testid="transect-editor-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
              <Droplets className="w-4 h-4" /> Transect Editor
            </DialogTitle>
            <DialogDescription>Create and edit cross-section transects for IRREGULAR shaped conduits.</DialogDescription>
          </DialogHeader>
          <TransectEditorContent project={project} onUpdateProject={handleUpdateProject} />
        </DialogContent>
      </Dialog>

      <Dialog open={expertMode && openDialog === 'splitScreen'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="max-w-6xl w-[98vw] bg-white border-[#d0d0d8] max-h-[90vh] overflow-y-auto" data-testid="split-screen-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
              <PanelLeftOpen className="w-4 h-4" /> Split-Screen Comparison
            </DialogTitle>
            <DialogDescription>Compare two scenarios side by side. Load a second INP file to compare network topology and mock results.</DialogDescription>
          </DialogHeader>
          <SplitScreenContent
            projectA={project}
            resultsA={results}
            fileNameA={fileName}
            timeStep={timeStep}
            projectB={splitScreenProject}
            onLoadB={(p, r, n) => setSplitScreenProject({ project: p, results: r, fileName: n })}
            regressionBaseline={regressionBaseline}
            onSetBaseline={setRegressionBaseline}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'findObject'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="max-w-md bg-white border-[#d0d0d8]" data-testid="find-object-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
              <Search className="w-4 h-4" /> Find Object
            </DialogTitle>
            <DialogDescription>Search for objects by ID. Press Enter or click a result to navigate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <input
              type="text"
              value={findSearchTerm}
              onChange={e => setFindSearchTerm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && findResults.length > 0) handleFindObject(findResults[0].id, findResults[0].objType); }}
              placeholder="Type object ID..."
              className="w-full px-3 py-2 border border-[#d0d0d8] rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#2c6eb5]"
              data-testid="find-object-input"
              autoFocus
            />
            <div className="max-h-[300px] overflow-y-auto border border-[#e0e0e8] rounded">
              {findResults.length === 0 && findSearchTerm.trim() && (
                <div className="px-3 py-4 text-center text-[11px] text-[#9090a0]" data-testid="find-no-results">No objects found</div>
              )}
              {findResults.map(r => (
                <button
                  key={`${r.objType}-${r.id}`}
                  onClick={() => handleFindObject(r.id, r.objType)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-[#f0f0f4] cursor-pointer text-left"
                  data-testid={`find-result-${r.id}`}
                >
                  <span className="text-[#6b6b7b] min-w-[70px]">{r.category}</span>
                  <span className="text-[#2a2a3e] font-medium">{r.id}</span>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'projectSummary'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="max-w-lg bg-white border-[#d0d0d8] max-h-[85vh] overflow-y-auto" data-testid="project-summary-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
              <List className="w-4 h-4" /> Project Summary
            </DialogTitle>
            <DialogDescription>Object counts and key analysis options for the current model.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
            {([
              ['Rain Gages', project.raingages.length],
              ['Subcatchments', project.subcatchments.length],
              ['Junctions', project.junctions.length],
              ['Outfalls', project.outfalls.length],
              ['Dividers', project.dividers.length],
              ['Storage Units', project.storageUnits.length],
              ['Conduits', project.conduits.length],
              ['Pumps', project.pumps.length],
              ['Orifices', project.orifices.length],
              ['Weirs', project.weirs.length],
              ['Outlets', project.outlets.length],
              ['Cross-Sections', Array.isArray(project.xsections) ? project.xsections.length : Object.keys(project.xsections || {}).length],
              ['Time Series', Object.keys(project.timeseries || {}).length],
              ['Curves', Object.keys(project.curves || {}).length],
              ['Patterns', Object.keys(project.patterns || {}).length],
              ['Pollutants', (project.pollutants || []).length],
            ] as [string, number][]).map(([name, count]) => (
              <div key={name} className="flex justify-between border-b border-[#f0f0f4] py-0.5" data-testid={`summary-count-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                <span className="text-[#6b6b7b]">{name}</span>
                <span className="font-semibold text-[#2a2a3e]">{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-2">
            <div className="text-[11px] font-bold text-[#2c3e6b] mb-1">Analysis Options</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
              {([
                ['Flow Units', project.options['FLOW_UNITS']],
                ['Routing', project.options['FLOW_ROUTING']],
                ['Infiltration', project.options['INFILTRATION']],
                ['Start Date', project.options['START_DATE']],
                ['End Date', project.options['END_DATE']],
                ['Routing Step', project.options['ROUTING_STEP']],
              ] as [string, string | undefined][]).map(([name, val]) => (
                <div key={name} className="flex justify-between border-b border-[#f0f0f4] py-0.5">
                  <span className="text-[#6b6b7b]">{name}</span>
                  <span className="font-semibold text-[#2a2a3e]">{val || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openDialog === 'projectDetails'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="max-w-4xl w-[95vw] sm:w-auto bg-white border-[#d0d0d8] max-h-[90vh] flex flex-col" data-testid="project-details-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
              <FileText className="w-4 h-4" /> Project Details
            </DialogTitle>
            <DialogDescription>Browse all SWMM5 sections as tables, or view the full input file text.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setDetailsView('grid')}
              className={`px-3 py-1 text-[11px] rounded-t border border-b-0 ${detailsView === 'grid' ? 'bg-[#2c6eb5] text-white border-[#2c6eb5]' : 'bg-[#f0f0f4] text-[#2a2a3e] border-[#d0d0d8] hover:bg-[#e6e6ec]'}`}
              data-testid="tab-details-grid"
            >
              Grid View
            </button>
            <button
              onClick={() => setDetailsView('inp')}
              className={`px-3 py-1 text-[11px] rounded-t border border-b-0 ${detailsView === 'inp' ? 'bg-[#2c6eb5] text-white border-[#2c6eb5]' : 'bg-[#f0f0f4] text-[#2a2a3e] border-[#d0d0d8] hover:bg-[#e6e6ec]'}`}
              data-testid="tab-details-inp"
            >
              INP Text
            </button>
          </div>
          {openDialog === 'projectDetails' && detailsView === 'grid' && (
            <SectionGridView project={project} />
          )}
          {openDialog === 'projectDetails' && detailsView === 'inp' && (
            <pre className="flex-1 overflow-auto border border-[#e0e0e8] rounded bg-[#f8f8fa] p-3 text-[10px] leading-[1.5] text-[#2a2a3e] whitespace-pre font-mono" data-testid="project-details-text">
              {projectToInp(project)}
            </pre>
          )}
        </DialogContent>
      </Dialog>

      <AnalysisOptionsDialog
        open={openDialog === 'analysisOptions'}
        onOpenChange={v => !v && setOpenDialog(null)}
        project={project}
        onUpdateProject={handleUpdateProject}
        initialTab={analysisOptionsTab}
      />

      <DataEditorDialog
        open={openDialog === 'dataEditor'}
        onOpenChange={v => !v && setOpenDialog(null)}
        project={project}
        onUpdateProject={handleUpdateProject}
        initialSection={dataEditorSection}
        initialItem={dataEditorItem}
      />

      <AboutDialog
        open={openDialog === 'about'}
        onOpenChange={v => !v && setOpenDialog(null)}
      />

      <EngineDiagnosticsDialog
        open={expertMode && openDialog === 'engineDiagnostics'}
        onOpenChange={v => !v && setOpenDialog(null)}
        provenance={runProvenance}
      />

      <IntegrityReportDialog
        open={showIntegrityReport}
        onClose={() => setShowIntegrityReport(false)}
        info={integrityInfo}
        fileName={fileName}
        autosaveError={autosaveError}
        onRestoreSnapshot={handleRestoreSnapshot}
        onClearSnapshots={handleClearSnapshots}
        snapshotRefresh={snapshotRefresh}
      />

      <RecoveryDialog
        open={showRecoveryDialog}
        snapshot={recoverySnapshot}
        onRecover={() => { if (recoverySnapshot) handleRestoreSnapshot(recoverySnapshot); }}
        onDismiss={() => setShowRecoveryDialog(false)}
        onDiscard={() => { handleClearSnapshots(); setRecoveryBaseline(); setShowRecoveryDialog(false); setRecoverySnapshot(null); }}
      />

      <ModelHealthDialog
        open={openDialog === 'modelHealth'}
        onOpenChange={v => !v && setOpenDialog(null)}
        project={project}
        results={results}
        onSelectObject={handleHealthSelect}
      />

      <RoundTripAuditDialog
        open={openDialog === 'roundtripAudit'}
        onOpenChange={v => !v && setOpenDialog(null)}
        project={project}
      />

      {/* Round-trip audit save warning dialog */}
      <Dialog open={!!saveAuditWarning} onOpenChange={v => { if (!v) setSaveAuditWarning(null); }}>
        <DialogContent className="max-w-sm p-0 gap-0" data-testid="dialog-save-audit-warning">
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-[#d0d0d8]">
            <DialogTitle className="text-[13px] text-[#2a2a3e] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Data may be lost on save
            </DialogTitle>
            <DialogDescription className="text-[11px] text-[#6b6b7b] mt-1">
              The Round-Trip Audit found{' '}
              <b>{saveAuditWarning?.diffCount ?? 0} field{(saveAuditWarning?.diffCount ?? 0) !== 1 ? 's' : ''}</b>
              {(saveAuditWarning?.omittedCount ?? 0) > 0 && (
                <> ({saveAuditWarning?.omittedCount} omitted)</>
              )}{' '}
              that would be altered or removed when the file is written. The saved .inp will not match what is currently in memory.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 py-3 space-y-3">
            <label className="flex items-center gap-2 text-[11px] text-[#6b6b7b] cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-yellow-500"
                checked={auditWarnDontAskAgain}
                onChange={e => setAuditWarnDontAskAgain(e.target.checked)}
                data-testid="checkbox-audit-warning-dont-ask"
              />
              Don't warn again this session
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-[11px] h-8 border-[#d0d0d8] text-[#2a2a3e] hover:bg-[#f0f0f4]"
                onClick={() => { setSaveAuditWarning(null); setOpenDialog('roundtripAudit'); }}
                data-testid="btn-audit-warning-view"
              >
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                View Full Audit
              </Button>
              <Button
                size="sm"
                className="flex-1 text-[11px] h-8 bg-yellow-500 hover:bg-yellow-600 text-white"
                onClick={() => { if (auditWarnDontAskAgain) auditWarnSuppressedRef.current = true; const fn = saveAuditWarning?.onConfirm; setSaveAuditWarning(null); fn?.(); }}
                data-testid="btn-audit-warning-save-anyway"
              >
                Save Anyway
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-[11px] h-7 text-[#6b6b7b] hover:bg-[#f0f0f4]"
              onClick={() => setSaveAuditWarning(null)}
              data-testid="btn-audit-warning-cancel"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PhaseSpaceDialog
        open={expertMode && openDialog === 'phaseSpace'}
        onOpenChange={v => !v && setOpenDialog(null)}
        project={project}
        results={results}
        target={phaseSpaceTarget}
        onTargetChange={setPhaseSpaceTarget}
      />

      <Viewer3DDialog
        open={openDialog === 'viewer3d'}
        onOpenChange={v => !v && setOpenDialog(null)}
        project={project}
        projectName={fileName?.replace(/\.inp$/i, '')}
      />

      <DiffToolDialog
        open={openDialog === 'diffTool'}
        onOpenChange={v => !v && setOpenDialog(null)}
        getCurrentInp={getCurrentInpForDiff}
      />

      <BatchRunnerDialog
        open={openDialog === 'batchRunner'}
        onOpenChange={v => !v && setOpenDialog(null)}
        availableEngines={([
          localAvailable && 'local',
          wasmAvailable && 'wasm',
          wasm6Available && 'wasm6',
          remoteAvailable && 'remote',
        ].filter(Boolean)) as BatchEngineId[]}
      />

      <DiagramGalleryDialog
        open={openDialog === 'diagramGallery'}
        onClose={() => setOpenDialog(null)}
        project={project}
        results={results}
      />

      <HelpTopicsDialog
        open={openDialog === 'helpTopics'}
        onOpenChange={v => !v && setOpenDialog(null)}
      />

      <HelpManualsDialog
        open={openDialog === 'helpManuals'}
        onOpenChange={v => !v && setOpenDialog(null)}
      />

      <AppsLauncherDialog
        open={openDialog === 'appsLauncher'}
        onOpenChange={v => !v && setOpenDialog(null)}
      />

      <HelpTutorialDialog
        open={openDialog === 'helpTutorial'}
        onOpenChange={v => !v && setOpenDialog(null)}
      />

      <HelpErrorsDialog
        open={openDialog === 'helpErrors'}
        onOpenChange={v => !v && setOpenDialog(null)}
        project={project}
        onSelectObject={(id, type) => {
          const validTypes = ['junction','outfall','divider','storage','conduit','pump','orifice','weir','outlet','subcatchment','raingage'] as const;
          const objType = validTypes.find(t => t === type);
          if (objType) setSelectedObj({ id, objType });
          setOpenDialog(null);
        }}
      />

      <ProjectDefaultsDialog
        open={openDialog === 'projectDefaults'}
        onOpenChange={v => !v && setOpenDialog(null)}
        project={project}
        onUpdateProject={handleUpdateProject}
      />

      <TableViewDialog
        open={openDialog === 'tableView'}
        onOpenChange={v => !v && setOpenDialog(null)}
        project={project}
        results={results}
        mode={tableViewMode}
        onModeChange={setTableViewMode}
        timeStep={timeStep}
      />

      <SubDialogRouter
        state={activeSubDialog}
        project={project}
        onClose={() => setActiveSubDialog(null)}
        onProjectChange={(p) => { handleUpdateProject(() => p); setActiveSubDialog(null); }}
      />

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[140px] py-1 rounded shadow-xl"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: '#ffffff',
            border: '1px solid #d0d0d8',
          }}
          role="menu"
          aria-label="Map context menu"
          data-testid="context-menu"
          onKeyDown={handleMenuKeyDown}
        >
          {contextMenu.obj && (
            <>
              <div className="px-3 py-1 text-[10px] text-[#6b6b7b] border-b border-[#d0d0d8]" data-testid="context-menu-title">
                {contextMenu.obj.objType} — {contextMenu.obj.id}
              </div>
              <ContextMenuItem icon={<FileText className="w-3 h-3" />} label="Properties" onClick={handleOpenProperties} testId="ctx-properties" />
              <ContextMenuItem icon={<Clipboard className="w-3 h-3" />} label="Copy ID" onClick={handleCopyId} testId="ctx-copy-id" />
              <div className="h-px my-0.5" style={{ backgroundColor: '#d0d0d8' }} />
              <ContextMenuItem icon={<Copy className="w-3 h-3" />} label="Copy" onClick={handleCopy} testId="ctx-copy" />
              <ContextMenuItem icon={<ClipboardPaste className="w-3 h-3" />} label="Paste" onClick={handlePaste} disabled={!copiedObj || copiedObj.objType !== ctxObj?.objType} testId="ctx-paste" />
              {isLinkType && (
                <ContextMenuItem icon={<RotateCcw className="w-3 h-3" />} label="Reverse" onClick={handleReverseLink} testId="ctx-reverse" />
              )}
              <ContextMenuItem icon={<ArrowLeftRight className="w-3 h-3" />} label="Find Connected" onClick={handleFindConnected} testId="ctx-find-connected" />
              {expertMode && ctxObj && objTypeToElementType(ctxObj.objType) && (
                <ContextMenuItem icon={<Activity className="w-3 h-3" />} label="Phase-Space Diagnostics" onClick={() => {
                  const et = objTypeToElementType(ctxObj.objType)!;
                  setPhaseSpaceTarget({ id: ctxObj.id, elementType: et });
                  setOpenDialog('phaseSpace');
                  closeContextMenu();
                }} testId="ctx-phase-space" />
              )}
              <div className="h-px my-0.5" style={{ backgroundColor: '#d0d0d8' }} />
              <ContextMenuItem icon={<Trash2 className="w-3 h-3" />} label="Delete" onClick={() => { if (contextMenu?.obj) deleteObject(contextMenu.obj); closeContextMenu(); }} danger testId="ctx-delete" />
            </>
          )}
          {!contextMenu.obj && (
            <>
              <ContextMenuItem icon={<Search className="w-3 h-3" />} label="Find Object..." onClick={() => { closeContextMenu(); setFindSearchTerm(''); setOpenDialog('findObject'); }} testId="ctx-find" />
            </>
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
      role="menuitem"
      tabIndex={-1}
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

function describeProject(p: SwmmProject): string {
  const nodes = p.junctions.length + p.outfalls.length + p.storageUnits.length + p.dividers.length;
  const links = p.conduits.length + p.pumps.length + p.weirs.length + p.orifices.length + p.outlets.length;
  const parts = [`${nodes} node${nodes === 1 ? '' : 's'}`, `${links} link${links === 1 ? '' : 's'}`];
  if (p.subcatchments.length > 0) parts.push(`${p.subcatchments.length} subcatchment${p.subcatchments.length === 1 ? '' : 's'}`);
  return parts.join(', ');
}

function ToolbarButton({ icon, label, accent, primary, onClick, disabled, testId, badge }: {
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
  primary?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={badge ? `${label} — ${badge} error${badge === 1 ? '' : 's'} detected` : label}
      aria-label={label}
      className={`relative flex flex-col items-center justify-center px-2 md:px-3 py-1 rounded min-w-[42px] md:min-w-[54px] transition-colors
        ${primary ? 'bg-[#1a7a3a] border border-[#15692f] shadow-sm' : accent ? 'bg-[rgba(44,110,181,0.12)] border border-[#2c6eb5]' : 'border border-transparent hover:bg-black/[0.04]'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : primary ? 'cursor-pointer hover:bg-[#1e8a42]' : 'cursor-pointer'}`}
      data-testid={testId}
    >
      {badge != null && badge > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-600 text-white text-[8px] font-bold flex items-center justify-center leading-none"
          data-testid={testId ? `${testId}-badge` : undefined}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <span className={primary ? 'text-white' : accent ? 'text-[#2c6eb5]' : 'text-[#4a4a5a]'}>{icon}</span>
      <span className={`text-[8px] md:text-[9px] mt-0.5 hidden sm:inline ${primary ? 'text-white font-semibold' : accent ? 'text-[#2c6eb5]' : 'text-[#6b6b7b]'}`}>{label}</span>
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
      aria-label={title}
      className="p-1 text-[#6b6b7b] hover:text-[#2a2a3e] transition-colors"
      data-testid={testId}
    >
      {icon}
    </button>
  );
}

function ThemeCombo({ label, value, onChange, options, groups, testId }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options?: [string, string][];
  groups?: { label: string; items: [string, string][] }[];
  testId?: string;
}) {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
      <span className="text-[9px] sm:text-[10px] text-[#6b6b7b] whitespace-nowrap">{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={`${label} theme variable`}
        className="text-[9px] sm:text-[10px] rounded px-1 sm:px-1.5 py-0.5"
        style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
        data-testid={testId}
      >
        {options && options.map(([val, lbl]) => (
          <option key={val} value={val}>{lbl}</option>
        ))}
        {groups && groups.map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
            ))}
          </optgroup>
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

interface CalibrationPoint {
  nodeId: string;
  dateTime: string;
  value: number;
}

interface CalibrationDataSet {
  variable: string;
  category: 'node' | 'link' | 'subcatch';
  points: CalibrationPoint[];
  name?: string;
}

const CALIB_FILENAME_VARS: { match: RegExp; variable: string; category: 'node' | 'link' | 'subcatch' }[] = [
  { match: /depth/i, variable: 'Depth', category: 'node' },
  { match: /head/i, variable: 'Head', category: 'node' },
  { match: /inflow|lateral/i, variable: 'TotalInflow', category: 'node' },
  { match: /flood/i, variable: 'Flooding', category: 'node' },
  { match: /velocity|veloc/i, variable: 'Velocity', category: 'link' },
  { match: /flow/i, variable: 'Flow', category: 'link' },
  { match: /capacity/i, variable: 'Capacity', category: 'link' },
  { match: /runoff/i, variable: 'Runoff', category: 'subcatch' },
  { match: /rain/i, variable: 'Rainfall', category: 'subcatch' },
  { match: /gw|groundwater/i, variable: 'GwOutflow', category: 'subcatch' },
  { match: /snow/i, variable: 'SnowDepth', category: 'subcatch' },
  { match: /evap/i, variable: 'Evap', category: 'subcatch' },
  { match: /infil/i, variable: 'Infiltration', category: 'subcatch' },
];

function parseCalibrationFile(text: string, fileName?: string): CalibrationDataSet {
  const lines = text.split(/\r?\n/);
  let variable = 'Head';
  let category: 'node' | 'link' | 'subcatch' = 'node';
  let variableFromHeader = false;
  let currentId = '';
  const points: CalibrationPoint[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) {
      const varMatch = line.match(/(?:variable|parameter)\s*[:\-=]\s*(\w+)/i);
      if (varMatch) {
        variable = varMatch[1];
        variableFromHeader = true;
        const vl = variable.toLowerCase();
        if (['flow', 'velocity', 'capacity'].includes(vl)) category = 'link';
        else if (['runoff', 'rainfall', 'gwoutflow', 'snowdepth', 'evap', 'infiltration', 'moisture'].includes(vl)) category = 'subcatch';
        else category = 'node';
      }
      const catMatch = line.match(/(?:category|type)\s*[:\-=]\s*(node|link|subcatch)/i);
      if (catMatch) {
        category = catMatch[1].toLowerCase() as 'node' | 'link' | 'subcatch';
      }
      continue;
    }
    const parts = line.split(/\s+/);
    const firstIsNumeric = /^[\d.\/:]+$/.test(parts[0]);

    if (parts.length === 1) {
      currentId = parts[0];
      continue;
    }

    if (!firstIsNumeric) {
      currentId = parts[0];
      if (parts.length >= 4) {
        const value = parseFloat(parts[parts.length - 1]);
        if (!isNaN(value)) {
          points.push({ nodeId: parts[0], dateTime: parts.slice(1, parts.length - 1).join(' '), value });
        }
      } else if (parts.length === 3) {
        const value = parseFloat(parts[2]);
        if (!isNaN(value)) {
          points.push({ nodeId: parts[0], dateTime: parts[1], value });
        }
      }
    } else if (currentId && parts.length >= 2) {
      const value = parseFloat(parts[parts.length - 1]);
      if (!isNaN(value)) {
        points.push({ nodeId: currentId, dateTime: parts.slice(0, parts.length - 1).join(' '), value });
      }
    }
  }

  if (!variableFromHeader && fileName) {
    for (const fv of CALIB_FILENAME_VARS) {
      if (fv.match.test(fileName)) {
        variable = fv.variable;
        category = fv.category;
        break;
      }
    }
  }

  return { variable, category, points, name: fileName };
}

function datasetToDatContent(ds: CalibrationDataSet): string {
  const lines: string[] = [];
  lines.push(`;; SWMM Calibration Data File`);
  lines.push(`;; Generated by SWMM5-UI`);
  lines.push(`;; Variable: ${ds.variable}`);
  lines.push(`;; Category: ${ds.category}`);
  lines.push(``);
  const byLocation = new Map<string, CalibrationPoint[]>();
  for (const pt of ds.points) {
    if (!byLocation.has(pt.nodeId)) byLocation.set(pt.nodeId, []);
    byLocation.get(pt.nodeId)!.push(pt);
  }
  for (const [locId, pts] of byLocation) {
    lines.push(locId);
    for (const pt of pts) {
      lines.push(`           ${pt.dateTime.padEnd(20)} ${pt.value}`);
    }
    lines.push(``);
  }
  return lines.join('\n');
}

function datasetFileName(ds: CalibrationDataSet, index: number): string {
  const base = (ds.name || `${ds.variable.toLowerCase()}_${ds.category}_${index + 1}`)
    .replace(/\.(dat|txt|cal)$/i, '')
    .replace(/[^\w.-]+/g, '_');
  return `${base}.dat`;
}

function normalizeCalibDateTime(s: string, simStartEpoch?: number): number {
  const m = s.match(/^(\d+(?:\.\d+)?)(?:\s+(\d+):(\d+)(?::(\d+))?)?$/);
  if (m) {
    if (simStartEpoch === undefined || isNaN(simStartEpoch)) return NaN;
    return simStartEpoch
      + (+m[1]) * 86400000
      + (m[2] ? +m[2] : 0) * 3600000
      + (m[3] ? +m[3] : 0) * 60000
      + (m[4] ? +m[4] : 0) * 1000;
  }
  return normalizeDateTime(s);
}

function normalizeDateTime(s: string): number {
  const m = s.match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+)(?::(\d+))?/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +(m[6] || 0)).getTime();
  const d = new Date(s);
  return isNaN(d.getTime()) ? NaN : d.getTime();
}

const CALIB_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2',
  '#be185d', '#65a30d', '#0d9488', '#6366f1', '#ea580c', '#4f46e5',
  '#059669', '#e11d48', '#84cc16', '#f59e0b', '#8b5cf6', '#06b6d4',
  '#334155', '#9333ea', '#f43f5e', '#14b8a6', '#a855f7', '#eab308',
];

const TS_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#65a30d'];
const CHART_NODE_VARS: { key: string; label: string; unit: string }[] = [
  { key: 'depth', label: 'Depth', unit: 'ft' },
  { key: 'head', label: 'Head', unit: 'ft' },
  { key: 'totalInflow', label: 'Total Inflow', unit: 'CFS' },
  { key: 'lateralInflow', label: 'Lateral Inflow', unit: 'CFS' },
  { key: 'flooding', label: 'Flooding', unit: 'CFS' },
  { key: 'volume', label: 'Volume', unit: 'ft³' },
];
const CHART_LINK_VARS: { key: string; label: string; unit: string }[] = [
  { key: 'flow', label: 'Flow', unit: 'CFS' },
  { key: 'velocity', label: 'Velocity', unit: 'ft/s' },
  { key: 'depth', label: 'Depth', unit: 'ft' },
  { key: 'capacity', label: 'Capacity', unit: '' },
  { key: 'volume', label: 'Volume', unit: 'ft³' },
];
const CHART_SUBCATCH_VARS: { key: string; label: string; unit: string }[] = [
  { key: 'rainfall', label: 'Rainfall', unit: 'in/hr' },
  { key: 'runoff', label: 'Runoff', unit: 'CFS' },
  { key: 'infiltration', label: 'Infiltration', unit: 'in/hr' },
  { key: 'evap', label: 'Evaporation', unit: 'in/hr' },
  { key: 'gwOutflow', label: 'GW Outflow', unit: 'CFS' },
  { key: 'moisture', label: 'Soil Moisture', unit: '' },
];

function StatisticsReportContent({ project, results, selectedObj }: {
  project: SwmmProject;
  results: SimulationResults;
  selectedObj: SelectedObject;
}) {
  const [category, setCategory] = useState<'subcatchment' | 'node' | 'link' | 'system'>(
    selectedObj?.objType === 'conduit' || selectedObj?.objType === 'pump' || selectedObj?.objType === 'orifice' || selectedObj?.objType === 'weir' || selectedObj?.objType === 'outlet' ? 'link'
    : selectedObj?.objType === 'subcatchment' ? 'subcatchment'
    : selectedObj?.objType === 'junction' || selectedObj?.objType === 'outfall' || selectedObj?.objType === 'storage' || selectedObj?.objType === 'divider' ? 'node'
    : 'node'
  );
  const [objectName, setObjectName] = useState(selectedObj?.id || '');
  const [variable, setVariable] = useState('');
  const [eventPeriod, setEventPeriod] = useState<'daily' | 'monthly' | 'event'>('daily');
  const [statistic, setStatistic] = useState('mean');
  const [variableThreshold, setVariableThreshold] = useState('0');
  const [volumeThreshold, setVolumeThreshold] = useState('0');
  const [separationTime, setSeparationTime] = useState('6');
  const [reportData, setReportData] = useState<{ events: { start: string; end: string; duration: number; value: number; volume: number }[]; summary: { count: number; mean: number; stdDev: number; min: number; max: number; skewness: number } } | null>(null);

  const nodeIds = useMemo(() => [
    ...project.junctions.map(j => j.id),
    ...project.outfalls.map(o => o.id),
    ...project.storageUnits.map(s => s.id),
    ...project.dividers.map(d => d.id),
  ], [project]);

  const linkIds = useMemo(() => [
    ...project.conduits.map(c => c.id),
    ...project.pumps.map(p => p.id),
    ...project.orifices.map(o => o.id),
    ...project.weirs.map(w => w.id),
    ...project.outlets.map(o => o.id),
  ], [project]);

  const subcatchIds = useMemo(() => project.subcatchments.map(s => s.id), [project]);

  const objectIds = category === 'node' ? nodeIds : category === 'link' ? linkIds : category === 'subcatchment' ? subcatchIds : ['System'];

  const variableOptions = useMemo(() => {
    if (category === 'subcatchment') return [
      { key: 'rainfall', label: 'Rainfall' },
      { key: 'evap', label: 'Evaporation' },
      { key: 'infiltration', label: 'Infiltration' },
      { key: 'runoff', label: 'Runoff' },
      { key: 'gwOutflow', label: 'GW Outflow' },
    ];
    if (category === 'node') return [
      { key: 'depth', label: 'Depth' },
      { key: 'head', label: 'Head' },
      { key: 'volume', label: 'Volume' },
      { key: 'lateralInflow', label: 'Lateral Inflow' },
      { key: 'totalInflow', label: 'Total Inflow' },
      { key: 'flooding', label: 'Flooding' },
    ];
    if (category === 'link') return [
      { key: 'flow', label: 'Flow' },
      { key: 'depth', label: 'Depth' },
      { key: 'velocity', label: 'Velocity' },
      { key: 'volume', label: 'Volume' },
      { key: 'capacity', label: 'Capacity' },
    ];
    return [
      { key: 'rainfall', label: 'Rainfall' },
      { key: 'runoff', label: 'Total Runoff' },
      { key: 'flooding', label: 'Total Flooding' },
    ];
  }, [category]);

  const statisticOptions = useMemo(() => {
    return [
      { key: 'mean', label: 'Mean Value' },
      { key: 'peak', label: 'Peak Value' },
      { key: 'total', label: 'Event Total' },
      { key: 'duration', label: 'Event Duration' },
      { key: 'interEvent', label: 'Inter-Event Time' },
    ];
  }, []);

  useEffect(() => {
    if (variableOptions.length > 0 && !variableOptions.find(v => v.key === variable)) {
      setVariable(variableOptions[0].key);
    }
  }, [variableOptions, variable]);

  useEffect(() => {
    if (objectIds.length > 0 && !objectIds.includes(objectName)) {
      setObjectName(objectIds[0]);
    }
  }, [objectIds, objectName]);

  const handleCompute = useCallback(() => {
    if (!results || results.timeSteps.length === 0) return;
    const varThresh = parseFloat(variableThreshold) || 0;
    const volThresh = parseFloat(volumeThreshold) || 0;
    const sepHours = parseFloat(separationTime) || 6;

    const values: { time: number; dateTime: string; val: number }[] = [];
    for (const ts of results.timeSteps) {
      let val = 0;
      if (category === 'node') {
        const nr = ts.nodes[objectName];
        if (nr) val = (nr as any)[variable] ?? 0;
      } else if (category === 'link') {
        const lr = ts.links[objectName];
        if (lr) val = (lr as any)[variable] ?? 0;
      } else if (category === 'subcatchment') {
        const sr = ts.subcatchments[objectName];
        if (sr) val = (sr as any)[variable] ?? 0;
      } else {
        let sum = 0; let cnt = 0;
        if (variable === 'rainfall') {
          for (const sr of Object.values(ts.subcatchments)) { sum += sr.rainfall; cnt++; }
        } else if (variable === 'runoff') {
          for (const sr of Object.values(ts.subcatchments)) { sum += sr.runoff; cnt++; }
        } else if (variable === 'flooding') {
          for (const nr of Object.values(ts.nodes)) { sum += nr.flooding; cnt++; }
        }
        val = cnt > 0 ? sum : 0;
      }
      values.push({ time: ts.time, dateTime: ts.dateTime, val });
    }

    if (values.length < 2) {
      setReportData({ events: [], summary: { count: 0, mean: 0, stdDev: 0, min: 0, max: 0, skewness: 0 } });
      return;
    }

    const dtHours = values.length > 1 ? (values[1].time - values[0].time) / 3600 : 1;

    const events: { startIdx: number; endIdx: number; values: number[] }[] = [];

    if (eventPeriod === 'daily' || eventPeriod === 'monthly') {
      let currentKey = '';
      let currentEvent: { startIdx: number; endIdx: number; values: number[] } | null = null;
      for (let i = 0; i < values.length; i++) {
        const d = new Date(values[i].dateTime);
        const key = eventPeriod === 'daily'
          ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
          : `${d.getFullYear()}-${d.getMonth()}`;
        if (key !== currentKey) {
          if (currentEvent) events.push(currentEvent);
          currentEvent = { startIdx: i, endIdx: i, values: [values[i].val] };
          currentKey = key;
        } else if (currentEvent) {
          currentEvent.endIdx = i;
          currentEvent.values.push(values[i].val);
        }
      }
      if (currentEvent) events.push(currentEvent);
    } else {
      let inEvent = false;
      let currentEvent: { startIdx: number; endIdx: number; values: number[] } | null = null;
      let gapSteps = 0;
      const sepSteps = Math.max(1, Math.round(sepHours / dtHours));

      for (let i = 0; i < values.length; i++) {
        const aboveThresh = Math.abs(values[i].val) > varThresh;
        if (aboveThresh) {
          if (!inEvent) {
            if (currentEvent && gapSteps < sepSteps) {
              for (let g = currentEvent.endIdx + 1; g <= i; g++) currentEvent.values.push(values[g].val);
              currentEvent.endIdx = i;
            } else {
              if (currentEvent) events.push(currentEvent);
              currentEvent = { startIdx: i, endIdx: i, values: [values[i].val] };
            }
            inEvent = true;
          } else if (currentEvent) {
            currentEvent.endIdx = i;
            currentEvent.values.push(values[i].val);
          }
          gapSteps = 0;
        } else {
          if (inEvent) {
            inEvent = false;
            gapSteps = 0;
          }
          gapSteps++;
        }
      }
      if (currentEvent) events.push(currentEvent);
    }

    const filteredEvents = events.filter(e => {
      const eventVol = e.values.reduce((s, v) => s + Math.abs(v), 0) * dtHours;
      return eventVol >= volThresh;
    });

    const eventRows = filteredEvents.map(e => {
      const peak = e.values.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0);
      const mean = e.values.reduce((s, v) => s + v, 0) / e.values.length;
      const total = e.values.reduce((s, v) => s + v, 0) * dtHours;
      const duration = (e.endIdx - e.startIdx) * dtHours;
      let statVal = 0;
      if (statistic === 'mean') statVal = mean;
      else if (statistic === 'peak') statVal = peak;
      else if (statistic === 'total') statVal = total;
      else if (statistic === 'duration') statVal = duration;
      else statVal = mean;

      return {
        start: values[e.startIdx].dateTime,
        end: values[e.endIdx].dateTime,
        duration,
        value: statVal,
        volume: total,
      };
    });

    if (statistic === 'interEvent') {
      const interEvents: typeof eventRows = [];
      for (let i = 1; i < filteredEvents.length; i++) {
        const midPrev = (filteredEvents[i - 1].startIdx + filteredEvents[i - 1].endIdx) / 2;
        const midCurr = (filteredEvents[i].startIdx + filteredEvents[i].endIdx) / 2;
        const gap = (midCurr - midPrev) * dtHours;
        interEvents.push({
          start: values[filteredEvents[i - 1].endIdx].dateTime,
          end: values[filteredEvents[i].startIdx].dateTime,
          duration: gap,
          value: gap,
          volume: 0,
        });
      }
      const vals = interEvents.map(e => e.value);
      const n = vals.length;
      const mn = n > 0 ? vals.reduce((s, v) => s + v, 0) / n : 0;
      const variance = n > 1 ? vals.reduce((s, v) => s + (v - mn) ** 2, 0) / (n - 1) : 0;
      const sd = Math.sqrt(variance);
      const skew = n > 2 ? (vals.reduce((s, v) => s + ((v - mn) / (sd || 1)) ** 3, 0) * n) / ((n - 1) * (n - 2)) : 0;
      setReportData({
        events: interEvents,
        summary: { count: n, mean: mn, stdDev: sd, min: n > 0 ? Math.min(...vals) : 0, max: n > 0 ? Math.max(...vals) : 0, skewness: skew },
      });
      return;
    }

    const vals = eventRows.map(e => e.value);
    const n = vals.length;
    const mn = n > 0 ? vals.reduce((s, v) => s + v, 0) / n : 0;
    const variance = n > 1 ? vals.reduce((s, v) => s + (v - mn) ** 2, 0) / (n - 1) : 0;
    const sd = Math.sqrt(variance);
    const skew = n > 2 ? (vals.reduce((s, v) => s + ((v - mn) / (sd || 1)) ** 3, 0) * n) / ((n - 1) * (n - 2)) : 0;

    setReportData({
      events: eventRows,
      summary: { count: n, mean: mn, stdDev: sd, min: n > 0 ? Math.min(...vals) : 0, max: n > 0 ? Math.max(...vals) : 0, skewness: skew },
    });
  }, [results, category, objectName, variable, eventPeriod, statistic, variableThreshold, volumeThreshold, separationTime]);

  return (
    <div className="space-y-4" data-testid="statistics-report-content">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-[#4a4a5a] block mb-1">Object Category</label>
            <select
              className="w-full border border-[#d0d0d8] rounded px-2 py-1.5 text-[12px] bg-white"
              value={category}
              onChange={e => { setCategory(e.target.value as any); setReportData(null); }}
              data-testid="stats-category"
            >
              <option value="subcatchment">Subcatchment</option>
              <option value="node">Node</option>
              <option value="link">Link</option>
              <option value="system">System</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[#4a4a5a] block mb-1">Object Name</label>
            <select
              className="w-full border border-[#d0d0d8] rounded px-2 py-1.5 text-[12px] bg-white"
              value={objectName}
              onChange={e => { setObjectName(e.target.value); setReportData(null); }}
              data-testid="stats-object-name"
              disabled={category === 'system'}
            >
              {objectIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[#4a4a5a] block mb-1">Variable Analyzed</label>
            <select
              className="w-full border border-[#d0d0d8] rounded px-2 py-1.5 text-[12px] bg-white"
              value={variable}
              onChange={e => { setVariable(e.target.value); setReportData(null); }}
              data-testid="stats-variable"
            >
              {variableOptions.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-[#4a4a5a] block mb-1">Event Time Period</label>
            <select
              className="w-full border border-[#d0d0d8] rounded px-2 py-1.5 text-[12px] bg-white"
              value={eventPeriod}
              onChange={e => { setEventPeriod(e.target.value as any); setReportData(null); }}
              data-testid="stats-event-period"
            >
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="event">Event-Dependent</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[#4a4a5a] block mb-1">Statistic</label>
            <select
              className="w-full border border-[#d0d0d8] rounded px-2 py-1.5 text-[12px] bg-white"
              value={statistic}
              onChange={e => { setStatistic(e.target.value); setReportData(null); }}
              data-testid="stats-statistic"
            >
              {statisticOptions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          <div className="border border-[#d0d0d8] rounded p-2.5 space-y-2 bg-[#fafafa]">
            <div className="text-[10px] font-semibold text-[#4a4a5a]">Event Thresholds</div>
            <div>
              <label className="text-[10px] text-[#6b6b7b] block mb-0.5">Analysis Variable</label>
              <input
                type="text"
                className="w-full border border-[#d0d0d8] rounded px-2 py-1 text-[11px]"
                value={variableThreshold}
                onChange={e => setVariableThreshold(e.target.value)}
                data-testid="stats-var-threshold"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#6b6b7b] block mb-0.5">Event Volume</label>
              <input
                type="text"
                className="w-full border border-[#d0d0d8] rounded px-2 py-1 text-[11px]"
                value={volumeThreshold}
                onChange={e => setVolumeThreshold(e.target.value)}
                data-testid="stats-vol-threshold"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#6b6b7b] block mb-0.5">Separation Time (hrs)</label>
              <input
                type="text"
                className="w-full border border-[#d0d0d8] rounded px-2 py-1 text-[11px]"
                value={separationTime}
                onChange={e => setSeparationTime(e.target.value)}
                disabled={eventPeriod !== 'event'}
                data-testid="stats-separation"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleCompute} className="bg-[#2c6eb5] hover:bg-[#245a96] text-white text-[12px] px-4" data-testid="stats-compute-btn">
          Compute
        </Button>
        {reportData && (
          <Button
            variant="outline"
            className="text-[12px] px-4"
            onClick={() => {
              const lines = [
                `Statistics Report`,
                `Category: ${category}  Object: ${objectName}  Variable: ${variable}`,
                `Event Period: ${eventPeriod}  Statistic: ${statistic}`,
                ``,
                `Summary Statistics`,
                `  Count:    ${reportData.summary.count}`,
                `  Mean:     ${reportData.summary.mean.toFixed(4)}`,
                `  Std Dev:  ${reportData.summary.stdDev.toFixed(4)}`,
                `  Min:      ${reportData.summary.min.toFixed(4)}`,
                `  Max:      ${reportData.summary.max.toFixed(4)}`,
                `  Skewness: ${reportData.summary.skewness.toFixed(4)}`,
                ``,
                `Events (${reportData.events.length}):`,
                `Start                 End                   Duration(hr)  Value         Volume`,
                ...reportData.events.map(e =>
                  `${e.start.padEnd(22)}${e.end.padEnd(22)}${e.duration.toFixed(1).padStart(12)}  ${e.value.toFixed(4).padStart(12)}  ${e.volume.toFixed(4).padStart(12)}`
                ),
              ];
              navigator.clipboard.writeText(lines.join('\n'));
            }}
            data-testid="stats-copy-btn"
          >
            Copy Report
          </Button>
        )}
      </div>

      {reportData && (
        <div className="space-y-3" data-testid="stats-results">
          <div className="border border-[#d0d0d8] rounded p-3 bg-[#f8f9fc]">
            <div className="text-[11px] font-bold text-[#2c3e6b] mb-2">Summary Statistics</div>
            <div className="grid grid-cols-3 gap-x-6 gap-y-1">
              {[
                ['Count', reportData.summary.count.toString()],
                ['Mean', reportData.summary.mean.toFixed(4)],
                ['Std Deviation', reportData.summary.stdDev.toFixed(4)],
                ['Minimum', reportData.summary.min.toFixed(4)],
                ['Maximum', reportData.summary.max.toFixed(4)],
                ['Skewness', reportData.summary.skewness.toFixed(4)],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[10px] text-[#6b6b7b]">{label}:</span>
                  <span className="text-[10px] font-mono text-[#2a2a3e]" data-testid={`stats-summary-${label?.toLowerCase().replace(/\s/g, '-')}`}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {reportData.events.length > 0 && (
            <>
              <div className="text-[11px] font-bold text-[#2c3e6b]">
                {statistic === 'interEvent' ? 'Inter-Event Periods' : 'Event Details'} ({reportData.events.length})
              </div>
              <div className="max-h-[250px] overflow-auto border border-[#d0d0d8] rounded">
                <table className="w-full text-[10px]">
                  <thead className="bg-[#f0f0f4] sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1 font-semibold text-[#4a4a5a] border-b border-[#d0d0d8]">#</th>
                      <th className="text-left px-2 py-1 font-semibold text-[#4a4a5a] border-b border-[#d0d0d8]">Start</th>
                      <th className="text-left px-2 py-1 font-semibold text-[#4a4a5a] border-b border-[#d0d0d8]">End</th>
                      <th className="text-right px-2 py-1 font-semibold text-[#4a4a5a] border-b border-[#d0d0d8]">Duration (hr)</th>
                      <th className="text-right px-2 py-1 font-semibold text-[#4a4a5a] border-b border-[#d0d0d8]">
                        {statisticOptions.find(s => s.key === statistic)?.label || 'Value'}
                      </th>
                      <th className="text-right px-2 py-1 font-semibold text-[#4a4a5a] border-b border-[#d0d0d8]">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.events.map((ev, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f8f9fc]'} data-testid={`stats-event-row-${i}`}>
                        <td className="px-2 py-1 text-[#6b6b7b]">{i + 1}</td>
                        <td className="px-2 py-1 font-mono">{ev.start}</td>
                        <td className="px-2 py-1 font-mono">{ev.end}</td>
                        <td className="px-2 py-1 text-right font-mono">{ev.duration.toFixed(1)}</td>
                        <td className="px-2 py-1 text-right font-mono">{ev.value.toFixed(4)}</td>
                        <td className="px-2 py-1 text-right font-mono">{ev.volume.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reportData.events.map((e, i) => ({ idx: i + 1, value: e.value }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                    <XAxis dataKey="idx" tick={{ fontSize: 9 }} label={{ value: 'Event #', position: 'insideBottom', offset: -3, fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 9 }} label={{ value: statisticOptions.find(s => s.key === statistic)?.label || 'Value', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 10 }} />
                    <Bar dataKey="value" fill="#2c6eb5" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {reportData.events.length > 1 && (
            <>
              <div className="text-[11px] font-bold text-[#2c3e6b] mt-2">Exceedance Probability / Flow Duration Curve</div>
              <div className="h-[200px]" data-testid="exceedance-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={(() => {
                      const sorted = [...reportData.events.map(e => e.value)].sort((a, b) => b - a);
                      return sorted.map((v, i) => ({
                        exceedance: ((i + 1) / (sorted.length + 1)) * 100,
                        value: v,
                      }));
                    })()}
                    margin={{ top: 10, right: 20, bottom: 30, left: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                    <XAxis dataKey="exceedance" tick={{ fontSize: 9 }} label={{ value: 'Exceedance Probability (%)', position: 'insideBottom', offset: -15, fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 9 }} label={{ value: statisticOptions.find(s => s.key === statistic)?.label || 'Value', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 10 }} formatter={(v: number) => v.toFixed(4)} labelFormatter={(l: number) => `P(exceed) = ${(+l).toFixed(1)}%`} />
                    <Line type="monotone" dataKey="value" stroke="#2c6eb5" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="text-[11px] font-bold text-[#2c3e6b] mt-2">Cumulative Frequency Distribution</div>
              <div className="h-[200px]" data-testid="frequency-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={(() => {
                      const sorted = [...reportData.events.map(e => e.value)].sort((a, b) => a - b);
                      return sorted.map((v, i) => ({
                        cumFreq: ((i + 1) / sorted.length) * 100,
                        value: v,
                      }));
                    })()}
                    margin={{ top: 10, right: 20, bottom: 30, left: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                    <XAxis dataKey="value" tick={{ fontSize: 9 }} label={{ value: statisticOptions.find(s => s.key === statistic)?.label || 'Value', position: 'insideBottom', offset: -15, fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 9 }} label={{ value: 'Cumulative Frequency (%)', angle: -90, position: 'insideLeft', fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ fontSize: 10 }} formatter={(v: number) => v.toFixed(1) + '%'} />
                    <Line type="monotone" dataKey="cumFreq" stroke="#e88a1a" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="border border-[#d0d0d8] rounded p-2.5 bg-[#f8f9fc]">
                <div className="text-[10px] font-semibold text-[#4a4a5a] mb-1">Return Period Analysis</div>
                <div className="grid grid-cols-4 gap-2 text-[10px]">
                  {[2, 5, 10, 25, 50, 100].map(rp => {
                    const sorted = [...reportData.events.map(e => e.value)].sort((a, b) => b - a);
                    const idx = Math.min(Math.round(sorted.length / rp), sorted.length - 1);
                    return (
                      <div key={rp} className="flex justify-between">
                        <span className="text-[#6b6b7b]">{rp}-yr:</span>
                        <span className="font-mono text-[#2c3e6b]" data-testid={`return-period-${rp}`}>{sorted[idx]?.toFixed(3) || '—'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {reportData.events.length === 0 && (
            <div className="text-center py-8 text-[#8a8a9a] text-[12px]">
              No events found matching the specified criteria.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimeSeriesPlotContent({ project, results, selectedObj, timeStep, calibrationData = [] }: {
  project: SwmmProject;
  results: SimulationResults;
  selectedObj: SelectedObject;
  timeStep: number;
  calibrationData?: CalibrationDataSet[];
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

  type TsCat = 'node' | 'link' | 'subcatch' | 'system';
  const [category, setCategory] = useState<TsCat>(initCategory);
  const [elementIds, setElementIds] = useState<string[]>(selectedObj ? [selectedObj.id] : []);
  const [activeVars, setActiveVars] = useState<string[]>(() => {
    if (initCategory === 'node') return ['depth'];
    if (initCategory === 'link') return ['flow'];
    return ['runoff'];
  });
  const [searchText, setSearchText] = useState('');
  const [showCompare, setShowCompare] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const varGroups = useMemo(() => {
    type VarDef = { key: string; label: string; unit: string };
    type VarGroup = { groupLabel: string; vars: VarDef[] };
    if (category === 'system') {
      return getSystemCategories().map(g => ({
        groupLabel: g.label,
        vars: g.vars.map(v => ({ key: v.key, label: v.name, unit: v.units })),
      })) as VarGroup[];
    }
    const getCats = category === 'node' ? getNodeCategories : category === 'link' ? getLinkCategories : getSubCategories;
    const groups: VarGroup[] = [];
    const catGroups = getCats();
    for (const g of catGroups) {
      const isStd = g.label === 'Standard (EPA)';
      const vars = g.vars.filter(v => !v.isInput).map(v => ({ key: v.key, label: v.name, unit: v.units }));
      if (vars.length > 0) {
        groups.push({ groupLabel: isStd ? 'Standard' : g.label, vars });
      }
    }
    return groups;
  }, [category]);

  const allVarDefs = useMemo(() => varGroups.flatMap(g => g.vars), [varGroups]);

  const allIds = category === 'node' ? nodeIds : category === 'link' ? linkIds : category === 'subcatch' ? subcatchIds : [];

  const filteredIds = useMemo(() => {
    if (category === 'system') return [];
    if (!searchText) return allIds.slice(0, 100);
    const lower = searchText.toLowerCase();
    return allIds.filter(id => id.toLowerCase().includes(lower)).slice(0, 100);
  }, [allIds, searchText, category]);

  const isSystem = category === 'system';

  const obsOverlay = useMemo(() => {
    const empty = { byIdx: new Map<number, Record<string, number>>(), keys: [] as { key: string; label: string }[] };
    if (isSystem || calibrationData.length === 0 || elementIds.length === 0 || activeVars.length === 0) return empty;
    const epochs = results.timeSteps.map(ts => normalizeDateTime(ts.dateTime));
    const byString = new Map<string, number>();
    results.timeSteps.forEach((ts, i) => byString.set(ts.dateTime, i));
    const byIdx = new Map<number, Record<string, number>>();
    const keys: { key: string; label: string }[] = [];
    for (const cds of calibrationData) {
      if (cds.category !== category) continue;
      const matchVar = activeVars.find(av => av.toLowerCase() === cds.variable.toLowerCase());
      if (!matchVar) continue;
      for (const pt of cds.points) {
        if (!elementIds.includes(pt.nodeId)) continue;
        let idx = byString.get(pt.dateTime);
        if (idx === undefined) {
          const t = normalizeCalibDateTime(pt.dateTime, epochs[0]);
          if (isNaN(t)) continue;
          let best = -1;
          let bestDiff = Infinity;
          for (let i = 0; i < epochs.length; i++) {
            if (isNaN(epochs[i])) continue;
            const d = Math.abs(epochs[i] - t);
            if (d < bestDiff) { bestDiff = d; best = i; }
          }
          if (best < 0) continue;
          idx = best;
        }
        const key = `obs_${pt.nodeId}_${matchVar}`;
        if (!keys.some(k => k.key === key)) {
          keys.push({ key, label: `${pt.nodeId} — Observed ${cds.variable}` });
        }
        const row = byIdx.get(idx) || {};
        row[key] = pt.value;
        byIdx.set(idx, row);
      }
    }
    return { byIdx, keys };
  }, [calibrationData, category, activeVars, elementIds, results, isSystem]);

  const chartData = useMemo(() => {
    if (activeVars.length === 0) return [];
    if (!isSystem && elementIds.length === 0) return [];
    return results.timeSteps.map((ts, i) => {
      const row: Record<string, number | string> = { time: ts.dateTime, idx: i };
      if (isSystem) {
        for (const v of activeVars) {
          row[v] = ts.system?.extended?.[v] ?? 0;
        }
      } else {
        for (const elId of elementIds) {
          for (const v of activeVars) {
            const key = elementIds.length > 1 ? `${elId}_${v}` : v;
            if (category === 'node') {
              const nr = ts.nodes[elId];
              row[key] = nr ? ((nr as unknown as Record<string, number>)[v] ?? nr.extended?.[v] ?? 0) : 0;
            } else if (category === 'link') {
              const lr = ts.links[elId];
              row[key] = lr ? ((lr as unknown as Record<string, number>)[v] ?? lr.extended?.[v] ?? 0) : 0;
            } else {
              const sr = ts.subcatchments[elId];
              row[key] = sr ? ((sr as unknown as Record<string, number>)[v] ?? sr.extended?.[v] ?? 0) : 0;
            }
          }
        }
      }
      const obs = obsOverlay.byIdx.get(i);
      if (obs) Object.assign(row, obs);
      return row;
    });
  }, [results, elementIds, activeVars, category, isSystem, obsOverlay]);

  const lineKeys = useMemo(() => {
    const keys: { key: string; label: string; color: string }[] = [];
    let ci = 0;
    if (isSystem) {
      for (const v of activeVars) {
        const varDef = allVarDefs.find(vd => vd.key === v);
        keys.push({ key: v, label: varDef?.label || v, color: TS_COLORS[ci % TS_COLORS.length] });
        ci++;
      }
    } else {
      for (const elId of elementIds) {
        for (const v of activeVars) {
          const varDef = allVarDefs.find(vd => vd.key === v);
          const key = elementIds.length > 1 ? `${elId}_${v}` : v;
          const label = elementIds.length > 1 ? `${elId} — ${varDef?.label || v}` : (varDef?.label || v);
          keys.push({ key, label, color: TS_COLORS[ci % TS_COLORS.length] });
          ci++;
        }
      }
    }
    return keys;
  }, [elementIds, activeVars, allVarDefs, isSystem]);

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

  const handleCategoryChange = (cat: TsCat) => {
    setCategory(cat);
    setElementIds([]);
    setSearchText('');
    setCollapsedGroups(new Set());
    if (cat === 'node') setActiveVars(['depth']);
    else if (cat === 'link') setActiveVars(['flow']);
    else if (cat === 'subcatch') setActiveVars(['runoff']);
    else setActiveVars(['sysRainfall']);
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

  const canChart = isSystem ? activeVars.length > 0 : (elementIds.length > 0 && activeVars.length > 0);
  const chartTitle = isSystem
    ? 'System'
    : (elementIds.length === 1 ? elementIds[0] : `${elementIds.length} elements`);

  return (
    <div className="flex gap-3" style={{ minHeight: 420 }} data-testid="time-series-content">
      <div className="w-48 shrink-0 flex flex-col gap-2 border-r border-[#d0d0d8] pr-3">
        <div className="flex gap-1">
          {(['node', 'link', 'subcatch', 'system'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`flex-1 text-[10px] py-1 rounded font-medium transition-colors ${
                category === cat ? 'bg-[#2c6eb5] text-white' : 'bg-[#e8edf2] text-[#4a4a5a] hover:bg-[#d0d8e4]'
              }`}
              data-testid={`ts-cat-${cat}`}
            >
              {cat === 'node' ? 'Nodes' : cat === 'link' ? 'Links' : cat === 'subcatch' ? 'Subcatch' : 'System'}
            </button>
          ))}
        </div>

        {!isSystem && (
          <>
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

            <div className="flex-1 overflow-y-auto border border-[#d0d0d8] rounded" style={{ maxHeight: 180 }}>
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
          </>
        )}

        <div className="overflow-y-auto" style={{ maxHeight: isSystem ? 360 : 180 }}>
          {varGroups.map(group => (
            <div key={group.groupLabel}>
              <button
                onClick={() => toggleGroup(group.groupLabel)}
                className="w-full flex items-center gap-1 text-[9px] font-semibold text-[#4a4a5a] mt-1 mb-0.5 px-1 hover:bg-[#f0f0f4] rounded cursor-pointer"
                data-testid={`ts-group-${group.groupLabel}`}
              >
                <span className="text-[8px]">{collapsedGroups.has(group.groupLabel) ? '▶' : '▼'}</span>
                {group.groupLabel}
                <span className="text-[8px] text-[#9090a0] ml-auto">{group.vars.length}</span>
              </button>
              {!collapsedGroups.has(group.groupLabel) && group.vars.map(v => (
                <label key={v.key} className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-[#f0f0f4] rounded px-1 py-px" data-testid={`ts-var-${v.key}`}>
                  <input
                    type="checkbox"
                    checked={activeVars.includes(v.key)}
                    onChange={() => toggleVar(v.key)}
                    className="w-3 h-3 accent-[#2c6eb5]"
                  />
                  <span className={`truncate ${activeVars.includes(v.key) ? 'text-[#2a2a3e] font-medium' : 'text-[#6b6b7b]'}`}>{v.label}</span>
                  {v.unit && <span className="text-[8px] text-[#9090a0] ml-auto shrink-0">{v.unit}</span>}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!canChart ? (
          <div className="flex-1 flex items-center justify-center text-[#9090a0] text-sm">
            {isSystem ? 'Select a system variable to view its time series' : `Select a ${category === 'node' ? 'node' : category === 'link' ? 'link' : 'subcatchment'} to view its time series`}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[#9090a0] text-sm">No data available</div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold text-[#2c3e6b]">
                {chartTitle}
                {activeVars.length === 1 && ` — ${allVarDefs.find(v => v.key === activeVars[0])?.label}`}
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
                  {(lineKeys.length > 1 || obsOverlay.keys.length > 0) && <Legend wrapperStyle={{ fontSize: 10 }} />}
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
                  {obsOverlay.keys.map((ok, i) => (
                    <Line
                      key={ok.key}
                      dataKey={ok.key}
                      name={ok.label}
                      stroke="transparent"
                      strokeWidth={0}
                      dot={{ r: 3.5, fill: CALIB_COLORS[i % CALIB_COLORS.length], strokeWidth: 1, stroke: '#fff' }}
                      activeDot={{ r: 4.5, strokeWidth: 0 }}
                      isAnimationActive={false}
                      connectNulls={false}
                      legendType="circle"
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
              {((isSystem && activeVars.length === 1) || (!isSystem && elementIds.length === 1 && activeVars.length === 1)) && peakValues[activeVars[0]] && (
                <>
                  <span>·</span>
                  <span className="font-medium text-[#2c6eb5]">
                    Peak {allVarDefs.find(v => v.key === activeVars[0])?.label}: {peakValues[activeVars[0]].max.toFixed(3)} {allVarDefs.find(v => v.key === activeVars[0])?.unit} at {peakValues[activeVars[0]].time}
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

function CalibrationContent({ project, results, calibrationData, onLoadData, onRemoveData, onUpdateData }: {
  project: SwmmProject;
  results: SimulationResults | null;
  calibrationData: CalibrationDataSet[];
  onLoadData: (ds: CalibrationDataSet) => void;
  onRemoveData?: (index: number) => void;
  onUpdateData?: (index: number, patch: Partial<CalibrationDataSet>) => void;
}) {
  const [activeTab, setActiveTab] = useState<'folder' | 'data' | 'timeseries' | 'correlation' | 'statistics' | 'create'>('correlation');
  const [activeDataset, setActiveDataset] = useState(0);
  const [folderLoadSummary, setFolderLoadSummary] = useState<{ loaded: string[]; skipped: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        const ds = parseCalibrationFile(text, file.name);
        onLoadData(ds);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFolderLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const candidates = files.filter(f => /\.(dat|txt|cal)$/i.test(f.name));
    const skippedNonDat = files.filter(f => !/\.(dat|txt|cal)$/i.test(f.name)).map(f => f.name);
    const loaded: string[] = [];
    const skipped: string[] = [...skippedNonDat];
    let remaining = candidates.length;
    if (remaining === 0) {
      setFolderLoadSummary({ loaded, skipped });
      return;
    }
    for (const file of candidates) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (text) {
          const ds = parseCalibrationFile(text, file.name);
          if (ds.points.length > 0) {
            onLoadData(ds);
            loaded.push(`${file.name} (${ds.variable}, ${ds.points.length} pts)`);
          } else {
            skipped.push(`${file.name} — no data rows`);
          }
        } else {
          skipped.push(`${file.name} — empty`);
        }
        remaining--;
        if (remaining === 0) setFolderLoadSummary({ loaded: [...loaded], skipped: [...skipped] });
      };
      reader.onerror = () => {
        skipped.push(`${file.name} — read error`);
        remaining--;
        if (remaining === 0) setFolderLoadSummary({ loaded: [...loaded], skipped: [...skipped] });
      };
      reader.readAsText(file);
    }
  };

  const ds = calibrationData[activeDataset] || null;

  const nodeIds = useMemo(() => {
    if (!ds) return [];
    return [...new Set(ds.points.map(p => p.nodeId))];
  }, [ds]);

  const nodeColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    nodeIds.forEach((id, i) => { map[id] = CALIB_COLORS[i % CALIB_COLORS.length]; });
    return map;
  }, [nodeIds]);

  const tsIndex = useMemo(() => {
    if (!results) return { byString: new Map<string, number>(), epochs: [] as number[] };
    const byString = new Map<string, number>();
    const epochs: number[] = [];
    for (let i = 0; i < results.timeSteps.length; i++) {
      byString.set(results.timeSteps[i].dateTime, i);
      epochs.push(normalizeDateTime(results.timeSteps[i].dateTime));
    }
    return { byString, epochs };
  }, [results]);

  const correlationData = useMemo(() => {
    if (!ds || !results) return [];
    const points: { observed: number; computed: number; nodeId: string; dateTime: string }[] = [];
    const varKey = ds.variable.toLowerCase();

    const getComputed = (ts: typeof results.timeSteps[0], id: string): number | null => {
      if (ds.category === 'node' && ts.nodes[id]) return (ts.nodes[id] as unknown as Record<string, number>)[varKey] ?? null;
      if (ds.category === 'link' && ts.links[id]) return (ts.links[id] as unknown as Record<string, number>)[varKey] ?? null;
      if (ds.category === 'subcatch' && ts.subcatchments[id]) return (ts.subcatchments[id] as unknown as Record<string, number>)[varKey] ?? null;
      return null;
    };

    for (const pt of ds.points) {
      let computed: number | null = null;

      const exactIdx = tsIndex.byString.get(pt.dateTime);
      if (exactIdx !== undefined) {
        computed = getComputed(results.timeSteps[exactIdx], pt.nodeId);
      }

      if (computed === null) {
        const ptTime = normalizeCalibDateTime(pt.dateTime, tsIndex.epochs[0]);
        if (!isNaN(ptTime) && tsIndex.epochs.length > 0) {
          let closestIdx = 0;
          let closestDiff = Infinity;
          for (let i = 0; i < tsIndex.epochs.length; i++) {
            if (isNaN(tsIndex.epochs[i])) continue;
            const diff = Math.abs(tsIndex.epochs[i] - ptTime);
            if (diff < closestDiff) { closestDiff = diff; closestIdx = i; }
          }
          computed = getComputed(results.timeSteps[closestIdx], pt.nodeId);
        }
      }

      if (computed !== null) {
        points.push({ observed: pt.value, computed, nodeId: pt.nodeId, dateTime: pt.dateTime });
      }
    }
    return points;
  }, [ds, results, tsIndex]);

  const correlationCoeff = useMemo(() => {
    if (correlationData.length < 2) return null;
    const n = correlationData.length;
    const sumX = correlationData.reduce((s, p) => s + p.observed, 0);
    const sumY = correlationData.reduce((s, p) => s + p.computed, 0);
    const sumXY = correlationData.reduce((s, p) => s + p.observed * p.computed, 0);
    const sumX2 = correlationData.reduce((s, p) => s + p.observed ** 2, 0);
    const sumY2 = correlationData.reduce((s, p) => s + p.computed ** 2, 0);
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
    return den === 0 ? null : num / den;
  }, [correlationData]);

  const errorStats = useMemo(() => {
    if (correlationData.length === 0) return null;
    const errors = correlationData.map(p => p.computed - p.observed);
    const absErrors = errors.map(e => Math.abs(e));
    const sqErrors = errors.map(e => e ** 2);
    const mean = errors.reduce((s, e) => s + e, 0) / errors.length;
    const mae = absErrors.reduce((s, e) => s + e, 0) / absErrors.length;
    const rmse = Math.sqrt(sqErrors.reduce((s, e) => s + e, 0) / sqErrors.length);
    const meanObs = correlationData.reduce((s, p) => s + p.observed, 0) / correlationData.length;
    const ssTot = correlationData.reduce((s, p) => s + (p.observed - meanObs) ** 2, 0);
    const ssRes = sqErrors.reduce((s, e) => s + e, 0);
    const nse = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
    const pbias = meanObs === 0 ? 0 : (errors.reduce((s, e) => s + e, 0) / correlationData.reduce((s, p) => s + p.observed, 0)) * 100;

    const perNode: Record<string, { observedMean: number; computedMean: number; mae: number; rmse: number; count: number; bias: number; sumObs: number; sumComp: number }> = {};
    for (const p of correlationData) {
      if (!perNode[p.nodeId]) perNode[p.nodeId] = { observedMean: 0, computedMean: 0, mae: 0, rmse: 0, count: 0, bias: 0, sumObs: 0, sumComp: 0 };
      const err = p.computed - p.observed;
      perNode[p.nodeId].mae += Math.abs(err);
      perNode[p.nodeId].rmse += err ** 2;
      perNode[p.nodeId].bias += err;
      perNode[p.nodeId].sumObs += p.observed;
      perNode[p.nodeId].sumComp += p.computed;
      perNode[p.nodeId].count++;
    }
    for (const id of Object.keys(perNode)) {
      const s = perNode[id];
      s.observedMean = s.sumObs / s.count;
      s.computedMean = s.sumComp / s.count;
      s.mae /= s.count;
      s.rmse = Math.sqrt(s.rmse / s.count);
      s.bias /= s.count;
    }

    return { mean, mae, rmse, nse, pbias, n: correlationData.length, r: correlationCoeff, perNode };
  }, [correlationData, correlationCoeff]);

  const axisRange = useMemo(() => {
    if (correlationData.length === 0) return { min: 0, max: 100 };
    const allVals = [...correlationData.map(p => p.observed), ...correlationData.map(p => p.computed)];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const pad = (max - min) * 0.05 || 1;
    return { min: min - pad, max: max + pad };
  }, [correlationData]);

  const correlationLookup = useMemo(() => {
    const map = new Map<string, { computed: number }>();
    for (const c of correlationData) {
      map.set(`${c.nodeId}|${c.dateTime}`, { computed: c.computed });
    }
    return map;
  }, [correlationData]);

  const scatterDataByNode = useMemo(() => {
    const map: Record<string, { observed: number; computed: number; nodeId: string; dateTime: string }[]> = {};
    for (const pt of correlationData) {
      if (!map[pt.nodeId]) map[pt.nodeId] = [];
      map[pt.nodeId].push(pt);
    }
    return map;
  }, [correlationData]);

  const tsCompareData = useMemo(() => {
    if (!ds || !results) return [];
    return results.timeSteps.map(ts => {
      const row: Record<string, number | string> = { time: ts.dateTime };
      for (const nId of nodeIds) {
        const varKey = ds.variable.toLowerCase();
        if (ds.category === 'node' && ts.nodes[nId]) {
          row[`${nId}_computed`] = (ts.nodes[nId] as unknown as Record<string, number>)[varKey] ?? 0;
        } else if (ds.category === 'link' && ts.links[nId]) {
          row[`${nId}_computed`] = (ts.links[nId] as unknown as Record<string, number>)[varKey] ?? 0;
        } else if (ds.category === 'subcatch' && ts.subcatchments[nId]) {
          row[`${nId}_computed`] = (ts.subcatchments[nId] as unknown as Record<string, number>)[varKey] ?? 0;
        }
      }
      return row;
    });
  }, [ds, results, nodeIds]);

  const tabs = [
    { key: 'folder' as const, label: 'Load Folder' },
    { key: 'create' as const, label: 'Create File' },
    { key: 'data' as const, label: 'Calibration Data' },
    { key: 'timeseries' as const, label: 'Time Series Plot' },
    { key: 'correlation' as const, label: 'Correlation Plot' },
    { key: 'statistics' as const, label: 'Error Statistics' },
  ];

  return (
    <div className="flex flex-col" style={{ minHeight: 480 }} data-testid="calibration-content">
      <input ref={fileInputRef} type="file" accept=".dat,.txt,.csv" className="hidden" onChange={handleFileLoad} />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFolderLoad}
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
      />

      <div className="flex items-center gap-2 mb-3">
        <div className="flex border border-[#d0d0d8] rounded overflow-hidden">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 text-[11px] font-medium transition-colors border-r last:border-r-0 border-[#d0d0d8] ${
                activeTab === t.key ? 'bg-[#2c6eb5] text-white' : 'bg-[#f0f0f4] text-[#4a4a5a] hover:bg-[#e0e0e8]'
              }`}
              data-testid={`calib-tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] border-[#d0d0d8]"
          onClick={() => fileInputRef.current?.click()}
          data-testid="calib-load-file"
        >
          <Upload className="w-3 h-3 mr-1" /> Load Calibration File
        </Button>
        {calibrationData.length > 1 && (
          <select
            className="h-7 text-[11px] border border-[#d0d0d8] rounded px-2 bg-white"
            value={activeDataset}
            onChange={e => setActiveDataset(+e.target.value)}
            data-testid="calib-dataset-select"
          >
            {calibrationData.map((d, i) => (
              <option key={i} value={i}>{d.name ? `${d.name} — ` : ''}{d.variable} ({d.points.length} pts)</option>
            ))}
          </select>
        )}
      </div>

      {activeTab === 'folder' ? (
        <div className="flex flex-col gap-3" data-testid="calib-folder-content">
          <div className="border border-[#d0d0d8] rounded p-4 bg-[#f8f8fa] flex flex-col items-center gap-2">
            <FolderOpen className="w-8 h-8 text-[#2c6eb5]" />
            <div className="text-[12px] font-semibold text-[#2c3e6b]">Load a Folder of Calibration Files</div>
            <div className="text-[10px] text-[#6b6b7b] max-w-md text-center">
              Select a folder containing SWMM5 calibration files (.dat, .txt, .cal). Each file becomes a separate
              dataset. The variable is read from file header comments, or inferred from the filename
              (e.g. <span className="font-mono">flow_gauge.dat</span> → Flow, <span className="font-mono">depth_obs.dat</span> → Depth).
            </div>
            <div className="flex gap-2 mt-1">
              <Button
                size="sm"
                className="bg-[#2c6eb5] hover:bg-[#245a9a] text-white h-7 text-[11px]"
                onClick={() => folderInputRef.current?.click()}
                data-testid="calib-load-folder"
              >
                <FolderOpen className="w-3.5 h-3.5 mr-1.5" /> Select Folder…
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-[#d0d0d8]"
                onClick={() => fileInputRef.current?.click()}
                data-testid="calib-load-single"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" /> Single File…
              </Button>
            </div>
          </div>

          {folderLoadSummary && (
            <div className="border border-[#d0d0d8] rounded p-3 text-[10px]" data-testid="calib-folder-summary">
              <div className="font-semibold text-[#2c3e6b] mb-1">
                Loaded {folderLoadSummary.loaded.length} file{folderLoadSummary.loaded.length === 1 ? '' : 's'}
                {folderLoadSummary.skipped.length > 0 && ` · Skipped ${folderLoadSummary.skipped.length}`}
              </div>
              {folderLoadSummary.loaded.map((f, i) => (
                <div key={`l${i}`} className="text-[#16a34a] font-mono truncate">✓ {f}</div>
              ))}
              {folderLoadSummary.skipped.map((f, i) => (
                <div key={`s${i}`} className="text-[#9090a0] font-mono truncate">— {f}</div>
              ))}
            </div>
          )}

          {calibrationData.length > 0 && (
            <div className="border border-[#d0d0d8] rounded overflow-hidden">
              <div className="bg-[#f0f0f4] px-3 py-1.5 text-[10px] font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">
                Loaded Datasets ({calibrationData.length})
              </div>
              <table className="w-full text-[10px]" data-testid="calib-dataset-table">
                <tbody>
                  {calibrationData.map((d, i) => (
                    <tr key={i} className="border-b border-[#e8e8ee] last:border-b-0 hover:bg-[#f8f8fa]">
                      <td className="px-3 py-1 font-mono truncate max-w-[180px]">{d.name || `Dataset ${i + 1}`}</td>
                      <td className="px-3 py-1">
                        {onUpdateData ? (
                          <input
                            type="text"
                            className="w-24 h-5 text-[10px] border border-[#e0e0e8] rounded px-1"
                            value={d.variable}
                            onChange={e => onUpdateData(i, { variable: e.target.value })}
                            title="Variable name (must match a simulated variable, e.g. Depth, Flow, Runoff)"
                            data-testid={`calib-ds-var-${i}`}
                          />
                        ) : d.variable}
                      </td>
                      <td className="px-3 py-1 text-[#6b6b7b]">
                        {onUpdateData ? (
                          <select
                            className="h-5 text-[10px] border border-[#e0e0e8] rounded bg-white"
                            value={d.category}
                            onChange={e => onUpdateData(i, { category: e.target.value as CalibrationDataSet['category'] })}
                            data-testid={`calib-ds-cat-${i}`}
                          >
                            <option value="node">node</option>
                            <option value="link">link</option>
                            <option value="subcatch">subcatch</option>
                          </select>
                        ) : d.category}
                      </td>
                      <td className="px-3 py-1 text-right font-mono">{d.points.length} pts</td>
                      <td className="px-3 py-1 text-right">
                        <button
                          className="text-[#2c6eb5] hover:underline mr-2"
                          onClick={() => { setActiveDataset(i); setActiveTab('timeseries'); }}
                          data-testid={`calib-ds-view-${i}`}
                        >
                          View
                        </button>
                        {onRemoveData && (
                          <button
                            className="text-[#dc2626] hover:underline"
                            onClick={() => {
                              onRemoveData(i);
                              setActiveDataset(prev =>
                                prev < i ? prev :
                                prev > i ? prev - 1 :
                                Math.max(0, i - 1)
                              );
                            }}
                            data-testid={`calib-ds-remove-${i}`}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === 'create' ? (
        <CalibrationFileCreator project={project} results={results} onLoadData={onLoadData} />
      ) : !ds ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#9090a0] gap-3 py-10">
          <Target className="w-10 h-10 text-[#c0c0cc]" />
          <div className="text-sm">No calibration data loaded</div>
          <div className="text-xs max-w-sm text-center">
            Load a calibration file (SWMM .dat format) or use the Create File tab to build one from scratch.
          </div>
          <div className="text-[10px] text-[#b0b0bc] max-w-sm text-center mt-1 font-mono">
            Format: NodeID  MM/DD/YYYY  HH:MM  Value
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              className="border-[#d0d0d8]"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Browse Files
            </Button>
            <Button
              size="sm"
              className="bg-[#2c6eb5] hover:bg-[#245a9a] text-white"
              onClick={() => setActiveTab('create')}
              data-testid="calib-goto-create"
            >
              <FilePlus className="w-3.5 h-3.5 mr-1.5" /> Create New
            </Button>
          </div>
        </div>
      ) : activeTab === 'data' ? (
        <div className="flex-1 overflow-auto border border-[#d0d0d8] rounded" style={{ maxHeight: 400 }}>
          <table className="w-full text-[11px]" data-testid="calib-data-table">
            <thead className="sticky top-0 bg-[#f0f0f4]">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Location</th>
                <th className="text-left px-3 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Date/Time</th>
                <th className="text-right px-3 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Observed</th>
                <th className="text-right px-3 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Computed</th>
                <th className="text-right px-3 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Error</th>
              </tr>
            </thead>
            <tbody>
              {ds.points.map((pt, i) => {
                const match = correlationLookup.get(`${pt.nodeId}|${pt.dateTime}`);
                return (
                  <tr key={i} className="hover:bg-[#f8f8fa] border-b border-[#e8e8ee]">
                    <td className="px-3 py-1 font-mono">
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: nodeColorMap[pt.nodeId] || '#888' }} />
                      {pt.nodeId}
                    </td>
                    <td className="px-3 py-1 text-[#6b6b7b]">{pt.dateTime}</td>
                    <td className="px-3 py-1 text-right font-mono">{pt.value.toFixed(2)}</td>
                    <td className="px-3 py-1 text-right font-mono">{match ? match.computed.toFixed(2) : '—'}</td>
                    <td className="px-3 py-1 text-right font-mono" style={{ color: match ? (Math.abs(match.computed - pt.value) < 0.1 ? '#16a34a' : '#dc2626') : '#9090a0' }}>
                      {match ? (match.computed - pt.value).toFixed(3) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'correlation' ? (
        <div className="flex-1 flex flex-col">
          <div className="text-center text-xs font-semibold text-[#2c6eb5] mb-1" data-testid="calib-corr-title">
            Correlation Plot for {ds.variable}
          </div>
          {correlationData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[#9090a0] text-sm">
              No matching observed/computed pairs found. Run a simulation first, then ensure timestamps match.
            </div>
          ) : (
            <>
              <div className="flex-1" style={{ minHeight: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 40, left: 55 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                    <XAxis
                      type="number"
                      dataKey="observed"
                      name="Observed"
                      domain={[axisRange.min, axisRange.max]}
                      tick={{ fontSize: 9, fill: '#6b6b7b' }}
                      label={{ value: 'Observed', position: 'insideBottom', offset: -5, style: { fontSize: 11, fill: '#2a2a3e', fontWeight: 600 } }}
                    />
                    <YAxis
                      type="number"
                      dataKey="computed"
                      name="Computed"
                      domain={[axisRange.min, axisRange.max]}
                      tick={{ fontSize: 9, fill: '#6b6b7b' }}
                      label={{ value: 'Computed', angle: -90, position: 'insideLeft', offset: -5, style: { fontSize: 11, fill: '#2a2a3e', fontWeight: 600 } }}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 11, backgroundColor: '#fff', border: '1px solid #d0d0d8', borderRadius: 6 }}
                      formatter={(val: number, name: string) => [val.toFixed(3), name]}
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload;
                        return p ? `${p.nodeId} — ${p.dateTime}` : '';
                      }}
                    />
                    <ReferenceLine
                      segment={[
                        { x: axisRange.min, y: axisRange.min },
                        { x: axisRange.max, y: axisRange.max }
                      ]}
                      stroke="#1a1a2e"
                      strokeWidth={1}
                      strokeDasharray="none"
                    />
                    {nodeIds.map((nId, idx) => (
                      <Scatter
                        key={nId}
                        name={nId}
                        data={scatterDataByNode[nId] || []}
                        fill={nodeColorMap[nId]}
                        shape="cross"
                        legendType="cross"
                      />
                    ))}
                    <Legend
                      wrapperStyle={{ fontSize: 10 }}
                      iconSize={10}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              {correlationCoeff !== null && (
                <div className="text-right text-xs font-medium mt-1 pr-4" style={{ color: '#2c6eb5' }} data-testid="calib-corr-coeff">
                  Correlation Coeff. = {correlationCoeff.toFixed(2)}
                </div>
              )}
            </>
          )}
        </div>
      ) : activeTab === 'timeseries' ? (
        <div className="flex-1 flex flex-col">
          <div className="text-center text-xs font-semibold text-[#2c6eb5] mb-1">
            Time Series Comparison — {ds.variable}
          </div>
          {nodeIds.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[#9090a0] text-sm">No data to display</div>
          ) : (
            <div className="flex-1" style={{ minHeight: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tsCompareData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#6b6b7b' }} interval="preserveStartEnd" minTickGap={50} />
                  <YAxis tick={{ fontSize: 9, fill: '#6b6b7b' }} width={55} />
                  <Tooltip contentStyle={{ fontSize: 11, backgroundColor: '#fff', border: '1px solid #d0d0d8', borderRadius: 6 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {nodeIds.map((nId, idx) => (
                    <Line
                      key={nId}
                      type="monotone"
                      dataKey={`${nId}_computed`}
                      name={`${nId} (computed)`}
                      stroke={nodeColorMap[nId]}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  ))}
                  {nodeIds.map(nId => {
                    const pts = ds.points.filter(p => p.nodeId === nId);
                    return pts.map((pt, pi) => (
                      <ReferenceLine
                        key={`obs-${nId}-${pi}`}
                        x={pt.dateTime}
                        stroke={nodeColorMap[nId]}
                        strokeDasharray="4 2"
                        strokeOpacity={0.4}
                      />
                    ));
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : activeTab === 'statistics' ? (
        <div className="flex-1 overflow-auto">
          {!errorStats ? (
            <div className="flex-1 flex items-center justify-center text-[#9090a0] text-sm py-10">
              No calibration data with matching simulation results
            </div>
          ) : (
            <div className="space-y-4" data-testid="calib-error-stats">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Mean Error', value: errorStats.mean.toFixed(4) },
                  { label: 'MAE', value: errorStats.mae.toFixed(4) },
                  { label: 'RMSE', value: errorStats.rmse.toFixed(4) },
                  { label: 'Correlation (R)', value: errorStats.r?.toFixed(4) ?? '—' },
                  { label: 'NSE', value: errorStats.nse.toFixed(4) },
                  { label: 'Percent Bias', value: `${errorStats.pbias.toFixed(2)}%` },
                  { label: 'Sample Count', value: String(errorStats.n) },
                  { label: 'Locations', value: String(Object.keys(errorStats.perNode).length) },
                ].map(s => (
                  <div key={s.label} className="bg-[#f8f8fa] border border-[#e0e0e8] rounded-lg p-3 text-center">
                    <div className="text-[10px] text-[#6b6b7b] mb-1">{s.label}</div>
                    <div className="text-sm font-mono font-semibold text-[#2a2a3e]">{s.value}</div>
                  </div>
                ))}
              </div>

              <div className="text-xs font-semibold text-[#2c3e6b] mt-2">
                Calibration Report for {ds?.variable || 'Head'}
              </div>
              <div className="overflow-auto border border-[#d0d0d8] rounded" style={{ maxHeight: 300 }}>
                <table className="w-full text-[11px] font-mono" data-testid="calib-per-node-stats">
                  <thead className="sticky top-0 bg-[#f0f0f4]">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]" rowSpan={2}>Location</th>
                      <th className="text-right px-3 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]" rowSpan={2}>Num<br/>Obs</th>
                      <th className="text-right px-3 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Observed</th>
                      <th className="text-right px-3 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Computed</th>
                      <th className="text-right px-3 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Mean</th>
                      <th className="text-right px-3 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">RMS</th>
                    </tr>
                    <tr>
                      <th className="text-right px-3 py-1 font-medium text-[#6b6b7b] border-b border-[#d0d0d8] text-[10px]">Mean</th>
                      <th className="text-right px-3 py-1 font-medium text-[#6b6b7b] border-b border-[#d0d0d8] text-[10px]">Mean</th>
                      <th className="text-right px-3 py-1 font-medium text-[#6b6b7b] border-b border-[#d0d0d8] text-[10px]">Error</th>
                      <th className="text-right px-3 py-1 font-medium text-[#6b6b7b] border-b border-[#d0d0d8] text-[10px]">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#d0d0d8] bg-[#f8f8fa]">
                      <td colSpan={6} className="px-3 py-0.5 text-[9px] text-[#9090a0]">
                        {'—'.repeat(60)}
                      </td>
                    </tr>
                    {Object.entries(errorStats.perNode).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([nId, s]) => (
                      <tr key={nId} className="hover:bg-[#f8f8fa] border-b border-[#e8e8ee]">
                        <td className="px-3 py-1">
                          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: nodeColorMap[nId] || '#888' }} />
                          {nId}
                        </td>
                        <td className="px-3 py-1 text-right">{s.count}</td>
                        <td className="px-3 py-1 text-right">{s.observedMean.toFixed(2)}</td>
                        <td className="px-3 py-1 text-right">{s.computedMean.toFixed(2)}</td>
                        <td className="px-3 py-1 text-right">{s.mae.toFixed(3)}</td>
                        <td className="px-3 py-1 text-right">{s.rmse.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-[10px] text-[#6b6b7b] font-mono" data-testid="calib-report-correlation">
                Correlation: {errorStats.r !== null ? errorStats.r.toFixed(4) : '—'}  |  NSE: {errorStats.nse.toFixed(4)}  |  PBIAS: {errorStats.pbias.toFixed(2)}%
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface CalibrationEntry {
  locationId: string;
  date: string;
  time: string;
  value: string;
  varKey?: string;
}

const CALIB_VARIABLES = [
  { group: 'Node', items: [
    { key: 'node.Depth', label: 'Node Depth', varName: 'Depth', cat: 'node' as const },
    { key: 'node.Head', label: 'Hydraulic Head', varName: 'Head', cat: 'node' as const },
    { key: 'node.Flooding', label: 'Flooding', varName: 'Flooding', cat: 'node' as const },
    { key: 'node.Lateral_Inflow', label: 'Lateral Inflow', varName: 'Lateral_Inflow', cat: 'node' as const },
  ]},
  { group: 'Link', items: [
    { key: 'link.Flow', label: 'Link Flow', varName: 'Flow', cat: 'link' as const },
    { key: 'link.Velocity', label: 'Flow Velocity', varName: 'Velocity', cat: 'link' as const },
    { key: 'link.Depth', label: 'Flow Depth', varName: 'Depth', cat: 'link' as const },
  ]},
  { group: 'Subcatchment', items: [
    { key: 'subcatch.Runoff', label: 'Subcatchment Runoff', varName: 'Runoff', cat: 'subcatch' as const },
    { key: 'subcatch.Rainfall', label: 'Rainfall', varName: 'Rainfall', cat: 'subcatch' as const },
    { key: 'subcatch.GWOutflow', label: 'GW Outflow', varName: 'GWOutflow', cat: 'subcatch' as const },
    { key: 'subcatch.Snow_Depth', label: 'Snow Depth', varName: 'Snow_Depth', cat: 'subcatch' as const },
  ]},
];

const CALIB_VAR_BY_KEY: Map<string, { key: string; label: string; varName: string; cat: 'node' | 'link' | 'subcatch' }> =
  new Map(CALIB_VARIABLES.flatMap(g => g.items.map(i => [i.key, i] as const)));

function CalibrationFileCreator({ project, results, onLoadData }: {
  project: SwmmProject;
  results: SimulationResults | null;
  onLoadData: (ds: CalibrationDataSet) => void;
}) {
  const [variableKey, setVariableKey] = useState('node.Depth');
  const [entries, setEntries] = useState<CalibrationEntry[]>([{ locationId: '', date: '', time: '', value: '' }]);
  const [useSimTimes, setUseSimTimes] = useState(false);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [templateInterval, setTemplateInterval] = useState('60');
  const [allParams, setAllParams] = useState(false);
  const { toast } = useToast();

  const currentVar = useMemo(() => {
    for (const grp of CALIB_VARIABLES) {
      const found = grp.items.find(i => i.key === variableKey);
      if (found) return found;
    }
    return CALIB_VARIABLES[0].items[0];
  }, [variableKey]);

  const variable = currentVar.varName;
  const category = currentVar.cat;

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

  const locationIds = useMemo(() => {
    if (category === 'node') return nodeIds;
    if (category === 'link') return linkIds;
    return subcatchIds;
  }, [category, nodeIds, linkIds, subcatchIds]);

  // In all-parameters mode, locations span every category; values are "cat:id" composites
  const allLocationGroups = useMemo(() => ([
    { label: 'Nodes', cat: 'node' as const, ids: nodeIds },
    { label: 'Links', cat: 'link' as const, ids: linkIds },
    { label: 'Subcatchments', cat: 'subcatch' as const, ids: subcatchIds },
  ]), [nodeIds, linkIds, subcatchIds]);

  const selectableValues = useMemo(() => (
    allParams
      ? allLocationGroups.flatMap(g => g.ids.map(id => `${g.cat}:${id}`))
      : locationIds
  ), [allParams, allLocationGroups, locationIds]);

  const handleVariableChange = (val: string) => {
    setVariableKey(val);
    setSelectedLocations([]);
  };

  const updateEntry = (idx: number, field: keyof CalibrationEntry, val: string) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e));
  };

  const addRow = () => {
    const last = entries[entries.length - 1];
    setEntries(prev => [...prev, { locationId: last?.locationId || '', date: last?.date || '', time: '', value: '' }]);
  };

  const removeRow = (idx: number) => {
    if (entries.length <= 1) return;
    setEntries(prev => prev.filter((_, i) => i !== idx));
  };

  const generateTemplate = () => {
    if (selectedLocations.length === 0) return;
    // Expand each selection into (locationId, varKey) pairs
    const pairs: { locId: string; varKey: string }[] = [];
    if (allParams) {
      for (const sel of selectedLocations) {
        const ci = sel.indexOf(':');
        if (ci < 0) continue;
        const cat = sel.slice(0, ci);
        const locId = sel.slice(ci + 1);
        for (const grp of CALIB_VARIABLES) {
          for (const item of grp.items) {
            if (item.cat === cat) pairs.push({ locId, varKey: item.key });
          }
        }
      }
    } else {
      for (const locId of selectedLocations) pairs.push({ locId, varKey: currentVar.key });
    }
    // Guard against huge templates before committing to state
    {
      const interval = parseInt(templateInterval) || 60;
      const stepsPerPair = useSimTimes && results && results.timeSteps.length > 0
        ? Math.ceil(results.timeSteps.length / Math.max(1, Math.round(interval / 15)))
        : Math.floor((24 * 60) / interval) + 1;
      const projected = pairs.length * stepsPerPair;
      if (projected > 20000) {
        const ok = window.confirm(
          `This template will generate about ${projected.toLocaleString()} rows ` +
          `(${pairs.length.toLocaleString()} location/parameter combinations × ~${stepsPerPair} time steps). ` +
          `Large templates can be slow to edit. Consider a longer interval or fewer locations.\n\nGenerate anyway?`
        );
        if (!ok) return;
      }
    }
    const newEntries: CalibrationEntry[] = [];
    let startDate = '01/01/2024';
    let startHour = 0;
    let endHour = 23;
    const interval = parseInt(templateInterval) || 60;

    if (results && results.timeSteps.length > 0) {
      const firstDt = results.timeSteps[0].dateTime;
      const lastDt = results.timeSteps[results.timeSteps.length - 1].dateTime;
      const fm = firstDt.match(/(\d+\/\d+\/\d+)\s+(\d+)/);
      const lm = lastDt.match(/(\d+\/\d+\/\d+)\s+(\d+)/);
      if (fm) { startDate = fm[1]; startHour = parseInt(fm[2]); }
      if (lm) { endHour = parseInt(lm[2]); }
    }

    if (useSimTimes && results && results.timeSteps.length > 0) {
      const step = Math.max(1, Math.round(interval / 15));
      for (const { locId, varKey } of pairs) {
        for (let i = 0; i < results.timeSteps.length; i += step) {
          const ts = results.timeSteps[i];
          const dtParts = ts.dateTime.split(/\s+/);
          newEntries.push({
            locationId: locId,
            date: dtParts[0] || startDate,
            time: dtParts[1] || '0:00',
            value: '',
            varKey,
          });
        }
      }
    } else {
      const startMins = startHour * 60;
      const endMins = Math.min(endHour, startHour + 24) * 60;
      for (const { locId, varKey } of pairs) {
        for (let mins = startMins; mins <= endMins; mins += interval) {
          const hr = Math.floor(mins / 60);
          const mn = mins % 60;
          newEntries.push({
            locationId: locId,
            date: startDate,
            time: `${hr}:${String(mn).padStart(2, '0')}`,
            value: '',
            varKey,
          });
        }
      }
    }

    setEntries(newEntries.length > 0 ? newEntries : [{ locationId: '', date: '', time: '', value: '' }]);
  };

  const fillFromResults = () => {
    if (!results || results.timeSteps.length === 0) return;
    const epochs = results.timeSteps.map(ts => normalizeDateTime(ts.dateTime));
    setEntries(prev => prev.map(entry => {
      if (!entry.locationId || !entry.date || !entry.time) return entry;
      if (entry.value !== '') return entry;
      const t = normalizeDateTime(`${entry.date} ${entry.time}`);
      if (isNaN(t)) return entry;
      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < epochs.length; i++) {
        if (isNaN(epochs[i])) continue;
        const diff = Math.abs(epochs[i] - t);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
      if (bestIdx < 0) return entry;
      const ts = results.timeSteps[bestIdx];
      const entryVar = (entry.varKey && CALIB_VAR_BY_KEY.get(entry.varKey)) || currentVar;
      const varKey = entryVar.varName.toLowerCase();
      const cat = entryVar.cat;
      let val: number | undefined;
      if (cat === 'node') val = (ts.nodes[entry.locationId] as unknown as Record<string, number> | undefined)?.[varKey];
      else if (cat === 'link') val = (ts.links[entry.locationId] as unknown as Record<string, number> | undefined)?.[varKey];
      else val = (ts.subcatchments[entry.locationId] as unknown as Record<string, number> | undefined)?.[varKey];
      if (val === undefined || val === null || isNaN(val)) return entry;
      return { ...entry, value: val.toFixed(3) };
    }));
  };

  // Build one .dat file per variable (a SWMM calibration file holds a single variable)
  const buildCalibrationFiles = (): { varName: string; cat: string; content: string }[] => {
    const validEntries = entries.filter(e => e.locationId && e.date && e.time && (e.value === '' || !isNaN(parseFloat(e.value))));
    const byVar = new Map<string, CalibrationEntry[]>();
    for (const e of validEntries) {
      const key = e.varKey && CALIB_VAR_BY_KEY.has(e.varKey) ? e.varKey : currentVar.key;
      if (!byVar.has(key)) byVar.set(key, []);
      byVar.get(key)!.push(e);
    }
    const files: { varName: string; cat: string; content: string }[] = [];
    for (const [key, ents] of byVar) {
      const v = CALIB_VAR_BY_KEY.get(key) || currentVar;
      const lines: string[] = [];
      lines.push(`;; SWMM Calibration Data File`);
      lines.push(`;; Generated by SWMM5-UI`);
      lines.push(`;; Variable: ${v.varName}`);
      lines.push(`;; Category: ${v.cat}`);
      lines.push(``);
      const byLocation = new Map<string, CalibrationEntry[]>();
      for (const e of ents) {
        if (!byLocation.has(e.locationId)) byLocation.set(e.locationId, []);
        byLocation.get(e.locationId)!.push(e);
      }
      for (const [locId, pts] of byLocation) {
        lines.push(locId);
        for (const pt of pts) {
          lines.push(`           ${pt.date.padEnd(12)} ${pt.time.padEnd(8)} ${pt.value === '' ? '0' : pt.value}`);
        }
        lines.push(``);
      }
      files.push({ varName: v.varName, cat: v.cat, content: lines.join('\n') });
    }
    return files;
  };

  const downloadOne = (f: { varName: string; cat: string; content: string }) => {
    const blob = new Blob([f.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${f.cat}_${f.varName.toLowerCase()}_calibration.dat`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke later — revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleDownload = () => {
    const files = buildCalibrationFiles();
    if (files.length === 0) {
      toast({
        title: 'Nothing to download yet',
        description: 'No complete rows. Pick locations and click "Generate Template" (or set a Location ID, date, and time on a row), then download.',
        variant: 'destructive',
      });
      return;
    }
    // Stagger multiple downloads; firing them all in the same tick makes
    // browsers silently drop everything after the first file.
    files.forEach((f, i) => setTimeout(() => downloadOne(f), i * 400));
    toast({ title: 'Downloading', description: files.length === 1 ? '1 calibration .dat file' : `${files.length} calibration .dat files (allow multiple downloads if prompted)` });
  };

  const handleLoadIntoAnalysis = () => {
    for (const f of buildCalibrationFiles()) {
      const ds = parseCalibrationFile(f.content, `${f.cat}_${f.varName.toLowerCase()}_calibration.dat`);
      onLoadData(ds);
    }
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      const csvLines = text.split(/\r?\n/).filter(l => l.trim());
      const newEntries: CalibrationEntry[] = [];
      const hasHeader = csvLines[0]?.toLowerCase().includes('location') || csvLines[0]?.toLowerCase().includes('node') || csvLines[0]?.toLowerCase().includes('id');
      const startIdx = hasHeader ? 1 : 0;
      for (let i = startIdx; i < csvLines.length; i++) {
        const parts = csvLines[i].split(/[,\t]+/).map(s => s.trim());
        if (parts.length >= 4) {
          newEntries.push({ locationId: parts[0], date: parts[1], time: parts[2], value: parts[3] });
        } else if (parts.length === 3) {
          const dtParts = parts[1].split(/\s+/);
          if (dtParts.length >= 2) {
            newEntries.push({ locationId: parts[0], date: dtParts[0], time: dtParts[1], value: parts[2] });
          } else {
            newEntries.push({ locationId: parts[0], date: parts[1], time: '0:00', value: parts[2] });
          }
        }
      }
      if (newEntries.length > 0) setEntries(newEntries);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const csvInputRef = useRef<HTMLInputElement>(null);

  const validCount = entries.filter(e => e.locationId && e.date && e.time && e.value !== '' && !isNaN(parseFloat(e.value))).length;
  const downloadableCount = entries.filter(e => e.locationId && e.date && e.time && (e.value === '' || !isNaN(parseFloat(e.value)))).length;

  const hasMixedVars = useMemo(() => {
    const keys = new Set(entries.map(e => e.varKey || currentVar.key));
    return keys.size > 1 || allParams;
  }, [entries, currentVar, allParams]);

  const distinctFileCount = useMemo(() => {
    const keys = new Set(
      entries
        .filter(e => e.locationId && e.date && e.time && (e.value === '' || !isNaN(parseFloat(e.value))))
        .map(e => (e.varKey && CALIB_VAR_BY_KEY.has(e.varKey) ? e.varKey : currentVar.key))
    );
    return keys.size;
  }, [entries, currentVar]);

  const catForEntry = (entry: CalibrationEntry): 'node' | 'link' | 'subcatch' => {
    const v = entry.varKey && CALIB_VAR_BY_KEY.get(entry.varKey);
    return v ? v.cat : category;
  };

  return (
    <div className="flex flex-col gap-3" data-testid="calib-create-content">
      <datalist id="calib-loc-list-node">{nodeIds.map(id => <option key={id} value={id} />)}</datalist>
      <datalist id="calib-loc-list-link">{linkIds.map(id => <option key={id} value={id} />)}</datalist>
      <datalist id="calib-loc-list-subcatch">{subcatchIds.map(id => <option key={id} value={id} />)}</datalist>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-[#2c3e6b] mb-1 block">Variable / Parameter</label>
          <select
            className="w-full h-8 text-[11px] border border-[#d0d0d8] rounded px-2 bg-white disabled:opacity-50"
            value={variableKey}
            onChange={e => handleVariableChange(e.target.value)}
            disabled={allParams}
            data-testid="calib-create-variable"
          >
            {CALIB_VARIABLES.map(grp => (
              <optgroup key={grp.group} label={grp.group}>
                {grp.items.map(item => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-[#2c3e6b] mb-1 block">Category</label>
          <div className="flex items-center gap-3 h-8">
            {(['node', 'link', 'subcatch'] as const).map(c => (
              <button
                key={c}
                type="button"
                disabled={allParams}
                onClick={() => {
                  if (category === c) return;
                  const first = Array.from(CALIB_VAR_BY_KEY.values()).find(i => i.cat === c);
                  if (first) handleVariableChange(first.key);
                }}
                className={`flex items-center gap-1 text-[11px] cursor-pointer disabled:cursor-default bg-transparent border-0 p-0 ${!allParams && category === c ? 'text-[#2c6eb5] font-semibold' : 'text-[#9090a0] hover:text-[#4a4a5a]'}`}
                data-testid={`calib-create-cat-${c}`}
              >
                <span className={`inline-block w-2.5 h-2.5 rounded-full border ${!allParams && category === c ? 'bg-[#2c6eb5] border-[#2c6eb5]' : 'bg-white border-[#c0c0cc]'}`} />
                {c === 'node' ? 'Node' : c === 'link' ? 'Link' : 'Subcatchment'}
              </button>
            ))}
            <label className="flex items-center gap-1 text-[11px] text-[#2c3e6b] font-medium ml-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allParams}
                onChange={e => { setAllParams(e.target.checked); setSelectedLocations([]); }}
                className="w-3 h-3"
                data-testid="calib-create-all-params"
              />
              All parameters (all categories)
            </label>
          </div>
        </div>
      </div>

      <div className="border border-[#d0d0d8] rounded p-3 bg-[#f8f8fa]">
        <div className="text-[11px] font-semibold text-[#2c3e6b] mb-2">Template Generator</div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <div className="flex items-center gap-2 mb-0.5">
              <label className="text-[10px] text-[#6b6b7b]">Select Locations</label>
              <button
                className="text-[9px] text-[#2c6eb5] hover:underline"
                onClick={() => setSelectedLocations(selectableValues)}
                data-testid="calib-create-select-all"
              >
                Select All ({selectableValues.length})
              </button>
              <button
                className="text-[9px] text-[#9090a0] hover:underline"
                onClick={() => setSelectedLocations([])}
                data-testid="calib-create-select-none"
              >
                Clear
              </button>
            </div>
            <select
              multiple
              className="w-full h-20 text-[10px] border border-[#d0d0d8] rounded px-1 bg-white font-mono"
              value={selectedLocations}
              onChange={e => setSelectedLocations(Array.from(e.target.selectedOptions, o => o.value))}
              data-testid="calib-create-locations"
            >
              {allParams
                ? allLocationGroups.filter(g => g.ids.length > 0).map(g => (
                    <optgroup key={g.cat} label={g.label}>
                      {g.ids.map(id => (
                        <option key={`${g.cat}:${id}`} value={`${g.cat}:${id}`}>{id}</option>
                      ))}
                    </optgroup>
                  ))
                : locationIds.map(id => (
                    <option key={id} value={id}>{id}</option>
                  ))}
            </select>
            <div className="text-[9px] text-[#9090a0] mt-0.5">
              {selectedLocations.length > 0 ? `${selectedLocations.length} selected · ` : ''}Hold Ctrl/Cmd to select multiple
            </div>
          </div>
          <div className="w-24">
            <label className="text-[10px] text-[#6b6b7b] mb-0.5 block">Interval (min)</label>
            <select
              className="w-full h-7 text-[10px] border border-[#d0d0d8] rounded px-1 bg-white"
              value={templateInterval}
              onChange={e => setTemplateInterval(e.target.value)}
              data-testid="calib-create-interval"
            >
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="60">1 hour</option>
              <option value="120">2 hours</option>
              <option value="360">6 hours</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            {results && results.timeSteps.length > 0 && (
              <label className="flex items-center gap-1 text-[10px] text-[#4a4a5a]">
                <input
                  type="checkbox"
                  checked={useSimTimes}
                  onChange={e => setUseSimTimes(e.target.checked)}
                  className="w-3 h-3"
                  data-testid="calib-create-use-sim"
                />
                Use simulation time steps
              </label>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] border-[#d0d0d8]"
              onClick={generateTemplate}
              disabled={selectedLocations.length === 0}
              data-testid="calib-create-generate"
            >
              <FilePlus className="w-3 h-3 mr-1" /> Generate Template
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-[11px] font-semibold text-[#2c3e6b]">
          Measurement Data ({entries.length} rows, {validCount} complete)
        </div>
        <div className="flex-1" />
        <input ref={csvInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImportCsv} />
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] border-[#d0d0d8]"
          onClick={() => csvInputRef.current?.click()}
          data-testid="calib-create-import-csv"
        >
          <Upload className="w-3 h-3 mr-1" /> Import CSV
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] border-[#d0d0d8]"
          onClick={addRow}
          data-testid="calib-create-add-row"
        >
          + Add Row
        </Button>
      </div>

      <div className="overflow-auto border border-[#d0d0d8] rounded" style={{ maxHeight: 280 }}>
        <table className="w-full text-[11px]" data-testid="calib-create-table">
          <thead className="sticky top-0 bg-[#f0f0f4]">
            <tr>
              <th className="text-left px-2 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8] w-8">#</th>
              <th className="text-left px-2 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Location ID</th>
              {hasMixedVars && <th className="text-left px-2 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Parameter</th>}
              <th className="text-left px-2 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Date (MM/DD/YYYY)</th>
              <th className="text-left px-2 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Time (HH:MM)</th>
              <th className="text-left px-2 py-1.5 font-semibold text-[#2c3e6b] border-b border-[#d0d0d8]">Value</th>
              <th className="w-8 border-b border-[#d0d0d8]" />
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 300).map((entry, i) => (
              <tr key={i} className="hover:bg-[#f8f8fa] border-b border-[#e8e8ee]">
                <td className="px-2 py-0.5 text-[#9090a0] text-[10px]">{i + 1}</td>
                <td className="px-1 py-0.5">
                  <input
                    type="text"
                    className="w-full h-6 text-[10px] border border-[#e0e0e8] rounded px-1 bg-white font-mono"
                    placeholder="— location —"
                    value={entry.locationId}
                    onChange={e => updateEntry(i, 'locationId', e.target.value)}
                    list={`calib-loc-list-${catForEntry(entry)}`}
                    data-testid={`calib-create-loc-${i}`}
                  />
                </td>
                {hasMixedVars && (
                  <td className="px-2 py-0.5 text-[10px] text-[#4a4a5a] whitespace-nowrap" data-testid={`calib-create-var-${i}`}>
                    {(entry.varKey && CALIB_VAR_BY_KEY.get(entry.varKey)?.label) || currentVar.label}
                  </td>
                )}
                <td className="px-1 py-0.5">
                  <input
                    type="text"
                    className="w-full h-6 text-[10px] border border-[#e0e0e8] rounded px-1 font-mono"
                    placeholder="01/15/2024"
                    value={entry.date}
                    onChange={e => updateEntry(i, 'date', e.target.value)}
                    data-testid={`calib-create-date-${i}`}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <input
                    type="text"
                    className="w-full h-6 text-[10px] border border-[#e0e0e8] rounded px-1 font-mono"
                    placeholder="12:00"
                    value={entry.time}
                    onChange={e => updateEntry(i, 'time', e.target.value)}
                    data-testid={`calib-create-time-${i}`}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <input
                    type="text"
                    className="w-full h-6 text-[10px] border border-[#e0e0e8] rounded px-1 font-mono"
                    placeholder="0.00"
                    value={entry.value}
                    onChange={e => updateEntry(i, 'value', e.target.value)}
                    data-testid={`calib-create-val-${i}`}
                  />
                </td>
                <td className="px-1 py-0.5 text-center">
                  {entries.length > 1 && (
                    <button
                      onClick={() => removeRow(i)}
                      className="text-[#b0b0bc] hover:text-[#dc2626] transition-colors"
                      data-testid={`calib-create-del-${i}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length > 300 && (
          <div className="text-[10px] text-[#6b6b7b] px-2 py-1.5 bg-[#f8f8fa] border-t border-[#e0e0e8]" data-testid="calib-create-row-cap">
            Showing first 300 of {entries.length} rows. All rows are included in Fill Blanks, Load into Analysis, and Download.
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[#e0e0e8] pt-3">
        <div className="text-[10px] text-[#6b6b7b] flex-1">
          {distinctFileCount > 1
            ? `SWMM .dat calibration files — one per parameter (${distinctFileCount} files)`
            : `File format: SWMM .dat calibration file with ${category} ${variable} measurements`}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] border-[#d0d0d8]"
          onClick={fillFromResults}
          disabled={!results || results.timeSteps.length === 0 || entries.every(e => !e.locationId)}
          title={results ? 'Fill only blank values with simulated results at matching times (existing values are kept)' : 'Run a simulation first'}
          data-testid="calib-create-fill"
        >
          <Play className="w-3 h-3 mr-1" /> Fill Blanks from Results
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] border-[#d0d0d8]"
          onClick={handleLoadIntoAnalysis}
          disabled={validCount === 0}
          data-testid="calib-create-load"
        >
          <Target className="w-3 h-3 mr-1" /> Load into Analysis
        </Button>
        <Button
          size="sm"
          className="h-7 text-[11px] bg-[#2c6eb5] hover:bg-[#245a9a] text-white"
          onClick={handleDownload}
          title={downloadableCount === 0 ? 'Add at least one row with a location, date, and time (generate a template or add rows). Blank values are written as 0.' : undefined}
          data-testid="calib-create-download"
        >
          <Download className="w-3 h-3 mr-1" /> Download .dat File
        </Button>
      </div>

      {distinctFileCount > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="calib-create-file-list">
          <span className="text-[10px] text-[#6b6b7b]">Download individually (if your browser blocks multiple downloads):</span>
          {buildCalibrationFiles().map(f => (
            <button
              key={`${f.cat}.${f.varName}`}
              className="text-[9px] font-mono px-1.5 py-0.5 border border-[#d0d0d8] rounded bg-white text-[#2c6eb5] hover:bg-[#f0f4fa]"
              onClick={() => downloadOne(f)}
              data-testid={`calib-create-dl-${f.cat}-${f.varName.toLowerCase()}`}
            >
              {f.cat}_{f.varName.toLowerCase()}.dat
            </button>
          ))}
        </div>
      )}

      <div className="text-[9px] text-[#9090a0] border border-[#e8e8ee] rounded p-2 bg-[#fafafa]">
        <span className="font-semibold">Tip:</span> Select locations from your model, generate a template with time intervals,
        fill in observed measurement values, then download the .dat file or load directly into the analysis tabs.
        You can also import measurements from a CSV file (columns: LocationID, Date, Time, Value).
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
    const data: { station: number; invert: number; crown: number; ground: number; hgl?: number; egl?: number; label: string }[] = [];
    let station = 0;
    const flowUnits = String(project.options?.FLOW_UNITS || 'CFS').toUpperCase();
    const gravity = ['CMS', 'LPS', 'MLD'].includes(flowUnits) ? 9.81 : 32.174;

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
      const geom1 = xs ? (typeof xs.geom1 === 'number' ? xs.geom1 : 1) : 1;
      const conduitLength = conduit.length ?? 100;
      const inOff = conduit.inOffset ?? 0;
      const outOff = conduit.outOffset ?? 0;
      const fromMaxDepth = (fromJunction as any).maxDepth ?? 0;
      const toMaxDepth = (toJunction as any).maxDepth ?? 0;

      const linkRes = results?.timeSteps[timeStep]?.links[conduit.id];
      const velHead = linkRes ? (linkRes.velocity * linkRes.velocity) / (2 * gravity) : 0;

      if (i === 0) {
        const fromHgl = results?.timeSteps[timeStep]?.nodes[conduit.fromNode];
        const hglVal = fromHgl ? fromElev + fromHgl.depth : undefined;
        data.push({
          station,
          invert: fromElev,
          crown: fromElev + inOff + geom1,
          ground: fromElev + fromMaxDepth,
          hgl: hglVal,
          egl: hglVal !== undefined ? hglVal + velHead : undefined,
          label: conduit.fromNode,
        });
      }

      station += conduitLength;
      const toHgl = results?.timeSteps[timeStep]?.nodes[conduit.toNode];
      const toHglVal = toHgl ? toElev + toHgl.depth : undefined;
      data.push({
        station,
        invert: toElev,
        crown: toElev + outOff + geom1,
        ground: toElev + toMaxDepth,
        hgl: toHglVal,
        egl: toHglVal !== undefined ? toHglVal + velHead : undefined,
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
              {results && (
                <Area type="monotone" dataKey="egl" stroke="#c0392b" fill="none" strokeWidth={1.5} strokeDasharray="6 3" name="EGL" />
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

function ScatterPlotContent({ project, results, selectedObj }: {
  project: SwmmProject;
  results: SimulationResults;
  selectedObj: SelectedObject;
}) {
  const [xCat, setXCat] = useState<'node' | 'link' | 'subcatchment'>('node');
  const [yCat, setYCat] = useState<'node' | 'link' | 'subcatchment'>('node');
  const [xObj, setXObj] = useState('');
  const [yObj, setYObj] = useState('');
  const [xVar, setXVar] = useState('depth');
  const [yVar, setYVar] = useState('head');
  const [plotData, setPlotData] = useState<{ x: number; y: number; t: string }[]>([]);

  const nodeIds = useMemo(() => [
    ...project.junctions.map(j => j.id), ...project.outfalls.map(o => o.id),
    ...project.storageUnits.map(s => s.id), ...project.dividers.map(d => d.id),
  ], [project]);
  const linkIds = useMemo(() => [
    ...project.conduits.map(c => c.id), ...project.pumps.map(p => p.id),
    ...project.orifices.map(o => o.id), ...project.weirs.map(w => w.id),
    ...project.outlets.map(o => o.id),
  ], [project]);
  const subIds = useMemo(() => project.subcatchments.map(s => s.id), [project]);

  const getIds = (cat: string) => cat === 'node' ? nodeIds : cat === 'link' ? linkIds : subIds;
  const getVars = (cat: string) => cat === 'node'
    ? [{ key: 'depth', label: 'Depth' }, { key: 'head', label: 'Head' }, { key: 'volume', label: 'Volume' }, { key: 'lateralInflow', label: 'Lateral Inflow' }, { key: 'totalInflow', label: 'Total Inflow' }, { key: 'flooding', label: 'Flooding' }]
    : cat === 'link'
    ? [{ key: 'flow', label: 'Flow' }, { key: 'depth', label: 'Depth' }, { key: 'velocity', label: 'Velocity' }, { key: 'volume', label: 'Volume' }, { key: 'capacity', label: 'Capacity' }]
    : [{ key: 'rainfall', label: 'Rainfall' }, { key: 'runoff', label: 'Runoff' }, { key: 'infiltration', label: 'Infiltration' }];

  useEffect(() => {
    const ids = getIds(xCat);
    if (ids.length > 0 && !ids.includes(xObj)) setXObj(ids[0]);
  }, [xCat, nodeIds, linkIds, subIds]);
  useEffect(() => {
    const ids = getIds(yCat);
    if (ids.length > 0 && !ids.includes(yObj)) setYObj(ids[0]);
  }, [yCat, nodeIds, linkIds, subIds]);

  const handlePlot = useCallback(() => {
    if (!results) return;
    const data: { x: number; y: number; t: string }[] = [];
    for (const ts of results.timeSteps) {
      let xVal = 0, yVal = 0;
      if (xCat === 'node') xVal = (ts.nodes[xObj] as any)?.[xVar] ?? 0;
      else if (xCat === 'link') xVal = (ts.links[xObj] as any)?.[xVar] ?? 0;
      else xVal = (ts.subcatchments[xObj] as any)?.[xVar] ?? 0;
      if (yCat === 'node') yVal = (ts.nodes[yObj] as any)?.[yVar] ?? 0;
      else if (yCat === 'link') yVal = (ts.links[yObj] as any)?.[yVar] ?? 0;
      else yVal = (ts.subcatchments[yObj] as any)?.[yVar] ?? 0;
      data.push({ x: xVal, y: yVal, t: ts.dateTime });
    }
    setPlotData(data);
  }, [results, xCat, xObj, xVar, yCat, yObj, yVar]);

  const xVars = getVars(xCat);
  const yVars = getVars(yCat);
  const xIds = getIds(xCat);
  const yIds = getIds(yCat);

  const corrCoeff = useMemo(() => {
    if (plotData.length < 2) return null;
    const n = plotData.length;
    const sx = plotData.reduce((s, d) => s + d.x, 0);
    const sy = plotData.reduce((s, d) => s + d.y, 0);
    const sxy = plotData.reduce((s, d) => s + d.x * d.y, 0);
    const sx2 = plotData.reduce((s, d) => s + d.x * d.x, 0);
    const sy2 = plotData.reduce((s, d) => s + d.y * d.y, 0);
    const denom = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
    return denom > 0 ? (n * sxy - sx * sy) / denom : 0;
  }, [plotData]);

  return (
    <div className="space-y-3" data-testid="scatter-plot-content">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 border border-[#d0d0d8] rounded p-3 bg-[#fafafa]">
          <div className="text-[11px] font-bold text-[#2c3e6b]">X-Axis</div>
          <select className="w-full border border-[#d0d0d8] rounded px-2 py-1 text-[11px] bg-white" value={xCat} onChange={e => setXCat(e.target.value as any)} data-testid="scatter-x-cat">
            <option value="node">Node</option><option value="link">Link</option><option value="subcatchment">Subcatchment</option>
          </select>
          <select className="w-full border border-[#d0d0d8] rounded px-2 py-1 text-[11px] bg-white" value={xObj} onChange={e => setXObj(e.target.value)} data-testid="scatter-x-obj">
            {xIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
          <select className="w-full border border-[#d0d0d8] rounded px-2 py-1 text-[11px] bg-white" value={xVar} onChange={e => setXVar(e.target.value)} data-testid="scatter-x-var">
            {xVars.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </div>
        <div className="space-y-2 border border-[#d0d0d8] rounded p-3 bg-[#fafafa]">
          <div className="text-[11px] font-bold text-[#2c3e6b]">Y-Axis</div>
          <select className="w-full border border-[#d0d0d8] rounded px-2 py-1 text-[11px] bg-white" value={yCat} onChange={e => setYCat(e.target.value as any)} data-testid="scatter-y-cat">
            <option value="node">Node</option><option value="link">Link</option><option value="subcatchment">Subcatchment</option>
          </select>
          <select className="w-full border border-[#d0d0d8] rounded px-2 py-1 text-[11px] bg-white" value={yObj} onChange={e => setYObj(e.target.value)} data-testid="scatter-y-obj">
            {yIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
          <select className="w-full border border-[#d0d0d8] rounded px-2 py-1 text-[11px] bg-white" value={yVar} onChange={e => setYVar(e.target.value)} data-testid="scatter-y-var">
            {yVars.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <Button onClick={handlePlot} className="bg-[#2c6eb5] hover:bg-[#245a96] text-white text-[12px] px-4" data-testid="scatter-plot-btn">
        Generate Plot
      </Button>
      {plotData.length > 0 && (
        <div className="space-y-2">
          {corrCoeff !== null && (
            <div className="text-[10px] text-[#6b6b7b]">
              Correlation coefficient (r): <span className="font-mono font-bold text-[#2c3e6b]" data-testid="scatter-corr">{corrCoeff.toFixed(4)}</span>
              {' '}| R²: <span className="font-mono font-bold text-[#2c3e6b]">{(corrCoeff * corrCoeff).toFixed(4)}</span>
              {' '}| N: <span className="font-mono">{plotData.length}</span>
            </div>
          )}
          <div className="h-[350px]" data-testid="scatter-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                <XAxis type="number" dataKey="x" name={`${xObj}.${xVar}`} tick={{ fontSize: 9 }} label={{ value: `${xObj} - ${xVars.find(v => v.key === xVar)?.label || xVar}`, position: 'insideBottom', offset: -15, fontSize: 10 }} />
                <YAxis type="number" dataKey="y" name={`${yObj}.${yVar}`} tick={{ fontSize: 9 }} label={{ value: `${yObj} - ${yVars.find(v => v.key === yVar)?.label || yVar}`, angle: -90, position: 'insideLeft', fontSize: 10, offset: -5 }} />
                <Tooltip content={({ payload }) => payload?.[0] ? (
                  <div className="bg-white border border-[#d0d0d8] rounded p-2 shadow text-[10px]">
                    <div className="font-bold text-[#2c3e6b]">{(payload[0].payload as any).t}</div>
                    <div>X: {(payload[0].payload as any).x.toFixed(4)}</div>
                    <div>Y: {(payload[0].payload as any).y.toFixed(4)}</div>
                  </div>
                ) : null} />
                <Scatter data={plotData} fill="#2c6eb5" fillOpacity={0.6} r={2} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

function TransectEditorContent({ project, onUpdateProject }: {
  project: SwmmProject;
  onUpdateProject: (updater: (prev: SwmmProject) => SwmmProject) => void;
}) {
  const existingTransects = useMemo(() => {
    const transects: { name: string; stations: { x: number; y: number }[]; nLeft: number; nRight: number; nChannel: number; leftBank: number; rightBank: number }[] = [];
    if ((project as any).transects) {
      for (const t of (project as any).transects) transects.push(t);
    }
    return transects;
  }, [project]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editName, setEditName] = useState('New_Transect');
  const [stations, setStations] = useState<{ x: number; y: number }[]>([
    { x: 0, y: 5 }, { x: 2, y: 2 }, { x: 4, y: 0 }, { x: 6, y: 0 }, { x: 8, y: 2 }, { x: 10, y: 5 },
  ]);
  const [nLeft, setNLeft] = useState('0.015');
  const [nRight, setNRight] = useState('0.015');
  const [nChannel, setNChannel] = useState('0.013');
  const [leftBank, setLeftBank] = useState('2');
  const [rightBank, setRightBank] = useState('8');

  useEffect(() => {
    if (existingTransects.length > 0 && selectedIdx < existingTransects.length) {
      const t = existingTransects[selectedIdx];
      if (t && t.stations) {
        setEditName(t.name || '');
        setStations(t.stations);
        setNLeft(String(t.nLeft ?? 0.015));
        setNRight(String(t.nRight ?? 0.015));
        setNChannel(String(t.nChannel ?? 0.013));
        setLeftBank(String(t.leftBank ?? 2));
        setRightBank(String(t.rightBank ?? 8));
      }
    }
  }, [selectedIdx, existingTransects]);

  const handleAddStation = () => {
    const lastX = stations.length > 0 ? stations[stations.length - 1].x + 1 : 0;
    setStations([...stations, { x: lastX, y: 0 }]);
  };

  const handleRemoveStation = (idx: number) => {
    setStations(stations.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const transect = {
      name: editName || `Transect_${Date.now()}`,
      stations: [...stations].sort((a, b) => a.x - b.x),
      nLeft: parseFloat(nLeft) || 0.015,
      nRight: parseFloat(nRight) || 0.015,
      nChannel: parseFloat(nChannel) || 0.013,
      leftBank: parseFloat(leftBank) || stations[0]?.x || 0,
      rightBank: parseFloat(rightBank) || stations[stations.length - 1]?.x || 10,
    };
    onUpdateProject(prev => {
      const transects = [...((prev as any).transects || [])];
      const existIdx = transects.findIndex((t: any) => t.name === transect.name);
      if (existIdx >= 0) transects[existIdx] = transect;
      else transects.push(transect);
      return { ...prev, transects } as any;
    });
  };

  const handleNew = () => {
    setEditName(`Transect_${existingTransects.length + 1}`);
    setStations([{ x: 0, y: 5 }, { x: 2, y: 2 }, { x: 4, y: 0 }, { x: 6, y: 0 }, { x: 8, y: 2 }, { x: 10, y: 5 }]);
    setNLeft('0.015'); setNRight('0.015'); setNChannel('0.013');
    setLeftBank('2'); setRightBank('8');
  };

  const sortedStations = [...stations].sort((a, b) => a.x - b.x);
  const minY = Math.min(...stations.map(s => s.y), 0);
  const maxY = Math.max(...stations.map(s => s.y), 1);
  const lb = parseFloat(leftBank) || 0;
  const rb = parseFloat(rightBank) || 10;

  return (
    <div className="space-y-3" data-testid="transect-editor-content">
      <div className="flex gap-2 items-center">
        {existingTransects.length > 0 && (
          <select className="border border-[#d0d0d8] rounded px-2 py-1 text-[11px] bg-white" value={selectedIdx} onChange={e => setSelectedIdx(+e.target.value)} data-testid="transect-select">
            {existingTransects.map((t, i) => <option key={i} value={i}>{t.name}</option>)}
          </select>
        )}
        <Button variant="outline" size="sm" onClick={handleNew} className="text-[11px]" data-testid="transect-new-btn">New Transect</Button>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-4">
        <div className="space-y-2">
          <div>
            <label className="text-[10px] font-semibold text-[#4a4a5a] block mb-0.5">Transect Name</label>
            <input type="text" className="w-full border border-[#d0d0d8] rounded px-2 py-1 text-[11px]" value={editName} onChange={e => setEditName(e.target.value)} data-testid="transect-name" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-[#6b6b7b] block mb-0.5">N Left</label>
              <input type="text" className="w-full border border-[#d0d0d8] rounded px-1.5 py-1 text-[11px] font-mono" value={nLeft} onChange={e => setNLeft(e.target.value)} data-testid="transect-n-left" />
            </div>
            <div>
              <label className="text-[9px] text-[#6b6b7b] block mb-0.5">N Channel</label>
              <input type="text" className="w-full border border-[#d0d0d8] rounded px-1.5 py-1 text-[11px] font-mono" value={nChannel} onChange={e => setNChannel(e.target.value)} data-testid="transect-n-channel" />
            </div>
            <div>
              <label className="text-[9px] text-[#6b6b7b] block mb-0.5">N Right</label>
              <input type="text" className="w-full border border-[#d0d0d8] rounded px-1.5 py-1 text-[11px] font-mono" value={nRight} onChange={e => setNRight(e.target.value)} data-testid="transect-n-right" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-[#6b6b7b] block mb-0.5">Left Bank Station</label>
              <input type="text" className="w-full border border-[#d0d0d8] rounded px-1.5 py-1 text-[11px] font-mono" value={leftBank} onChange={e => setLeftBank(e.target.value)} data-testid="transect-left-bank" />
            </div>
            <div>
              <label className="text-[9px] text-[#6b6b7b] block mb-0.5">Right Bank Station</label>
              <input type="text" className="w-full border border-[#d0d0d8] rounded px-1.5 py-1 text-[11px] font-mono" value={rightBank} onChange={e => setRightBank(e.target.value)} data-testid="transect-right-bank" />
            </div>
          </div>

          <div className="text-[10px] font-semibold text-[#4a4a5a] mt-2">Station-Elevation Data</div>
          <div className="max-h-[200px] overflow-auto border border-[#d0d0d8] rounded">
            <table className="w-full text-[10px]">
              <thead className="bg-[#f0f0f4] sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">#</th>
                  <th className="text-right px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">Station</th>
                  <th className="text-right px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">Elevation</th>
                  <th className="px-1 py-1 border-b border-[#d0d0d8]"></th>
                </tr>
              </thead>
              <tbody>
                {stations.map((s, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f8f9fc]'} data-testid={`transect-station-row-${i}`}>
                    <td className="px-2 py-0.5 text-[#6b6b7b]">{i + 1}</td>
                    <td className="px-1 py-0.5">
                      <input type="number" step="0.1" className="w-full text-right border border-[#d0d0d8] rounded px-1 py-0.5 text-[10px] font-mono" value={s.x}
                        onChange={e => { const n = [...stations]; n[i] = { ...n[i], x: parseFloat(e.target.value) || 0 }; setStations(n); }} />
                    </td>
                    <td className="px-1 py-0.5">
                      <input type="number" step="0.1" className="w-full text-right border border-[#d0d0d8] rounded px-1 py-0.5 text-[10px] font-mono" value={s.y}
                        onChange={e => { const n = [...stations]; n[i] = { ...n[i], y: parseFloat(e.target.value) || 0 }; setStations(n); }} />
                    </td>
                    <td className="px-1 py-0.5 text-center">
                      <button onClick={() => handleRemoveStation(i)} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={handleAddStation} className="text-[10px]" data-testid="transect-add-station">+ Add Station</Button>
        </div>

        <div className="space-y-2">
          <div className="text-[10px] font-semibold text-[#4a4a5a]">Cross-Section Preview</div>
          <div className="h-[300px] border border-[#d0d0d8] rounded bg-[#f8f9fc] relative" data-testid="transect-preview">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sortedStations.map(s => ({ station: s.x, elevation: s.y }))} margin={{ top: 15, right: 15, bottom: 25, left: 15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                <XAxis dataKey="station" tick={{ fontSize: 9 }} label={{ value: 'Station', position: 'insideBottom', offset: -10, fontSize: 10 }} />
                <YAxis tick={{ fontSize: 9 }} domain={[minY - 0.5, maxY + 1]} label={{ value: 'Elevation', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 10 }} />
                <ReferenceLine x={lb} stroke="#e88a1a" strokeDasharray="4 4" label={{ value: 'LB', position: 'top', fontSize: 9, fill: '#e88a1a' }} />
                <ReferenceLine x={rb} stroke="#e88a1a" strokeDasharray="4 4" label={{ value: 'RB', position: 'top', fontSize: 9, fill: '#e88a1a' }} />
                <Area type="linear" dataKey="elevation" stroke="#2a2a3e" fill="#8db4e0" fillOpacity={0.3} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} className="bg-[#2c6eb5] hover:bg-[#245a96] text-white text-[12px] px-4" data-testid="transect-save-btn">
          Save Transect
        </Button>
      </div>
    </div>
  );
}

function SplitScreenContent({ projectA, resultsA, fileNameA, timeStep, projectB, onLoadB, regressionBaseline, onSetBaseline }: {
  projectA: SwmmProject;
  resultsA: SimulationResults | null;
  fileNameA: string;
  timeStep: number;
  projectB: { project: SwmmProject; results: SimulationResults; fileName: string } | null;
  onLoadB: (p: SwmmProject, r: SimulationResults, n: string) => void;
  regressionBaseline: RunSnapshot | null;
  onSetBaseline: (s: RunSnapshot | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [diffMetrics, setDiffMetrics] = useState<{ name: string; varA: number; varB: number; diff: number }[]>([]);
  const [compareTab, setCompareTab] = useState<'topology' | 'regression'>('topology');
  const [tolerances, setTolerances] = useState<ToleranceSet>(getDefaultTolerances);

  const revisedSnapshot = useMemo(() => {
    if (!resultsA || resultsA.timeSteps.length === 0) return null;
    return extractRunSnapshot(projectA, resultsA, fileNameA);
  }, [projectA, resultsA, fileNameA]);

  const regressionRows = useMemo(() => {
    if (!regressionBaseline || !revisedSnapshot) return null;
    return compareSnapshots(regressionBaseline, revisedSnapshot, tolerances);
  }, [regressionBaseline, revisedSnapshot, tolerances]);

  const regressionSummary = useMemo(() => {
    if (!regressionRows) return null;
    const counts = { Pass: 0, Review: 0, Fail: 0, 'N/A': 0 };
    for (const r of regressionRows) counts[r.status]++;
    return counts;
  }, [regressionRows]);

  const handleExportRegressionCsv = () => {
    if (!regressionRows || !regressionBaseline || !revisedSnapshot) return;
    const csv = comparisonToCsv(regressionRows, regressionBaseline, revisedSnapshot, tolerances);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'regression_comparison.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateTolerance = (key: string, field: 'passPct' | 'reviewPct', value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setTolerances(prev => ({ ...prev, [key]: { ...prev[key], [field]: num } }));
  };

  const statusColor = (s: string) => s === 'Pass' ? '#2a8a4a' : s === 'Review' ? '#c08820' : s === 'Fail' ? '#d04040' : '#9090a0';
  const statusBg = (s: string) => s === 'Pass' ? '#eaf6ee' : s === 'Review' ? '#fdf6e8' : s === 'Fail' ? '#fdeaea' : '#f4f4f6';

  const [loadingB, setLoadingB] = useState(false);

  const handleLoadB = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingB(true);
    try {
      const text = await file.text();
      const proj = parseInpFile(text);
      const engine = createMockEngine();
      const res = await engine.run(proj, () => {});
      onLoadB(proj, res, file.name);
    } finally {
      setLoadingB(false);
    }
  };

  useEffect(() => {
    if (!resultsA || !projectB?.results || resultsA.timeSteps.length === 0 || projectB.results.timeSteps.length === 0) {
      setDiffMetrics([]);
      return;
    }
    const tsA = resultsA.timeSteps[Math.min(timeStep, resultsA.timeSteps.length - 1)];
    const tsB = projectB.results.timeSteps[Math.min(timeStep, projectB.results.timeSteps.length - 1)];
    const metrics: typeof diffMetrics = [];
    for (const nodeId of Object.keys(tsA.nodes)) {
      if (tsB.nodes[nodeId]) {
        const a = tsA.nodes[nodeId].depth;
        const b = tsB.nodes[nodeId].depth;
        metrics.push({ name: `Node ${nodeId} Depth`, varA: a, varB: b, diff: a - b });
      }
    }
    for (const linkId of Object.keys(tsA.links)) {
      if (tsB.links[linkId]) {
        const a = tsA.links[linkId].flow;
        const b = tsB.links[linkId].flow;
        metrics.push({ name: `Link ${linkId} Flow`, varA: a, varB: b, diff: a - b });
      }
    }
    setDiffMetrics(metrics.slice(0, 50));
  }, [resultsA, projectB, timeStep]);

  const summaryA = useMemo(() => ({
    nodes: projectA.junctions.length + projectA.outfalls.length + projectA.storageUnits.length + projectA.dividers.length,
    links: projectA.conduits.length + projectA.pumps.length + projectA.orifices.length + projectA.weirs.length + projectA.outlets.length,
    subs: projectA.subcatchments.length,
    steps: resultsA?.timeSteps.length || 0,
  }), [projectA, resultsA]);

  const summaryB = useMemo(() => {
    if (!projectB) return null;
    return {
      nodes: projectB.project.junctions.length + projectB.project.outfalls.length + projectB.project.storageUnits.length + projectB.project.dividers.length,
      links: projectB.project.conduits.length + projectB.project.pumps.length + projectB.project.orifices.length + projectB.project.weirs.length + projectB.project.outlets.length,
      subs: projectB.project.subcatchments.length,
      steps: projectB.results.timeSteps.length,
    };
  }, [projectB]);

  return (
    <div className="space-y-3" data-testid="split-screen-content">
      <div className="flex gap-1 border-b border-[#d0d0d8]">
        <button
          onClick={() => setCompareTab('topology')}
          className={`px-3 py-1.5 text-[11px] font-medium border-b-2 -mb-px ${compareTab === 'topology' ? 'border-[#2c6eb5] text-[#2c6eb5]' : 'border-transparent text-[#6b6b7b] hover:text-[#2a2a3e]'}`}
          data-testid="tab-topology"
        >
          Topology Comparison
        </button>
        <button
          onClick={() => setCompareTab('regression')}
          className={`px-3 py-1.5 text-[11px] font-medium border-b-2 -mb-px ${compareTab === 'regression' ? 'border-[#2c6eb5] text-[#2c6eb5]' : 'border-transparent text-[#6b6b7b] hover:text-[#2a2a3e]'}`}
          data-testid="tab-regression"
        >
          Regression Check
        </button>
      </div>

      {compareTab === 'regression' && (
        <div className="space-y-3" data-testid="regression-content">
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-[#d0d0d8] rounded p-3 bg-[#f0f7ff]">
              <div className="text-[11px] font-bold text-[#2c3e6b] mb-1">Baseline Run</div>
              {regressionBaseline ? (
                <div className="text-[10px] text-[#6b6b7b] space-y-0.5">
                  <div data-testid="text-baseline-info">{regressionBaseline.fileName} — {regressionBaseline.engineUsed} engine, {regressionBaseline.timeSteps} steps</div>
                  <div>Captured: {new Date(regressionBaseline.capturedAt).toLocaleString()}</div>
                  <Button variant="outline" size="sm" onClick={() => onSetBaseline(null)} className="text-[10px] h-6 mt-1" data-testid="btn-clear-baseline">
                    <X className="w-3 h-3 mr-1" /> Clear Baseline
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-[10px] text-[#9090a0]">No baseline captured. Run a simulation, then capture it as the baseline.</div>
                  <Button
                    variant="outline" size="sm"
                    disabled={!revisedSnapshot}
                    onClick={() => revisedSnapshot && onSetBaseline(revisedSnapshot)}
                    className="text-[10px] h-6"
                    data-testid="btn-set-baseline"
                  >
                    <Check className="w-3 h-3 mr-1" /> Capture Current Run as Baseline
                  </Button>
                </div>
              )}
            </div>
            <div className="border border-[#d0d0d8] rounded p-3 bg-[#fff7f0]">
              <div className="text-[11px] font-bold text-[#2c3e6b] mb-1">Revised Run (Current)</div>
              {revisedSnapshot ? (
                <div className="text-[10px] text-[#6b6b7b] space-y-0.5">
                  <div data-testid="text-revised-info">{revisedSnapshot.fileName} — {revisedSnapshot.engineUsed} engine, {revisedSnapshot.timeSteps} steps</div>
                  {regressionBaseline && (
                    <Button
                      variant="outline" size="sm"
                      onClick={() => onSetBaseline(revisedSnapshot)}
                      className="text-[10px] h-6 mt-1"
                      data-testid="btn-promote-baseline"
                    >
                      <ArrowLeftRight className="w-3 h-3 mr-1" /> Promote to Baseline
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-[#9090a0]">No current results. Run a simulation (Project &gt; Run) to compare against the baseline.</div>
              )}
            </div>
          </div>

          {regressionRows && regressionSummary ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ background: '#eaf6ee', color: '#2a8a4a' }} data-testid="count-pass">Pass: {regressionSummary.Pass}</span>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ background: '#fdf6e8', color: '#c08820' }} data-testid="count-review">Review: {regressionSummary.Review}</span>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ background: '#fdeaea', color: '#d04040' }} data-testid="count-fail">Fail: {regressionSummary.Fail}</span>
                <div className="ml-auto">
                  <Button variant="outline" size="sm" onClick={handleExportRegressionCsv} className="text-[10px] h-6" data-testid="btn-export-regression-csv">
                    <Download className="w-3 h-3 mr-1" /> Export CSV
                  </Button>
                </div>
              </div>
              <div className="max-h-[380px] overflow-auto border border-[#d0d0d8] rounded">
                <table className="w-full text-[10px]">
                  <thead className="bg-[#f0f0f4] sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">Metric</th>
                      <th className="text-right px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">Baseline</th>
                      <th className="text-right px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">Revised</th>
                      <th className="text-right px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">Diff</th>
                      <th className="text-right px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">% Change</th>
                      <th className="text-right px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]" title="Pass if |% change| is at or below this">Pass ≤ %</th>
                      <th className="text-right px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]" title="Review if |% change| is at or below this; Fail above">Review ≤ %</th>
                      <th className="text-center px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regressionRows.map((row) => {
                      const higherIsWorse = REGRESSION_METRICS.find(m => m.key === row.key)?.higherIsWorse ?? true;
                      const worsening = row.diff !== null ? (higherIsWorse ? row.diff : -row.diff) : 0;
                      return (
                      <tr key={row.key} className="border-b border-[#f0f0f4] last:border-b-0" data-testid={`row-regression-${row.key}`}>
                        <td className="px-2 py-1">{row.label}</td>
                        <td className="px-2 py-1 text-right font-mono">{row.baseline !== null ? row.baseline.toPrecision(5) : '—'}</td>
                        <td className="px-2 py-1 text-right font-mono">{row.revised !== null ? row.revised.toPrecision(5) : '—'}</td>
                        <td className="px-2 py-1 text-right font-mono" style={{ color: worsening > 0 ? '#d04040' : worsening < 0 ? '#2a8a4a' : '#6b6b7b' }}>
                          {row.diff !== null ? `${row.diff > 0 ? '+' : ''}${row.diff.toPrecision(4)}` : '—'}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">{row.pctChange !== null ? `${row.pctChange > 0 ? '+' : ''}${row.pctChange.toFixed(2)}%` : '—'}</td>
                        <td className="px-1 py-0.5 text-right">
                          <input
                            type="number" min="0" step="1"
                            value={tolerances[row.key]?.passPct ?? 0}
                            onChange={e => updateTolerance(row.key, 'passPct', e.target.value)}
                            className="w-14 text-right text-[10px] border border-[#d0d0d8] rounded px-1 py-0.5 bg-white"
                            data-testid={`input-pass-tol-${row.key}`}
                          />
                        </td>
                        <td className="px-1 py-0.5 text-right">
                          <input
                            type="number" min="0" step="1"
                            value={tolerances[row.key]?.reviewPct ?? 0}
                            onChange={e => updateTolerance(row.key, 'reviewPct', e.target.value)}
                            className="w-14 text-right text-[10px] border border-[#d0d0d8] rounded px-1 py-0.5 bg-white"
                            data-testid={`input-review-tol-${row.key}`}
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ color: statusColor(row.status), background: statusBg(row.status) }} data-testid={`status-${row.key}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-[9px] text-[#9090a0]">
                Status is direction-aware: only changes in the bad direction (e.g. more flooding, less outfall flow) can Fail — Pass ≤ pass tolerance, Review ≤ review tolerance, Fail above. Improvements never Fail but large ones are flagged for Review. Tiny absolute differences always pass. Volumes are approximate (rate × reporting interval).
              </div>
            </>
          ) : (
            <div className="text-[10px] text-[#9090a0] border border-dashed border-[#d0d0d8] rounded p-4 text-center" data-testid="text-regression-empty">
              {regressionBaseline
                ? 'Run a simulation to compare the current results against the baseline.'
                : 'Capture a baseline first, then modify your model, re-run, and reopen this tab to see the pass/fail comparison.'}
            </div>
          )}
        </div>
      )}

      {compareTab === 'topology' && (<>
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-[#d0d0d8] rounded p-3 bg-[#f0f7ff]">
          <div className="text-[11px] font-bold text-[#2c3e6b] mb-2">Scenario A: {fileNameA || 'Current Model'}</div>
          <div className="text-[10px] text-[#6b6b7b] space-y-0.5">
            <div>Nodes: {summaryA.nodes} | Links: {summaryA.links} | Subcatchments: {summaryA.subs}</div>
            <div>Time Steps: {summaryA.steps}</div>
          </div>
        </div>
        <div className="border border-[#d0d0d8] rounded p-3 bg-[#fff7f0]">
          <div className="text-[11px] font-bold text-[#2c3e6b] mb-2">
            Scenario B: {projectB?.fileName || 'Not loaded'}
          </div>
          {projectB && summaryB ? (
            <div className="text-[10px] text-[#6b6b7b] space-y-0.5">
              <div>Nodes: {summaryB.nodes} | Links: {summaryB.links} | Subcatchments: {summaryB.subs}</div>
              <div>Time Steps: {summaryB.steps}</div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[10px] text-[#9090a0]">Load a second INP file to compare</div>
              <input type="file" ref={fileInputRef} accept=".inp" onChange={handleLoadB} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="text-[11px]" disabled={loadingB} data-testid="split-load-b-btn">
                {loadingB ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Loading...</> : <><Upload className="w-3.5 h-3.5 mr-1" /> Load INP</>}
              </Button>
              <div className="text-[9px] text-[#9090a0] mt-1">Scenario B uses mock engine for quick topology comparison</div>
            </div>
          )}
        </div>
      </div>

      {diffMetrics.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-[#2c3e6b]">Comparison at Time Step {timeStep} (showing first 50)</div>
          <div className="max-h-[300px] overflow-auto border border-[#d0d0d8] rounded">
            <table className="w-full text-[10px]">
              <thead className="bg-[#f0f0f4] sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">Element</th>
                  <th className="text-right px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">Scenario A</th>
                  <th className="text-right px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">Scenario B</th>
                  <th className="text-right px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">Difference</th>
                  <th className="text-right px-2 py-1 text-[#4a4a5a] border-b border-[#d0d0d8]">% Change</th>
                </tr>
              </thead>
              <tbody>
                {diffMetrics.map((m, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f8f9fc]'} data-testid={`diff-row-${i}`}>
                    <td className="px-2 py-1">{m.name}</td>
                    <td className="px-2 py-1 text-right font-mono">{m.varA.toFixed(4)}</td>
                    <td className="px-2 py-1 text-right font-mono">{m.varB.toFixed(4)}</td>
                    <td className="px-2 py-1 text-right font-mono" style={{ color: m.diff > 0 ? '#2a8a4a' : m.diff < 0 ? '#d04040' : '#6b6b7b' }}>
                      {m.diff > 0 ? '+' : ''}{m.diff.toFixed(4)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[#6b6b7b]">
                      {m.varB !== 0 ? ((m.diff / Math.abs(m.varB)) * 100).toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="h-[200px]" data-testid="diff-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={diffMetrics.slice(0, 20).map((m, i) => ({ name: m.name.substring(0, 15), diff: m.diff }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e8" />
                <XAxis dataKey="name" tick={{ fontSize: 7 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: 10 }} />
                <ReferenceLine y={0} stroke="#2a2a3e" />
                <Bar dataKey="diff" fill="#2c6eb5" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      </>)}
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
