import { useState, useMemo } from 'react';
import type { SwmmProject, SimulationResults } from '@/lib/swmm-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: SwmmProject;
  results: SimulationResults | null;
  mode: 'byObject' | 'byVariable';
  onModeChange: (m: 'byObject' | 'byVariable') => void;
  timeStep: number;
}

type ObjCategory = 'node' | 'link' | 'subcatchment';

const NODE_VARS = ['depth', 'head', 'volume', 'lateralInflow', 'totalInflow', 'flooding'] as const;
const NODE_VAR_LABELS: Record<string, string> = { depth: 'Depth', head: 'Head', volume: 'Volume', lateralInflow: 'Lat. Inflow', totalInflow: 'Tot. Inflow', flooding: 'Flooding' };
const LINK_VARS = ['flow', 'depth', 'velocity', 'volume', 'capacity'] as const;
const LINK_VAR_LABELS: Record<string, string> = { flow: 'Flow', depth: 'Depth', velocity: 'Velocity', volume: 'Volume', capacity: 'Capacity' };
const SUBCATCH_VARS = ['rainfall', 'snowDepth', 'evapLoss', 'infilLoss', 'runoff', 'gwOutflow', 'gwElev', 'soilMoisture'] as const;
const SUBCATCH_VAR_LABELS: Record<string, string> = { rainfall: 'Rainfall', snowDepth: 'Snow Depth', evapLoss: 'Evaporation', infilLoss: 'Infiltration', runoff: 'Runoff', gwOutflow: 'GW Flow', gwElev: 'GW Elev', soilMoisture: 'Soil Moisture' };

function getNodeIds(p: SwmmProject): string[] {
  return [
    ...p.junctions.map(j => j.id),
    ...p.outfalls.map(o => o.id),
    ...(p.dividers || []).map(d => d.id),
    ...p.storageUnits.map(s => s.id),
  ];
}
function getLinkIds(p: SwmmProject): string[] {
  return [
    ...p.conduits.map(c => c.id),
    ...p.pumps.map(p => p.id),
    ...p.orifices.map(o => o.id),
    ...p.weirs.map(w => w.id),
    ...p.outlets.map(o => o.id),
  ];
}
function getSubcatchIds(p: SwmmProject): string[] {
  return p.subcatchments.map(s => s.id);
}

function getResultValue(results: SimulationResults, category: ObjCategory, id: string, variable: string, step: number): string {
  if (!results.timeSteps || step >= results.timeSteps.length) return '\u2014';
  const ts = results.timeSteps[step];
  if (!ts) return '\u2014';
  let obj: Record<string, number> | undefined;
  if (category === 'node') {
    obj = ts.nodes?.[id];
  } else if (category === 'link') {
    obj = ts.links?.[id];
  } else {
    obj = ts.subcatchments?.[id];
  }
  if (!obj) return '\u2014';
  const val = (obj as any)[variable];
  if (val === undefined || val === null) return '\u2014';
  return Number(val).toFixed(3);
}

