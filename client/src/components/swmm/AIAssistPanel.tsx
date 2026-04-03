import { useState, useMemo, useCallback } from 'react';
import type { SwmmProject } from '@/lib/swmm-types';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle, CheckCircle, Lightbulb, Wrench, ChevronDown, ChevronRight,
  Search, Zap, Droplets, TriangleAlert
} from 'lucide-react';

type Severity = 'error' | 'warning' | 'info';

interface DiagnosticItem {
  id: string;
  severity: Severity;
  category: string;
  message: string;
  objectId?: string;
  objectType?: string;
  fix?: () => void;
  fixLabel?: string;
}

interface EstimateRow {
  name: string;
  manningsN: number;
  imperv?: number;
  suctionHead?: number;
  conductivity?: number;
  initialDeficit?: number;
  dstoreImperv?: number;
  dstorePerv?: number;
}

const SOIL_TABLE: EstimateRow[] = [
  { name: 'Sand', manningsN: 0.013, suctionHead: 1.93, conductivity: 4.74, initialDeficit: 0.34 },
  { name: 'Loamy Sand', manningsN: 0.013, suctionHead: 2.40, conductivity: 1.18, initialDeficit: 0.33 },
  { name: 'Sandy Loam', manningsN: 0.015, suctionHead: 4.33, conductivity: 0.43, initialDeficit: 0.33 },
  { name: 'Loam', manningsN: 0.02, suctionHead: 3.50, conductivity: 0.13, initialDeficit: 0.31 },
  { name: 'Silt Loam', manningsN: 0.02, suctionHead: 6.57, conductivity: 0.26, initialDeficit: 0.32 },
  { name: 'Sandy Clay Loam', manningsN: 0.024, suctionHead: 8.60, conductivity: 0.06, initialDeficit: 0.26 },
  { name: 'Clay Loam', manningsN: 0.024, suctionHead: 8.22, conductivity: 0.04, initialDeficit: 0.24 },
  { name: 'Silty Clay Loam', manningsN: 0.024, suctionHead: 10.75, conductivity: 0.04, initialDeficit: 0.22 },
  { name: 'Sandy Clay', manningsN: 0.028, suctionHead: 9.41, conductivity: 0.02, initialDeficit: 0.21 },
  { name: 'Silty Clay', manningsN: 0.028, suctionHead: 11.50, conductivity: 0.02, initialDeficit: 0.19 },
  { name: 'Clay', manningsN: 0.03, suctionHead: 12.45, conductivity: 0.01, initialDeficit: 0.17 },
];

const PIPE_TABLE = [
  { name: 'Concrete (new)', manningsN: 0.013 },
  { name: 'Concrete (old)', manningsN: 0.015 },
  { name: 'Cast Iron', manningsN: 0.013 },
  { name: 'Corrugated Metal', manningsN: 0.024 },
  { name: 'PVC', manningsN: 0.011 },
  { name: 'HDPE (smooth)', manningsN: 0.012 },
  { name: 'HDPE (corrugated)', manningsN: 0.020 },
  { name: 'Vitrified Clay', manningsN: 0.013 },
  { name: 'Brick', manningsN: 0.015 },
  { name: 'Ductile Iron', manningsN: 0.012 },
  { name: 'Steel (riveted)', manningsN: 0.019 },
  { name: 'Steel (welded)', manningsN: 0.012 },
  { name: 'Fiberglass', manningsN: 0.009 },
  { name: 'Natural Channel', manningsN: 0.035 },
];

const LANDUSE_TABLE = [
  { name: 'Commercial/Business', imperv: 85, nImperv: 0.012, nPerv: 0.10, dstoreI: 0.05, dstoreP: 0.10 },
  { name: 'Industrial', imperv: 72, nImperv: 0.012, nPerv: 0.10, dstoreI: 0.05, dstoreP: 0.10 },
  { name: 'Residential (1/8 ac)', imperv: 65, nImperv: 0.012, nPerv: 0.15, dstoreI: 0.06, dstoreP: 0.15 },
  { name: 'Residential (1/4 ac)', imperv: 38, nImperv: 0.012, nPerv: 0.15, dstoreI: 0.06, dstoreP: 0.20 },
  { name: 'Residential (1/2 ac)', imperv: 25, nImperv: 0.012, nPerv: 0.20, dstoreI: 0.06, dstoreP: 0.25 },
  { name: 'Residential (1 ac)', imperv: 20, nImperv: 0.012, nPerv: 0.25, dstoreI: 0.06, dstoreP: 0.30 },
  { name: 'Open Space/Park', imperv: 5, nImperv: 0.014, nPerv: 0.40, dstoreI: 0.10, dstoreP: 0.40 },
  { name: 'Parking Lot', imperv: 95, nImperv: 0.012, nPerv: 0.10, dstoreI: 0.05, dstoreP: 0.05 },
];

