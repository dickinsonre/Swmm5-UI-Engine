import { useState, useCallback, useRef, useEffect } from 'react';
import type { SwmmProject, SelectedObject, SimulationResults } from '@/lib/swmm-types';
import { createEmptyProject } from '@/lib/swmm-types';
import { parseInpFile, SAMPLE_INP } from '@/lib/inp-parser';
import { createMockEngine } from '@/lib/swmm-engine';
import NetworkMap from '@/components/swmm/NetworkMap';
import { LegendPanel, ProjectExplorer } from '@/components/swmm/Panels';
import { useToast } from '@/hooks/use-toast';
import {
  FolderOpen, Save, FilePlus, Play, Pause, Download, Upload, Settings,
  ZoomIn, ZoomOut, Maximize, Info, HelpCircle, FileText, Clipboard,
  ArrowLeftRight, Trash2, Search, BarChart3, List, Github,
  Loader2, Check, AlertTriangle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

type MenuTab = 'File' | 'Edit' | 'View' | 'Map' | 'Project' | 'Help';

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
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [isAnimating, setIsAnimating] = useState(false);
  const [openDialog, setOpenDialog] = useState<'file' | 'github' | null>(null);
  const [githubUrl, setGithubUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const animRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxTimeStep = results ? results.timeSteps.length - 1 : 0;

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
    setLoading(true);
    try {
      let url = githubUrl.trim();
      if (url.includes('github.com') && !url.includes('raw.githubusercontent.com')) {
        url = url
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/blob/', '/');
      }
      const resp = await fetch(`/api/fetch-github?url=${encodeURIComponent(url)}`);
      if (!resp.ok) throw new Error(`Failed to fetch: ${resp.statusText}`);
      const text = await resp.text();
      const parsed = parseInpFile(text);
      const name = url.split('/').pop() || 'github_file.inp';
      setProject(parsed);
      setFileName(name);
      setResults(null);
      setSimStatus('none');
      setTimeStep(0);
      setSelectedObj(null);
      toast({ title: 'File Loaded', description: `${name} loaded from GitHub` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
    setOpenDialog(null);
    setGithubUrl('');
  }, [githubUrl, toast]);

  const handleNewProject = useCallback(() => {
    setProject(createEmptyProject());
    setFileName('Untitled.inp');
    setResults(null);
    setSimStatus('none');
    setTimeStep(0);
    setSelectedObj(null);
  }, []);

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

  const handleRunSimulation = useCallback(async () => {
    setSimStatus('running');
    setSimProgress(0);
    const engine = createMockEngine();

    const progressInterval = setInterval(() => {
      setSimProgress(prev => Math.min(prev + 3, 95));
    }, 50);

    try {
      const res = await engine.run(project);
      clearInterval(progressInterval);
      setSimProgress(100);
      setResults(res);
      setSimStatus('current');
      setTimeStep(0);
      toast({ title: 'Simulation Complete', description: `${res.timeSteps.length} time steps computed` });
    } catch (e: any) {
      clearInterval(progressInterval);
      setSimStatus('none');
      toast({ title: 'Simulation Error', description: e.message, variant: 'destructive' });
    }
  }, [project, toast]);

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

  const flowUnits = project.options['FLOW_UNITS'] || 'CFS';
  const routingModel = project.options['FLOW_ROUTING'] || 'DYNWAVE';
  const infiltModel = project.options['INFILTRATION'] || 'GREEN_AMPT';

  const currentTime = results?.timeSteps[timeStep]?.dateTime || '';

  return (
    <div
      className="w-full h-screen flex flex-col overflow-hidden select-none"
      style={{ fontFamily: "'Inter', 'Segoe UI', -apple-system, sans-serif", backgroundColor: '#1e1e2e', color: '#e0e0e8' }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      data-testid="swmm-ui-root"
    >
      <input ref={fileInputRef} type="file" accept=".inp,.INP" onChange={handleFileInput} className="hidden" data-testid="file-input" />

      <div className="h-7 flex items-center px-3 text-xs gap-2 shrink-0" style={{ backgroundColor: '#161622' }}>
        <span className="font-bold" style={{ color: '#4ea8de' }}>&#9670;</span>
        <span className="font-semibold text-[#e0e0e8]">SWMM5-UI</span>
        <span className="text-[#8888a0]">{fileName}</span>
        <div className="flex-1" />
        <span className="text-[10px] opacity-50">Stormwater Management Model</span>
      </div>

      <div className="h-8 flex items-stretch shrink-0" style={{ backgroundColor: '#2a2a3e', borderBottom: '1px solid #3a3a52' }}>
        {menus.map(m => (
          <button
            key={m}
            onClick={() => setActiveMenu(m)}
            className="px-4 flex items-center text-xs transition-all duration-150"
            style={{
              backgroundColor: activeMenu === m ? '#3a5a8a' : 'transparent',
              color: activeMenu === m ? '#fff' : '#e0e0e8',
              fontWeight: activeMenu === m ? 700 : 400,
              borderBottom: activeMenu === m ? '2px solid #4ea8de' : '2px solid transparent',
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

      <div className="h-[52px] flex items-center px-2 gap-0.5 shrink-0 overflow-x-auto" style={{ backgroundColor: '#2a2a3e', borderBottom: '1px solid #3a3a52' }}>
        {activeMenu === 'File' && (
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<FilePlus className="w-4 h-4" />} label="New" onClick={handleNewProject} testId="btn-new" />
            <ToolbarButton icon={<FolderOpen className="w-4 h-4" />} label="Open" onClick={() => fileInputRef.current?.click()} testId="btn-open-file" />
            <ToolbarButton icon={<Github className="w-4 h-4" />} label="GitHub" onClick={() => setOpenDialog('github')} testId="btn-github" />
            <ToolbarButton icon={<Save className="w-4 h-4" />} label="Save" onClick={handleSave} testId="btn-save-file" />
            <ToolbarButton icon={<Download className="w-4 h-4" />} label="Export" testId="btn-export" />
            <ToolbarButton icon={<Upload className="w-4 h-4" />} label="Import" testId="btn-import" />
            <ToolbarButton icon={<Settings className="w-4 h-4" />} label="Prefs" testId="btn-prefs" />
          </div>
        )}
        {activeMenu === 'Edit' && (
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<Clipboard className="w-4 h-4" />} label="Copy" testId="btn-copy" />
            <ToolbarButton icon={<Clipboard className="w-4 h-4" />} label="Paste" testId="btn-paste" />
            <ToolbarButton icon={<ArrowLeftRight className="w-4 h-4" />} label="Reverse" testId="btn-reverse" />
            <ToolbarButton icon={<List className="w-4 h-4" />} label="Group Edit" testId="btn-group-edit" />
            <ToolbarButton icon={<Trash2 className="w-4 h-4" />} label="Delete" testId="btn-delete" />
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
                <span className="text-[10px] text-[#8888a0]">Time:</span>
                <input
                  type="range"
                  min={0}
                  max={maxTimeStep}
                  value={timeStep}
                  onChange={e => setTimeStep(+e.target.value)}
                  className="w-28"
                  style={{ accentColor: '#4ea8de' }}
                  data-testid="time-slider"
                />
                <span className="text-[10px] font-mono text-[#4ea8de] min-w-[70px]" data-testid="time-display">
                  {currentTime.split(' ')[1] || `Step ${timeStep}`}
                </span>
                <button
                  onClick={() => setIsAnimating(!isAnimating)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border"
                  style={{ borderColor: '#3a3a52', color: isAnimating ? '#f07070' : '#4ea8de' }}
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
            <ToolbarButton icon={<Search className="w-4 h-4" />} label="Query" testId="btn-query" />
            <ToolbarButton icon={<Download className="w-4 h-4" />} label="Export" testId="btn-map-export" />
          </div>
        )}
        {activeMenu === 'Project' && (
          <div className="flex items-center gap-0.5">
            <ToolbarButton icon={<Settings className="w-4 h-4" />} label="Setup" testId="btn-setup" />
            <ToolbarButton icon={<Search className="w-4 h-4" />} label="Locate" testId="btn-locate" />
            <ToolbarButton icon={<List className="w-4 h-4" />} label="Summary" testId="btn-summary" />
            <ToolbarButton icon={<FileText className="w-4 h-4" />} label="Details" testId="btn-details" />
            <div className="w-px h-8 bg-[#3a3a52] mx-1" />
            <ToolbarButton
              icon={simStatus === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              label="Run"
              accent
              onClick={handleRunSimulation}
              disabled={simStatus === 'running'}
              testId="btn-run"
            />
            <ToolbarButton icon={<BarChart3 className="w-4 h-4" />} label="Report" testId="btn-report" />
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
        <div className="h-2 shrink-0 bg-[#1a1a2a]">
          <Progress value={simProgress} className="h-2 rounded-none" />
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[170px] shrink-0 overflow-hidden" style={{ backgroundColor: '#2a2a3e', borderRight: '1px solid #3a3a52' }}>
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

        <div className="flex-1 relative overflow-hidden">
          <NetworkMap
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
          />

          {!results && Object.keys(project.coordinates).length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-[11px] text-[#8888a0] bg-[#1e1e2e]/80 backdrop-blur-sm border border-[#3a3a52]" data-testid="hint-run">
              Click <strong className="text-[#4ea8de]">Project &gt; Run</strong> to simulate, or drag an .inp file here
            </div>
          )}

          {Object.keys(project.coordinates).length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-[#8888a0]" data-testid="empty-state">
              <div className="w-16 h-16 rounded-2xl bg-[#2a2a3e] border border-[#3a3a52] flex items-center justify-center">
                <FolderOpen className="w-8 h-8 text-[#4ea8de] opacity-60" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[#e0e0e8]">No Network Loaded</p>
                <p className="text-xs mt-1">Open an INP file or load from GitHub</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-[#2a2a3e] border-[#3a3a52] text-[#e0e0e8] hover:bg-[#3a3a52]"
                  data-testid="btn-open-empty"
                >
                  <FolderOpen className="w-3.5 h-3.5 mr-1.5" /> Open File
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpenDialog('github')}
                  className="bg-[#2a2a3e] border-[#3a3a52] text-[#e0e0e8] hover:bg-[#3a3a52]"
                  data-testid="btn-github-empty"
                >
                  <Github className="w-3.5 h-3.5 mr-1.5" /> From GitHub
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="w-[220px] shrink-0 overflow-hidden" style={{ backgroundColor: '#2a2a3e', borderLeft: '1px solid #3a3a52' }}>
          <ProjectExplorer
            project={project}
            selectedObj={selectedObj}
            onSelectObj={setSelectedObj}
            results={results}
            timeStep={timeStep}
          />
        </div>
      </div>

      <div className="h-6 flex items-center px-3 shrink-0" style={{ backgroundColor: '#2a2a3e', borderTop: '1px solid #3a3a52' }}>
        <StatusItem text={`Flow: ${flowUnits}`} />
        <StatusItem text={`Routing: ${routingModel}`} />
        <StatusItem text={`Infiltration: ${infiltModel}`} />
        <StatusItem
          text={simStatus === 'current' ? 'Results are Current' : simStatus === 'running' ? 'Running...' : 'No Results'}
          color={simStatus === 'current' ? '#82e0a8' : simStatus === 'running' ? '#f0c060' : '#8888a0'}
          bold={simStatus === 'current'}
        />
        <div className="flex-1" />
        <span className="text-[9px] font-mono text-[#6666a0]" data-testid="status-counts">
          {project.junctions.length + project.outfalls.length + project.storageUnits.length + project.dividers.length} nodes
          {' | '}
          {project.conduits.length + project.pumps.length + project.weirs.length + project.orifices.length + project.outlets.length} links
          {' | '}
          {project.subcatchments.length} subcatch
        </span>
      </div>

      <Dialog open={openDialog === 'github'} onOpenChange={v => !v && setOpenDialog(null)}>
        <DialogContent className="bg-[#2a2a3e] border-[#3a3a52] text-[#e0e0e8]" data-testid="github-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#e0e0e8]">
              <Github className="w-5 h-5" /> Load from GitHub
            </DialogTitle>
            <DialogDescription className="text-[#8888a0]">
              Enter a GitHub URL to a SWMM5 INP file
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="https://github.com/user/repo/blob/main/model.inp"
              value={githubUrl}
              onChange={e => setGithubUrl(e.target.value)}
              className="bg-[#1e1e2e] border-[#3a3a52] text-[#e0e0e8] placeholder:text-[#6666a0]"
              data-testid="input-github-url"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpenDialog(null)}
                className="bg-[#323248] border-[#3a3a52] text-[#e0e0e8]">
                Cancel
              </Button>
              <Button size="sm" onClick={handleGithubLoad} disabled={loading || !githubUrl.trim()}
                className="bg-[#4ea8de] text-white hover:bg-[#5cb8ee]"
                data-testid="btn-github-load"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
                Load
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
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
        ${accent ? 'bg-[rgba(78,168,222,0.15)] border border-[#4ea8de]' : 'border border-transparent hover:bg-white/[0.05]'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      data-testid={testId}
    >
      <span className={accent ? 'text-[#4ea8de]' : 'text-[#c0c0d0]'}>{icon}</span>
      <span className={`text-[9px] mt-0.5 ${accent ? 'text-[#4ea8de]' : 'text-[#8888a0]'}`}>{label}</span>
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
      className="p-1 text-[#8888a0] hover:text-[#e0e0e8] transition-colors"
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
      <span className="text-[10px] text-[#8888a0] whitespace-nowrap">{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-[10px] rounded px-1.5 py-0.5"
        style={{ backgroundColor: '#323248', color: '#e0e0e8', border: '1px solid #3a3a52' }}
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
        color: color || '#8888a0',
        fontWeight: bold ? 600 : 400,
        borderRight: '1px solid #3a3a52',
      }}
      data-testid={`status-${text.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {text}
    </div>
  );
}