export default function TableViewDialog({ open, onOpenChange, project, results, mode, onModeChange, timeStep }: Props) {
  const [category, setCategory] = useState<ObjCategory>('node');
  const [selectedObj, setSelectedObj] = useState('');
  const [selectedVar, setSelectedVar] = useState('');

  const ids = useMemo(() => {
    if (category === 'node') return getNodeIds(project);
    if (category === 'link') return getLinkIds(project);
    return getSubcatchIds(project);
  }, [project, category]);

  const vars = category === 'node' ? NODE_VARS : category === 'link' ? LINK_VARS : SUBCATCH_VARS;
  const varLabels = category === 'node' ? NODE_VAR_LABELS : category === 'link' ? LINK_VAR_LABELS : SUBCATCH_VAR_LABELS;
  const timestamps = useMemo(() => {
    if (!results?.timeSteps) return [];
    return results.timeSteps.map(ts => ts.dateTime || `t=${ts.time}`);
  }, [results]);

  if (!results) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md bg-white border-[#d0d0d8]" data-testid="table-view-dialog">
          <DialogHeader>
            <DialogTitle className="text-[#2c3e6b] flex items-center gap-2"><Table2 className="w-4 h-4" /> Table View</DialogTitle>
            <DialogDescription>Run a simulation first to view tabular results.</DialogDescription>
          </DialogHeader>
          <div className="py-8 text-center text-sm text-[#6b6b7b]">No simulation results available. Run a simulation first.</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] bg-white border-[#d0d0d8] max-h-[90vh] overflow-hidden flex flex-col" data-testid="table-view-dialog">
        <DialogHeader>
          <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
            <Table2 className="w-4 h-4" /> Table — {mode === 'byObject' ? 'By Object' : 'By Variable'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'byObject' ? 'View all timesteps for a single object.' : 'View all objects for a single variable at the current timestep.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            <Button variant={mode === 'byObject' ? 'default' : 'outline'} size="sm" className="text-[11px] h-7" onClick={() => onModeChange('byObject')} style={mode === 'byObject' ? { backgroundColor: '#2c6eb5' } : {}} data-testid="btn-table-by-object">By Object</Button>
            <Button variant={mode === 'byVariable' ? 'default' : 'outline'} size="sm" className="text-[11px] h-7" onClick={() => onModeChange('byVariable')} style={mode === 'byVariable' ? { backgroundColor: '#2c6eb5' } : {}} data-testid="btn-table-by-variable">By Variable</Button>
          </div>
          <Select value={category} onValueChange={v => { setCategory(v as ObjCategory); setSelectedObj(''); setSelectedVar(''); }}>
            <SelectTrigger className="h-7 text-[11px] w-32" data-testid="select-table-category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="node">Nodes</SelectItem>
              <SelectItem value="link">Links</SelectItem>
              <SelectItem value="subcatchment">Subcatchments</SelectItem>
            </SelectContent>
          </Select>
          {mode === 'byObject' && (
            <Select value={selectedObj} onValueChange={setSelectedObj}>
              <SelectTrigger className="h-7 text-[11px] w-36" data-testid="select-table-object"><SelectValue placeholder="Select object..." /></SelectTrigger>
              <SelectContent>
                {ids.map(id => <SelectItem key={id} value={id}>{id}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {mode === 'byVariable' && (
            <Select value={selectedVar} onValueChange={setSelectedVar}>
              <SelectTrigger className="h-7 text-[11px] w-36" data-testid="select-table-variable"><SelectValue placeholder="Select variable..." /></SelectTrigger>
              <SelectContent>
                {vars.map(v => <SelectItem key={v} value={v}>{varLabels[v] || v}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <ScrollArea className="flex-1 min-h-0 border border-[#e0e0e8] rounded">
          {mode === 'byObject' && selectedObj ? (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#f0f0f4]">
                <tr>
                  <th className="text-left px-2 py-1.5 border-b border-[#d0d0d8] font-semibold text-[#2c3e6b]">Time</th>
                  {vars.map(v => <th key={v} className="text-right px-2 py-1.5 border-b border-[#d0d0d8] font-semibold text-[#2c3e6b]">{varLabels[v] || v}</th>)}
                </tr>
              </thead>
              <tbody>
                {timestamps.map((ts, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fafafe]'} style={i === timeStep ? { backgroundColor: '#e8f0ff' } : {}}>
                    <td className="px-2 py-1 border-b border-[#f0f0f4] font-mono">{ts}</td>
                    {vars.map(v => <td key={v} className="text-right px-2 py-1 border-b border-[#f0f0f4] font-mono">{getResultValue(results, category, selectedObj, v, i)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : mode === 'byVariable' && selectedVar ? (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#f0f0f4]">
                <tr>
                  <th className="text-left px-2 py-1.5 border-b border-[#d0d0d8] font-semibold text-[#2c3e6b]">ID</th>
                  <th className="text-right px-2 py-1.5 border-b border-[#d0d0d8] font-semibold text-[#2c3e6b]">{varLabels[selectedVar] || selectedVar}</th>
                </tr>
              </thead>
              <tbody>
                {ids.map((id, i) => (
                  <tr key={id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fafafe]'}>
                    <td className="px-2 py-1 border-b border-[#f0f0f4] font-mono">{id}</td>
                    <td className="text-right px-2 py-1 border-b border-[#f0f0f4] font-mono">{getResultValue(results, category, id, selectedVar, timeStep)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-8 text-center text-sm text-[#6b6b7b]">
              {mode === 'byObject' ? 'Select an object to view its time series data.' : 'Select a variable to view across all objects.'}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