function runDiagnostics(project: SwmmProject): DiagnosticItem[] {
  const items: DiagnosticItem[] = [];
  let idx = 0;
  const addItem = (severity: Severity, category: string, message: string, objectId?: string, objectType?: string) => {
    items.push({ id: `d${idx++}`, severity, category, message, objectId, objectType });
  };

  if (project.junctions.length === 0 && project.outfalls.length === 0) {
    addItem('error', 'Network', 'No nodes defined in the model');
  }
  if (project.conduits.length === 0 && project.pumps.length === 0 && project.orifices.length === 0 && project.weirs.length === 0 && project.outlets.length === 0) {
    addItem('error', 'Network', 'No links defined in the model');
  }
  if (project.outfalls.length === 0) {
    addItem('error', 'Network', 'No outfall nodes — model needs at least one outfall');
  }
  if (project.raingages.length === 0 && project.subcatchments.length > 0) {
    addItem('error', 'Hydrology', 'Subcatchments exist but no rain gages defined');
  }

  const allNodeIds = new Set([
    ...project.junctions.map(j => j.id),
    ...project.outfalls.map(o => o.id),
    ...project.storageUnits.map(s => s.id),
    ...project.dividers.map(d => d.id),
  ]);
  const allLinkFromTo = [
    ...project.conduits.map(c => ({ id: c.id, from: c.fromNode, to: c.toNode, type: 'conduit' })),
    ...project.pumps.map(p => ({ id: p.id, from: p.fromNode, to: p.toNode, type: 'pump' })),
    ...project.orifices.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'orifice' })),
    ...project.weirs.map(w => ({ id: w.id, from: w.fromNode, to: w.toNode, type: 'weir' })),
    ...project.outlets.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'outlet' })),
  ];

  for (const link of allLinkFromTo) {
    if (!allNodeIds.has(link.from)) {
      addItem('error', 'Connectivity', `${link.type} "${link.id}" references unknown from-node "${link.from}"`, link.id, link.type);
    }
    if (!allNodeIds.has(link.to)) {
      addItem('error', 'Connectivity', `${link.type} "${link.id}" references unknown to-node "${link.to}"`, link.id, link.type);
    }
    if (link.from === link.to) {
      addItem('error', 'Connectivity', `${link.type} "${link.id}" connects a node to itself`, link.id, link.type);
    }
  }

  const connectedNodes = new Set<string>();
  for (const link of allLinkFromTo) {
    connectedNodes.add(link.from);
    connectedNodes.add(link.to);
  }
  for (const nid of allNodeIds) {
    if (!connectedNodes.has(nid)) {
      const nType = project.junctions.find(j => j.id === nid) ? 'junction'
        : project.outfalls.find(o => o.id === nid) ? 'outfall'
        : project.storageUnits.find(s => s.id === nid) ? 'storage' : 'divider';
      addItem('warning', 'Connectivity', `Node "${nid}" is not connected to any link`, nid, nType);
    }
  }

  for (const c of project.conduits) {
    if (c.length <= 0) addItem('error', 'Geometry', `Conduit "${c.id}" has zero or negative length`, c.id, 'conduit');
    if (c.roughness <= 0 || c.roughness > 1) addItem('warning', 'Geometry', `Conduit "${c.id}" has unusual Manning's N: ${c.roughness}`, c.id, 'conduit');
    const xs = Array.isArray(project.xsections)
      ? project.xsections.find((x: any) => x.linkId === c.id)
      : project.xsections[c.id];
    if (!xs) addItem('error', 'Cross-Section', `Conduit "${c.id}" has no cross-section defined`, c.id, 'conduit');
    else if (xs.geom1 <= 0) addItem('error', 'Cross-Section', `Conduit "${c.id}" has zero or negative max depth`, c.id, 'conduit');
  }

  for (const j of project.junctions) {
    if (j.maxDepth < 0) addItem('warning', 'Geometry', `Junction "${j.id}" has negative max depth`, j.id, 'junction');
  }

  for (const s of project.subcatchments) {
    if (s.area <= 0) addItem('error', 'Subcatchment', `Subcatchment "${s.id}" has zero or negative area`, s.id, 'subcatchment');
    if (s.width <= 0) addItem('warning', 'Subcatchment', `Subcatchment "${s.id}" has zero width`, s.id, 'subcatchment');
    if (s.slope <= 0) addItem('warning', 'Subcatchment', `Subcatchment "${s.id}" has zero or negative slope`, s.id, 'subcatchment');
    if (s.pctImperv < 0 || s.pctImperv > 100) addItem('error', 'Subcatchment', `Subcatchment "${s.id}" % impervious out of range: ${s.pctImperv}`, s.id, 'subcatchment');
    if (!s.outlet) addItem('error', 'Subcatchment', `Subcatchment "${s.id}" has no outlet defined`, s.id, 'subcatchment');
    if (!s.rainGage) addItem('error', 'Subcatchment', `Subcatchment "${s.id}" has no rain gage assigned`, s.id, 'subcatchment');
    const rgExists = project.raingages.find(r => r.id === s.rainGage);
    if (s.rainGage && !rgExists) addItem('error', 'Subcatchment', `Subcatchment "${s.id}" references unknown rain gage "${s.rainGage}"`, s.id, 'subcatchment');
    const outletIsNode = allNodeIds.has(s.outlet);
    const outletIsSub = project.subcatchments.find(sub => sub.id === s.outlet);
    if (s.outlet && !outletIsNode && !outletIsSub) addItem('warning', 'Subcatchment', `Subcatchment "${s.id}" outlet "${s.outlet}" not found`, s.id, 'subcatchment');
  }

  const usedRgs = new Set(project.subcatchments.map(s => s.rainGage).filter(Boolean));
  for (const rg of project.raingages) {
    if (!usedRgs.has(rg.id)) addItem('info', 'Hydrology', `Rain gage "${rg.id}" is not used by any subcatchment`, rg.id, 'raingage');
  }

  const opts = project.options;
  const startDate = opts['START_DATE'] || opts.startDate;
  const endDate = opts['END_DATE'] || opts.endDate;
  if (!startDate || !endDate) addItem('warning', 'Options', 'Simulation start/end dates not set');
  if (startDate && endDate && startDate > endDate) addItem('error', 'Options', 'Start date is after end date');

  const dupJunctions = findDuplicates(project.junctions.map(j => j.id));
  for (const d of dupJunctions) addItem('error', 'Duplicates', `Duplicate junction ID: "${d}"`);
  const dupConduits = findDuplicates(project.conduits.map(c => c.id));
  for (const d of dupConduits) addItem('error', 'Duplicates', `Duplicate conduit ID: "${d}"`);

  if (items.length === 0) {
    addItem('info', 'Status', 'No issues found — model looks good');
  }

  return items;
}

