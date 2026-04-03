import { useState, useCallback } from 'react';
import type { SwmmProject } from '@/lib/swmm-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Settings } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: SwmmProject;
  onUpdateProject: (updater: (prev: SwmmProject) => SwmmProject) => void;
  initialTab?: string;
}

const TABS = ['General', 'Dates', 'Time Steps', 'Dynamic Wave', 'Interface Files'] as const;

type Tab = typeof TABS[number];

function getOpt(opts: Record<string, string>, key: string, def: string = ''): string {
  const k = key.toUpperCase();
  for (const [ok, ov] of Object.entries(opts)) {
    if (ok.toUpperCase() === k) return ov;
  }
  return def;
}

export default function AnalysisOptionsDialog({ open, onOpenChange, project, onUpdateProject, initialTab }: Props) {
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'General');
  const opts = project.options;

  const setOpt = useCallback((key: string, value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      options: { ...prev.options, [key]: value }
    }));
  }, [onUpdateProject]);

  const setReport = useCallback((key: string, value: string) => {
    onUpdateProject(prev => ({
      ...prev,
      reportOptions: { ...prev.reportOptions, [key]: value }
    }));
  }, [onUpdateProject]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-[#d0d0d8] text-[#2a2a3e] max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto" data-testid="analysis-options-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#2a2a3e]">
            <Settings className="w-5 h-5" /> Analysis Options
          </DialogTitle>
          <DialogDescription className="text-[#6b6b7b]">Configure simulation parameters</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-[#d0d0d8] mb-3">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${tab === t ? 'border-[#2c6eb5] text-[#2c6eb5]' : 'border-transparent text-[#6b6b7b] hover:text-[#2a2a3e]'}`}
              data-testid={`tab-${t.replace(/ /g, '-').toLowerCase()}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'General' && <GeneralTab opts={opts} setOpt={setOpt} />}
        {tab === 'Dates' && <DatesTab opts={opts} setOpt={setOpt} />}
        {tab === 'Time Steps' && <TimeStepsTab opts={opts} setOpt={setOpt} />}
        {tab === 'Dynamic Wave' && <DynamicWaveTab opts={opts} setOpt={setOpt} />}
        {tab === 'Interface Files' && <InterfaceFilesTab opts={opts} setOpt={setOpt} report={project.reportOptions} setReport={setReport} />}
      </DialogContent>
    </Dialog>
  );
}

function OptRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label className="text-xs text-[#2a2a3e] shrink-0 w-[180px]">{label}</Label>
      <div className="flex-1 max-w-[240px]">{children}</div>
    </div>
  );
}

function OptInput({ opts, field, setOpt, placeholder }: { opts: Record<string, string>; field: string; setOpt: (k: string, v: string) => void; placeholder?: string }) {
  return (
    <Input
      value={getOpt(opts, field)}
      onChange={e => setOpt(field, e.target.value)}
      className="h-7 text-xs bg-white border-[#d0d0d8] text-[#2a2a3e]"
      placeholder={placeholder}
      data-testid={`opt-${field}`}
    />
  );
}

function OptSelect({ opts, field, setOpt, options }: { opts: Record<string, string>; field: string; setOpt: (k: string, v: string) => void; options: string[] }) {
  return (
    <Select value={getOpt(opts, field, options[0])} onValueChange={v => setOpt(field, v)}>
      <SelectTrigger className="h-7 text-xs bg-white border-[#d0d0d8] text-[#2a2a3e]" data-testid={`opt-${field}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-white border-[#d0d0d8]">
        {options.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function OptSwitch({ opts, field, setOpt }: { opts: Record<string, string>; field: string; setOpt: (k: string, v: string) => void }) {
  const val = getOpt(opts, field, 'NO').toUpperCase();
  return (
    <Switch
      checked={val === 'YES'}
      onCheckedChange={v => setOpt(field, v ? 'YES' : 'NO')}
      data-testid={`opt-${field}`}
    />
  );
}

function GeneralTab({ opts, setOpt }: { opts: Record<string, string>; setOpt: (k: string, v: string) => void }) {
  return (
    <div className="space-y-1" data-testid="tab-content-general">
      <div className="text-xs font-semibold text-[#3a5070] mb-2">Process Models</div>
      <OptRow label="Flow Units">
        <OptSelect opts={opts} field="FLOW_UNITS" setOpt={setOpt} options={['CFS', 'GPM', 'MGD', 'CMS', 'LPS', 'MLD']} />
      </OptRow>
      <OptRow label="Infiltration Method">
        <OptSelect opts={opts} field="INFILTRATION" setOpt={setOpt} options={['HORTON', 'MODIFIED_HORTON', 'GREEN_AMPT', 'MODIFIED_GREEN_AMPT', 'CURVE_NUMBER']} />
      </OptRow>
      <OptRow label="Routing Method">
        <OptSelect opts={opts} field="FLOW_ROUTING" setOpt={setOpt} options={['STEADY', 'KINWAVE', 'DYNWAVE']} />
      </OptRow>
      <OptRow label="Link Offsets">
        <OptSelect opts={opts} field="LINK_OFFSETS" setOpt={setOpt} options={['DEPTH', 'ELEVATION']} />
      </OptRow>
      <OptRow label="Force Main Equation">
        <OptSelect opts={opts} field="FORCE_MAIN_EQUATION" setOpt={setOpt} options={['H-W', 'D-W']} />
      </OptRow>

      <div className="text-xs font-semibold text-[#3a5070] mt-3 mb-2">Process Toggles</div>
      <OptRow label="Allow Ponding"><OptSwitch opts={opts} field="ALLOW_PONDING" setOpt={setOpt} /></OptRow>
      <OptRow label="Skip Steady State"><OptSwitch opts={opts} field="SKIP_STEADY_STATE" setOpt={setOpt} /></OptRow>
      <OptRow label="Ignore Rainfall"><OptSwitch opts={opts} field="IGNORE_RAINFALL" setOpt={setOpt} /></OptRow>
      <OptRow label="Ignore Snowmelt"><OptSwitch opts={opts} field="IGNORE_SNOWMELT" setOpt={setOpt} /></OptRow>
      <OptRow label="Ignore Groundwater"><OptSwitch opts={opts} field="IGNORE_GROUNDWATER" setOpt={setOpt} /></OptRow>
      <OptRow label="Ignore Routing"><OptSwitch opts={opts} field="IGNORE_ROUTING" setOpt={setOpt} /></OptRow>
      <OptRow label="Ignore Quality"><OptSwitch opts={opts} field="IGNORE_QUALITY" setOpt={setOpt} /></OptRow>

      <div className="text-xs font-semibold text-[#3a5070] mt-3 mb-2">Other</div>
      <OptRow label="Min. Conduit Slope"><OptInput opts={opts} field="MIN_SLOPE" setOpt={setOpt} placeholder="0" /></OptRow>
      <OptRow label="Min. Surface Area"><OptInput opts={opts} field="MIN_SURFAREA" setOpt={setOpt} placeholder="12.566" /></OptRow>
      <OptRow label="Surcharge Method">
        <OptSelect opts={opts} field="SURCHARGE_METHOD" setOpt={setOpt} options={['EXTRAN', 'SLOT']} />
      </OptRow>
    </div>
  );
}

function DatesTab({ opts, setOpt }: { opts: Record<string, string>; setOpt: (k: string, v: string) => void }) {
  return (
    <div className="space-y-1" data-testid="tab-content-dates">
      <div className="text-xs font-semibold text-[#3a5070] mb-2">Simulation Period</div>
      <OptRow label="Start Date"><OptInput opts={opts} field="START_DATE" setOpt={setOpt} placeholder="01/01/2020" /></OptRow>
      <OptRow label="Start Time"><OptInput opts={opts} field="START_TIME" setOpt={setOpt} placeholder="00:00:00" /></OptRow>
      <OptRow label="End Date"><OptInput opts={opts} field="END_DATE" setOpt={setOpt} placeholder="01/02/2020" /></OptRow>
      <OptRow label="End Time"><OptInput opts={opts} field="END_TIME" setOpt={setOpt} placeholder="00:00:00" /></OptRow>

      <div className="text-xs font-semibold text-[#3a5070] mt-3 mb-2">Reporting</div>
      <OptRow label="Report Start Date"><OptInput opts={opts} field="REPORT_START_DATE" setOpt={setOpt} placeholder="01/01/2020" /></OptRow>
      <OptRow label="Report Start Time"><OptInput opts={opts} field="REPORT_START_TIME" setOpt={setOpt} placeholder="00:00:00" /></OptRow>

      <div className="text-xs font-semibold text-[#3a5070] mt-3 mb-2">Sweep</div>
      <OptRow label="Sweep Start"><OptInput opts={opts} field="SWEEP_START" setOpt={setOpt} placeholder="01/01" /></OptRow>
      <OptRow label="Sweep End"><OptInput opts={opts} field="SWEEP_END" setOpt={setOpt} placeholder="12/31" /></OptRow>
      <OptRow label="Dry Days"><OptInput opts={opts} field="DRY_DAYS" setOpt={setOpt} placeholder="0" /></OptRow>
    </div>
  );
}

function TimeStepsTab({ opts, setOpt }: { opts: Record<string, string>; setOpt: (k: string, v: string) => void }) {
  return (
    <div className="space-y-1" data-testid="tab-content-timesteps">
      <OptRow label="Reporting Step"><OptInput opts={opts} field="REPORT_STEP" setOpt={setOpt} placeholder="00:15:00" /></OptRow>
      <OptRow label="Wet Weather Step"><OptInput opts={opts} field="WET_STEP" setOpt={setOpt} placeholder="00:05:00" /></OptRow>
      <OptRow label="Dry Weather Step"><OptInput opts={opts} field="DRY_STEP" setOpt={setOpt} placeholder="01:00:00" /></OptRow>
      <OptRow label="Routing Step"><OptInput opts={opts} field="ROUTING_STEP" setOpt={setOpt} placeholder="30" /></OptRow>
      <OptRow label="Lengthening Step"><OptInput opts={opts} field="LENGTHENING_STEP" setOpt={setOpt} placeholder="0" /></OptRow>

      <div className="text-xs font-semibold text-[#3a5070] mt-3 mb-2">Variable Time Step</div>
      <OptRow label="Variable Step"><OptSwitch opts={opts} field="VARIABLE_STEP" setOpt={setOpt} /></OptRow>
      <OptRow label="Min. Routing Step"><OptInput opts={opts} field="MINIMUM_STEP" setOpt={setOpt} placeholder="0.5" /></OptRow>
    </div>
  );
}

function DynamicWaveTab({ opts, setOpt }: { opts: Record<string, string>; setOpt: (k: string, v: string) => void }) {
  return (
    <div className="space-y-1" data-testid="tab-content-dynwave">
      <OptRow label="Inertial Terms">
        <OptSelect opts={opts} field="INERTIAL_DAMPING" setOpt={setOpt} options={['NONE', 'PARTIAL', 'FULL']} />
      </OptRow>
      <OptRow label="Force Main Equation">
        <OptSelect opts={opts} field="FORCE_MAIN_EQUATION" setOpt={setOpt} options={['H-W', 'D-W']} />
      </OptRow>
      <OptRow label="Normal Flow Criteria">
        <OptSelect opts={opts} field="NORMAL_FLOW_LIMITED" setOpt={setOpt} options={['SLOPE', 'FROUDE', 'BOTH']} />
      </OptRow>
      <OptRow label="Surcharge Method">
        <OptSelect opts={opts} field="SURCHARGE_METHOD" setOpt={setOpt} options={['EXTRAN', 'SLOT']} />
      </OptRow>

      <div className="text-xs font-semibold text-[#3a5070] mt-3 mb-2">Convergence</div>
      <OptRow label="Max Trials"><OptInput opts={opts} field="MAX_TRIALS" setOpt={setOpt} placeholder="8" /></OptRow>
      <OptRow label="Head Tolerance"><OptInput opts={opts} field="HEAD_TOLERANCE" setOpt={setOpt} placeholder="0.0015" /></OptRow>
      <OptRow label="Threads"><OptInput opts={opts} field="THREADS" setOpt={setOpt} placeholder="1" /></OptRow>

      <div className="text-xs font-semibold text-[#3a5070] mt-3 mb-2">Other</div>
      <OptRow label="Min. Surface Area"><OptInput opts={opts} field="MIN_SURFAREA" setOpt={setOpt} placeholder="12.566" /></OptRow>
      <OptRow label="Max Node Depth"><OptInput opts={opts} field="MAX_HEAD" setOpt={setOpt} placeholder="" /></OptRow>
      <OptRow label="Sys. Flow Tolerance"><OptInput opts={opts} field="SYS_FLOW_TOL" setOpt={setOpt} placeholder="5" /></OptRow>
      <OptRow label="Lat. Flow Tolerance"><OptInput opts={opts} field="LAT_FLOW_TOL" setOpt={setOpt} placeholder="5" /></OptRow>
    </div>
  );
}

function InterfaceFilesTab({ opts, setOpt, report, setReport }: { opts: Record<string, string>; setOpt: (k: string, v: string) => void; report: Record<string, string>; setReport: (k: string, v: string) => void }) {
  return (
    <div className="space-y-1" data-testid="tab-content-interface">
      <div className="text-xs font-semibold text-[#3a5070] mb-2">Interface Files</div>
      <OptRow label="Rainfall File"><OptInput opts={opts} field="RAINFALL_FILE" setOpt={setOpt} /></OptRow>
      <OptRow label="Runoff File"><OptInput opts={opts} field="RUNOFF_FILE" setOpt={setOpt} /></OptRow>
      <OptRow label="RDII File"><OptInput opts={opts} field="RDII_FILE" setOpt={setOpt} /></OptRow>
      <OptRow label="Hotstart File (Use)"><OptInput opts={opts} field="HOTSTART_FILE_USE" setOpt={setOpt} /></OptRow>
      <OptRow label="Hotstart File (Save)"><OptInput opts={opts} field="HOTSTART_FILE_SAVE" setOpt={setOpt} /></OptRow>
      <OptRow label="Inflows File"><OptInput opts={opts} field="INFLOWS_FILE" setOpt={setOpt} /></OptRow>
      <OptRow label="Outflows File"><OptInput opts={opts} field="OUTFLOWS_FILE" setOpt={setOpt} /></OptRow>

      <div className="text-xs font-semibold text-[#3a5070] mt-3 mb-2">Reporting Options</div>
      <OptRow label="Report Input"><OptSwitch opts={opts} field="INPUT" setOpt={(k, v) => setReport(k, v)} /></OptRow>
      <OptRow label="Report Controls"><OptSwitch opts={opts} field="CONTROLS" setOpt={(k, v) => setReport(k, v)} /></OptRow>
      <OptRow label="Report Subcatchments">
        <OptSelect opts={opts} field="SUBCATCHMENTS" setOpt={(k, v) => setReport(k, v)} options={['ALL', 'NONE']} />
      </OptRow>
      <OptRow label="Report Nodes">
        <OptSelect opts={opts} field="NODES" setOpt={(k, v) => setReport(k, v)} options={['ALL', 'NONE']} />
      </OptRow>
      <OptRow label="Report Links">
        <OptSelect opts={opts} field="LINKS" setOpt={(k, v) => setReport(k, v)} options={['ALL', 'NONE']} />
      </OptRow>
    </div>
  );
}