function findDuplicates(arr: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const v of arr) { if (seen.has(v)) dups.add(v); seen.add(v); }
  return [...dups];
}

function getResultsInsights(project: SwmmProject, results: any): string[] {
  const insights: string[] = [];
  if (!results || !results.timeSteps || results.timeSteps.length === 0) {
    insights.push('No simulation results available. Run the model first.');
    return insights;
  }

  let totalFloodingNodes = 0;
  let maxFloodingRate = 0;
  let maxFloodingNode = '';
  let highVelocityLinks: string[] = [];
  let surchargedLinks: string[] = [];

  for (const ts of results.timeSteps) {
    for (const [nid, nr] of Object.entries(ts.nodes || {})) {
      const n = nr as any;
      if (n.flooding > 0) {
        totalFloodingNodes++;
        if (n.flooding > maxFloodingRate) {
          maxFloodingRate = n.flooding;
          maxFloodingNode = nid;
        }
      }
    }
    for (const [lid, lr] of Object.entries(ts.links || {})) {
      const l = lr as any;
      if (l.velocity > 15) highVelocityLinks.push(lid);
      if (l.capacity >= 1.0) surchargedLinks.push(lid);
    }
  }

  if (totalFloodingNodes > 0) {
    insights.push(`Flooding detected at ${totalFloodingNodes} node-timesteps. Worst: "${maxFloodingNode}" at ${maxFloodingRate.toFixed(2)} CFS.`);
  } else {
    insights.push('No flooding detected across all time steps.');
  }

  const uniqueHighV = [...new Set(highVelocityLinks)];
  if (uniqueHighV.length > 0) {
    insights.push(`${uniqueHighV.length} link(s) exceed 15 ft/s velocity: ${uniqueHighV.slice(0, 5).join(', ')}${uniqueHighV.length > 5 ? '...' : ''}`);
  }

  const uniqueSurcharged = [...new Set(surchargedLinks)];
  if (uniqueSurcharged.length > 0) {
    insights.push(`${uniqueSurcharged.length} link(s) are at or above full capacity: ${uniqueSurcharged.slice(0, 5).join(', ')}${uniqueSurcharged.length > 5 ? '...' : ''}`);
  }

  const nodeCount = project.junctions.length + project.outfalls.length + project.storageUnits.length + project.dividers.length;
  const linkCount = project.conduits.length + project.pumps.length + project.orifices.length + project.weirs.length + project.outlets.length;
  insights.push(`Model has ${nodeCount} nodes, ${linkCount} links, ${project.subcatchments.length} subcatchments.`);

  return insights;
}

interface AIAssistPanelProps {
  project: SwmmProject;
  results?: any;
  onSelectObject?: (objType: string, id: string) => void;
  onUpdateProject?: (updater: (prev: SwmmProject) => SwmmProject) => void;
}

type TabKey = 'errors' | 'parameters' | 'insights' | 'autofix';

export default function AIAssistPanel({ project, results, onSelectObject, onUpdateProject }: AIAssistPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('errors');
  const [paramTab, setParamTab] = useState<'soil' | 'pipe' | 'landuse'>('soil');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const diagnostics = useMemo(() => runDiagnostics(project), [project]);
  const insights = useMemo(() => getResultsInsights(project, results), [project, results]);

  const errorCount = diagnostics.filter(d => d.severity === 'error').length;
  const warnCount = diagnostics.filter(d => d.severity === 'warning').length;

  const toggleCat = useCallback((cat: string) => {
    setExpandedCats(prev => {
      const n = new Set(prev);
      if (n.has(cat)) n.delete(cat); else n.add(cat);
      return n;
    });
  }, []);

  const handleAutoEstimateLengths = useCallback(() => {
    if (!onUpdateProject) return;
    onUpdateProject(prev => {
      const next = { ...prev };
      next.conduits = next.conduits.map(c => {
        if (c.length > 0) return c;
        const fromCoord = next.coordinates[c.fromNode];
        const toCoord = next.coordinates[c.toNode];
        if (fromCoord && toCoord) {
          const dx = toCoord[0] - fromCoord[0];
          const dy = toCoord[1] - fromCoord[1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          return { ...c, length: Math.max(1, Math.round(dist * 100) / 100) };
        }
        return c;
      });
      return next;
    });
  }, [onUpdateProject]);

  const handleAutoEstimateWidths = useCallback(() => {
    if (!onUpdateProject) return;
    onUpdateProject(prev => {
      const next = { ...prev };
      next.subcatchments = next.subcatchments.map(s => {
        if (s.width > 0) return s;
        const area_sqft = s.area * 43560;
        return { ...s, width: Math.round(Math.sqrt(area_sqft)) };
      });
      return next;
    });
  }, [onUpdateProject]);

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: 'errors', label: 'Errors', icon: AlertTriangle },
    { key: 'parameters', label: 'Parameters', icon: Search },
    { key: 'insights', label: 'Insights', icon: Lightbulb },
    { key: 'autofix', label: 'Auto-Fix', icon: Wrench },
  ];

  return (
    <div className="h-full flex flex-col bg-white" data-testid="ai-assist-panel">
      <div className="shrink-0 flex items-center gap-1 px-2 py-1 bg-[#2c3e6b] border-b border-[#1e2d50]">
        <Zap className="w-3.5 h-3.5 text-yellow-300" />
        <span className="text-[10px] font-bold text-white tracking-wide">AI ASSIST</span>
        {errorCount > 0 && (
          <span className="ml-auto text-[8px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold" data-testid="error-badge">
            {errorCount}
          </span>
        )}
        {warnCount > 0 && errorCount === 0 && (
          <span className="ml-auto text-[8px] bg-yellow-500 text-white rounded-full px-1.5 py-0.5 font-bold" data-testid="warning-badge">
            {warnCount}
          </span>
        )}
      </div>

      <div className="shrink-0 flex border-b border-[#e0e0e8]">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={`flex-1 flex items-center justify-center gap-1 px-1 py-1.5 text-[9px] font-medium transition-colors ${activeTab === t.key ? 'bg-white text-[#2c6eb5] border-b-2 border-[#2c6eb5]' : 'bg-[#f0f0f4] text-[#6b6b7b] hover:bg-[#e8e8f0]'}`}
              onClick={() => setActiveTab(t.key)}
              data-testid={`tab-${t.key}`}
            >
              <Icon className="w-3 h-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {activeTab === 'errors' && <ErrorsTab diagnostics={diagnostics} expandedCats={expandedCats} toggleCat={toggleCat} onSelectObject={onSelectObject} />}
          {activeTab === 'parameters' && <ParametersTab paramTab={paramTab} setParamTab={setParamTab} />}
          {activeTab === 'insights' && <InsightsTab insights={insights} />}
          {activeTab === 'autofix' && <AutoFixTab project={project} onEstimateLengths={handleAutoEstimateLengths} onEstimateWidths={handleAutoEstimateWidths} />}
        </div>
      </ScrollArea>
    </div>
  );
}

function ErrorsTab({ diagnostics, expandedCats, toggleCat, onSelectObject }: {
  diagnostics: DiagnosticItem[];
  expandedCats: Set<string>;
  toggleCat: (cat: string) => void;
  onSelectObject?: (objType: string, id: string) => void;
}) {
  const categories = useMemo(() => {
    const cats: string[] = [];
    for (const d of diagnostics) { if (!cats.includes(d.category)) cats.push(d.category); }
    return cats;
  }, [diagnostics]);

  const severityIcon = (s: Severity) => {
    if (s === 'error') return <TriangleAlert className="w-3 h-3 text-red-500 shrink-0" />;
    if (s === 'warning') return <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />;
    return <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />;
  };

  return (
    <div className="space-y-1" data-testid="errors-tab">
      {categories.map(cat => {
        const catItems = diagnostics.filter(d => d.category === cat);
        const errors = catItems.filter(d => d.severity === 'error').length;
        const warns = catItems.filter(d => d.severity === 'warning').length;
        const expanded = expandedCats.has(cat) || expandedCats.size === 0;
        return (
          <div key={cat} className="border border-[#e0e0e8] rounded overflow-hidden">
            <div
              className="flex items-center gap-1.5 px-2 py-1 bg-[#f4f4f8] cursor-pointer hover:bg-[#eaeaef] transition-colors"
              onClick={() => toggleCat(cat)}
              data-testid={`diag-cat-${cat.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {expanded ? <ChevronDown className="w-3 h-3 text-[#6b6b7b]" /> : <ChevronRight className="w-3 h-3 text-[#6b6b7b]" />}
              <span className="text-[9px] font-semibold text-[#4a4a5a] flex-1">{cat}</span>
              {errors > 0 && <span className="text-[8px] bg-red-100 text-red-600 rounded px-1">{errors}E</span>}
              {warns > 0 && <span className="text-[8px] bg-yellow-100 text-yellow-700 rounded px-1">{warns}W</span>}
            </div>
            {expanded && catItems.map(item => (
              <div
                key={item.id}
                className={`flex items-start gap-1.5 px-2 py-1 border-t border-[#f0f0f4] hover:bg-[#f8f9ff] ${item.objectId ? 'cursor-pointer' : ''}`}
                onClick={() => item.objectId && item.objectType && onSelectObject?.(item.objectType, item.objectId)}
                data-testid={`diag-item-${item.id}`}
              >
                {severityIcon(item.severity)}
                <span className="text-[9px] text-[#3a3a4a] leading-tight">{item.message}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ParametersTab({ paramTab, setParamTab }: { paramTab: 'soil' | 'pipe' | 'landuse'; setParamTab: (t: 'soil' | 'pipe' | 'landuse') => void }) {
  return (
    <div data-testid="parameters-tab">
      <div className="flex gap-1 mb-2">
        {(['soil', 'pipe', 'landuse'] as const).map(t => (
          <button
            key={t}
            className={`px-2 py-1 text-[9px] rounded font-medium transition-colors ${paramTab === t ? 'bg-[#2c6eb5] text-white' : 'bg-[#f0f0f4] text-[#5a5a6a] hover:bg-[#e0e0e8]'}`}
            onClick={() => setParamTab(t)}
            data-testid={`param-tab-${t}`}
          >
            {t === 'soil' ? 'Soils (Green-Ampt)' : t === 'pipe' ? "Pipe Manning's N" : 'Land Use'}
          </button>
        ))}
      </div>

      {paramTab === 'soil' && (
        <div className="border border-[#e0e0e8] rounded overflow-hidden">
          <table className="w-full text-[8px]">
            <thead>
              <tr className="bg-[#f0f0f4]">
                <th className="px-1.5 py-1 text-left font-semibold text-[#4a4a5a]">Soil Type</th>
                <th className="px-1.5 py-1 text-right font-semibold text-[#4a4a5a]">Suction (in)</th>
                <th className="px-1.5 py-1 text-right font-semibold text-[#4a4a5a]">K (in/hr)</th>
                <th className="px-1.5 py-1 text-right font-semibold text-[#4a4a5a]">IMD</th>
              </tr>
            </thead>
            <tbody>
              {SOIL_TABLE.map(s => (
                <tr key={s.name} className="border-t border-[#f0f0f4] hover:bg-[#f8f9ff]">
                  <td className="px-1.5 py-0.5 text-[#3a3a4a]">{s.name}</td>
                  <td className="px-1.5 py-0.5 text-right font-mono text-[#3a3a4a]">{s.suctionHead?.toFixed(2)}</td>
                  <td className="px-1.5 py-0.5 text-right font-mono text-[#3a3a4a]">{s.conductivity?.toFixed(2)}</td>
                  <td className="px-1.5 py-0.5 text-right font-mono text-[#3a3a4a]">{s.initialDeficit?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paramTab === 'pipe' && (
        <div className="border border-[#e0e0e8] rounded overflow-hidden">
          <table className="w-full text-[8px]">
            <thead>
              <tr className="bg-[#f0f0f4]">
                <th className="px-1.5 py-1 text-left font-semibold text-[#4a4a5a]">Material</th>
                <th className="px-1.5 py-1 text-right font-semibold text-[#4a4a5a]">Manning's N</th>
              </tr>
            </thead>
            <tbody>
              {PIPE_TABLE.map(p => (
                <tr key={p.name} className="border-t border-[#f0f0f4] hover:bg-[#f8f9ff]">
                  <td className="px-1.5 py-0.5 text-[#3a3a4a]">{p.name}</td>
                  <td className="px-1.5 py-0.5 text-right font-mono text-[#3a3a4a]">{p.manningsN.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paramTab === 'landuse' && (
        <div className="border border-[#e0e0e8] rounded overflow-hidden">
          <table className="w-full text-[8px]">
            <thead>
              <tr className="bg-[#f0f0f4]">
                <th className="px-1.5 py-1 text-left font-semibold text-[#4a4a5a]">Land Use</th>
                <th className="px-1.5 py-1 text-right font-semibold text-[#4a4a5a]">%Imperv</th>
                <th className="px-1.5 py-1 text-right font-semibold text-[#4a4a5a]">N-Imp</th>
                <th className="px-1.5 py-1 text-right font-semibold text-[#4a4a5a]">N-Per</th>
              </tr>
            </thead>
            <tbody>
              {LANDUSE_TABLE.map(l => (
                <tr key={l.name} className="border-t border-[#f0f0f4] hover:bg-[#f8f9ff]">
                  <td className="px-1.5 py-0.5 text-[#3a3a4a]">{l.name}</td>
                  <td className="px-1.5 py-0.5 text-right font-mono text-[#3a3a4a]">{l.imperv}</td>
                  <td className="px-1.5 py-0.5 text-right font-mono text-[#3a3a4a]">{l.nImperv?.toFixed(3)}</td>
                  <td className="px-1.5 py-0.5 text-right font-mono text-[#3a3a4a]">{l.nPerv?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 px-1 text-[8px] text-[#8a8a9a] italic">
        Reference values from EPA SWMM 5 User Manual. Use as starting estimates and calibrate.
      </div>
    </div>
  );
}

function InsightsTab({ insights }: { insights: string[] }) {
  return (
    <div className="space-y-2" data-testid="insights-tab">
      {insights.map((text, i) => (
        <div key={i} className="flex items-start gap-1.5 px-2 py-1.5 bg-[#f8f9ff] border border-[#e0e4f0] rounded">
          <Droplets className="w-3 h-3 text-[#2c6eb5] shrink-0 mt-0.5" />
          <span className="text-[9px] text-[#3a3a4a] leading-tight">{text}</span>
        </div>
      ))}
    </div>
  );
}

function AutoFixTab({ project, onEstimateLengths, onEstimateWidths }: {
  project: SwmmProject;
  onEstimateLengths: () => void;
  onEstimateWidths: () => void;
}) {
  const zeroLengthConduits = project.conduits.filter(c => c.length <= 0).length;
  const zeroWidthSubs = project.subcatchments.filter(s => s.width <= 0).length;
  const missingXs = project.conduits.filter(c => {
    if (Array.isArray(project.xsections)) return !(project.xsections as any).find((x: any) => x.linkId === c.id);
    return !project.xsections[c.id];
  }).length;

  return (
    <div className="space-y-2" data-testid="autofix-tab">
      <div className="text-[9px] text-[#6b6b7b] mb-1">Automatic parameter estimation using coordinates and model data:</div>

      <div className="border border-[#e0e0e8] rounded p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] font-semibold text-[#3a3a4a]">Estimate Conduit Lengths</div>
            <div className="text-[8px] text-[#8a8a9a]">Calculate from node coordinates ({zeroLengthConduits} conduits with zero length)</div>
          </div>
          <button
            className="px-2 py-1 text-[8px] font-medium bg-[#2c6eb5] text-white rounded hover:bg-[#245a9a] transition-colors disabled:opacity-50"
            onClick={onEstimateLengths}
            disabled={zeroLengthConduits === 0}
            data-testid="btn-estimate-lengths"
          >
            Fix
          </button>
        </div>
      </div>

      <div className="border border-[#e0e0e8] rounded p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[9px] font-semibold text-[#3a3a4a]">Estimate Subcatchment Widths</div>
            <div className="text-[8px] text-[#8a8a9a]">Width = sqrt(area in sqft) ({zeroWidthSubs} subcatchments with zero width)</div>
          </div>
          <button
            className="px-2 py-1 text-[8px] font-medium bg-[#2c6eb5] text-white rounded hover:bg-[#245a9a] transition-colors disabled:opacity-50"
            onClick={onEstimateWidths}
            disabled={zeroWidthSubs === 0}
            data-testid="btn-estimate-widths"
          >
            Fix
          </button>
        </div>
      </div>

      {missingXs > 0 && (
        <div className="border border-yellow-200 bg-yellow-50 rounded p-2">
          <div className="text-[9px] font-semibold text-yellow-800">{missingXs} conduit(s) missing cross-sections</div>
          <div className="text-[8px] text-yellow-700">Add cross-sections via the Property Editor or data grid.</div>
        </div>
      )}

      <div className="border border-[#e0e0e8] rounded p-2 text-[8px] text-[#8a8a9a]">
        More auto-fix tools coming soon: elevation estimation from DEM, slope calculation, automatic rain gage assignment.
      </div>
    </div>
  );
}
