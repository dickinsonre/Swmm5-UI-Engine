import { useState, useMemo } from 'react';
import type { SwmmProject, SelectedObject } from '@/lib/swmm-types';
import { ChevronDown, ChevronRight, Droplets, CircleDot, Minus, CloudRain, Triangle, Square, ArrowLeftRight, X, Search, List } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const LEGEND_COLORS = ['#7092BE', '#99D9EA', '#B5E61D', '#FFC90E', '#FF7F27'];

interface LegendProps {
  subcatchTheme: string;
  nodeTheme: string;
  linkTheme: string;
  showSubcatch: boolean;
  setShowSubcatch: (v: boolean) => void;
  layerVisibility: Record<string, boolean>;
  setLayerVisibility: (v: Record<string, boolean>) => void;
}

export function LegendPanel({
  subcatchTheme,
  nodeTheme,
  linkTheme,
  showSubcatch,
  setShowSubcatch,
  layerVisibility,
  setLayerVisibility,
}: LegendProps) {
  const nodeLabels = nodeTheme === 'depth'
    ? ['< 1.5', '1.5-3.0', '3.0-4.0', '4.0-5.0', '> 5.0']
    : ['< 92', '92-95', '95-97', '97-100', '> 100'];

  const linkLabels = linkTheme === 'flow'
    ? ['< 1.0', '1.0-2.5', '2.5-4.0', '4.0-6.0', '> 6.0']
    : ['< 0.5', '0.5-1.0', '1.0-1.5', '1.5-2.0', '> 2.0'];

  const subcatchLabels = subcatchTheme === 'imperv'
    ? ['< 25%', '25-50%', '50-75%', '75-90%', '> 90%']
    : subcatchTheme === 'runoff'
    ? ['< 2', '2-5', '5-10', '10-15', '> 15']
    : ['< 0.5', '0.5-1.0', '1.0-2.0', '2.0-3.0', '> 3.0'];

  const subcatchTitle = subcatchTheme === 'imperv' ? '% Imperv' : subcatchTheme === 'runoff' ? 'Runoff (CFS)' : 'Rainfall (in/hr)';
  const nodeTitle = nodeTheme === 'depth' ? 'Depth (ft)' : 'Invert (ft)';
  const linkTitle = linkTheme === 'flow' ? 'Flow (CFS)' : 'Depth (ft)';

  const layers = [
    { key: 'junctions', label: 'Junctions', icon: '○' },
    { key: 'storage', label: 'Storage', icon: '◻' },
    { key: 'outfalls', label: 'Outfalls', icon: '▽' },
    { key: 'conduits', label: 'Conduits', icon: '—' },
    { key: 'pumps', label: 'Pumps', icon: '⊙' },
    { key: 'weirs', label: 'Weirs', icon: '═' },
    { key: 'labels', label: 'Labels', icon: 'A' },
  ];

  const layerItems = [
    { key: 'subcatchments', label: 'Subcatchments', visible: showSubcatch, toggle: () => setShowSubcatch(!showSubcatch) },
    ...layers.map(l => ({ key: l.key, label: l.label, visible: layerVisibility[l.key] !== false, toggle: () => setLayerVisibility({ ...layerVisibility, [l.key]: !layerVisibility[l.key] }) })),
  ];

  return (
    <ScrollArea className="h-full" data-testid="legend-panel">
      <div className="p-2.5 space-y-3">
        <div className="text-[11px] font-bold text-center pb-1.5 border-b border-[#d0d0d8] text-[#2a2a3e]">
          Legend & Layers
        </div>

        <LegendSection
          title={subcatchTitle}
          labels={subcatchLabels}
          swatchType="rect"
          checked={showSubcatch}
          onCheckedChange={setShowSubcatch}
        />

        <LegendSection
          title={nodeTitle}
          labels={nodeLabels}
          swatchType="circle"
        />

        <LegendSection
          title={linkTitle}
          labels={linkLabels}
          swatchType="line"
        />

        <div className="border-t border-[#d0d0d8] pt-2">
          <div className="text-[10px] font-semibold text-[#4a4a5a] mb-1">Layers</div>
          {layerItems.map(l => (
            <label key={l.key} className="flex items-center gap-1.5 pl-1 py-[3px] cursor-pointer rounded hover:bg-black/[0.04] transition-colors" data-testid={`layer-toggle-${l.key}`}>
              <input
                type="checkbox"
                checked={l.visible}
                onChange={l.toggle}
                className="w-3 h-3 accent-[#2c6eb5]"
              />
              <span className={`text-[10px] transition-colors ${l.visible ? 'text-[#2a2a3e]' : 'text-[#b0b0b8]'}`}>{l.label}</span>
            </label>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}

function LegendSection({ title, labels, swatchType, checked, onCheckedChange }: {
  title: string;
  labels: string[];
  swatchType: 'rect' | 'circle' | 'line';
  checked?: boolean;
  onCheckedChange?: (v: boolean) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        {onCheckedChange !== undefined ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onCheckedChange?.(!checked)}
            className="w-3 h-3 accent-[#2c6eb5]"
          />
        ) : (
          <div className="w-3" />
        )}
        <span className="text-[10px] font-semibold text-[#4a4a5a]">{title}</span>
      </div>
      {labels.map((label, i) => (
        <div key={i} className="flex items-center gap-1.5 pl-5 py-px">
          <div
            style={{
              width: swatchType === 'line' ? 16 : swatchType === 'rect' ? 14 : 10,
              height: swatchType === 'line' ? 3 : 10,
              borderRadius: swatchType === 'circle' ? '50%' : swatchType === 'rect' ? 2 : 0,
              backgroundColor: LEGEND_COLORS[i],
              opacity: swatchType === 'rect' ? 0.6 : 1,
              border: '1px solid rgba(0,0,0,0.3)',
            }}
          />
          <span className="text-[9px] text-[#6b6b7b]">{label}</span>
        </div>
      ))}
    </div>
  );
}

interface ExplorerProps {
  project: SwmmProject;
  selectedObj: SelectedObject;
  onSelectObj: (obj: SelectedObject) => void;
  results: import('@/lib/swmm-types').SimulationResults | null;
  timeStep: number;
}

export function ProjectExplorer({ project, selectedObj, onSelectObj, results, timeStep }: ExplorerProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    options: true,
    nodes: true,
    links: false,
    subcatch: false,
  });

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const counts = useMemo(() => ({
    raingages: project.raingages.length,
    subcatchments: project.subcatchments.length,
    junctions: project.junctions.length,
    outfalls: project.outfalls.length,
    dividers: project.dividers.length,
    storage: project.storageUnits.length,
    conduits: project.conduits.length,
    pumps: project.pumps.length,
    orifices: project.orifices.length,
    weirs: project.weirs.length,
    outlets: project.outlets.length,
  }), [project]);

  const treeData: TreeItemData[] = [
    { label: 'Title / Notes', indent: 0, icon: '📄' },
    { label: 'Analysis Options', indent: 0, expandable: true, treeKey: 'options', icon: '⚙' },
    ...(expanded.options ? [
      { label: 'General', indent: 1 },
      { label: 'Hydrology', indent: 1 },
      { label: 'Hydraulics', indent: 1 },
      { label: 'Routing', indent: 1 },
      { label: 'Quality', indent: 1 },
      { label: 'Dates', indent: 1 },
      { label: 'Time Steps', indent: 1 },
      { label: 'Reporting', indent: 1 },
    ] : []),
    { label: `Rain Gages (${counts.raingages})`, indent: 0, icon: '▲', category: 'raingages' },
    { label: `Subcatchments (${counts.subcatchments})`, indent: 0, expandable: true, treeKey: 'subcatch', icon: '◫', category: 'subcatchments' },
    ...(expanded.subcatch ? [
      { label: 'Infiltration', indent: 1 },
      { label: 'Groundwater', indent: 1 },
      { label: 'LID Controls', indent: 1 },
      { label: 'Snow Packs', indent: 1 },
    ] : []),
    { label: 'Network Nodes', indent: 0, expandable: true, treeKey: 'nodes', icon: '○' },
    ...(expanded.nodes ? [
      { label: `Junctions (${counts.junctions})`, indent: 1, category: 'junctions' },
      { label: `Outfalls (${counts.outfalls})`, indent: 1, category: 'outfalls' },
      { label: `Dividers (${counts.dividers})`, indent: 1, category: 'dividers' },
      { label: `Storage Units (${counts.storage})`, indent: 1, category: 'storage' },
    ] : []),
    { label: 'Network Links', indent: 0, expandable: true, treeKey: 'links', icon: '—' },
    ...(expanded.links ? [
      { label: `Conduits (${counts.conduits})`, indent: 1, category: 'conduits' },
      { label: `Pumps (${counts.pumps})`, indent: 1, category: 'pumps' },
      { label: `Orifices (${counts.orifices})`, indent: 1, category: 'orifices' },
      { label: `Weirs (${counts.weirs})`, indent: 1, category: 'weirs' },
      { label: `Outlets (${counts.outlets})`, indent: 1, category: 'outlets' },
    ] : []),
    { label: 'Dry Weather', indent: 0, icon: '☀' },
    { label: 'RDII', indent: 0, icon: '↗' },
    { label: 'Transects', indent: 0, icon: '⌢' },
    { label: `Time Patterns (${Object.keys(project.patterns).length})`, indent: 0 },
    { label: `Time Series (${Object.keys(project.timeseries).length})`, indent: 0 },
    { label: `Data Curves (${Object.keys(project.curves).length})`, indent: 0 },
    { label: `Control Rules (${project.controls.length})`, indent: 0 },
  ];

  const properties = useMemo(() => getProperties(project, selectedObj, results, timeStep), [project, selectedObj, results, timeStep]);

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="project-explorer">
      <div className="text-[11px] font-bold text-center py-1.5 border-b border-[#d0d0d8] text-[#2a2a3e] shrink-0">
        Project Explorer
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1">
          {treeData.map((item, i) => (
            <TreeItem
              key={i}
              label={item.label}
              indent={item.indent}
              expandable={item.expandable}
              icon={item.icon}
              category={item.category}
              isExpanded={item.treeKey ? expanded[item.treeKey] : false}
              onToggle={item.treeKey ? () => toggle(item.treeKey!) : undefined}
              selected={false}
            />
          ))}
        </div>
      </ScrollArea>

      {selectedObj && (
        <div className="border-t border-[#d0d0d8] shrink-0" data-testid="property-editor">
          <div className="flex items-center justify-between px-2 py-1 bg-[#e8e8ee]">
            <span className="text-[11px] font-semibold text-[#2a2a3e]">
              {selectedObj.objType.charAt(0).toUpperCase() + selectedObj.objType.slice(1)} {selectedObj.id}
            </span>
          </div>
          <ScrollArea className="max-h-[220px]">
            <table className="w-full border-collapse text-[10px]" data-testid="property-table">
              <thead>
                <tr className="bg-[#e8e8ee]">
                  <th className="text-left px-1.5 py-0.5 border-b border-[#d0d0d8] text-[#6b6b7b] font-medium">Property</th>
                  <th className="text-left px-1.5 py-0.5 border-b border-[#d0d0d8] text-[#6b6b7b] font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {properties.map(([k, v], i) => (
                  <tr key={i} className={i % 2 === 0 ? '' : 'bg-black/[0.03]'}>
                    <td className="px-1.5 py-0.5 border-b border-[#d0d0d8] text-[#2a2a3e]">{k}</td>
                    <td className="px-1.5 py-0.5 border-b border-[#d0d0d8] text-[#2c6eb5] font-mono">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
          <div className="px-1.5 py-1 text-[9px] text-[#9090a0] bg-[rgba(44,110,181,0.06)] border-t border-[#d0d0d8]">
            Press Enter to edit, F1 for Help
          </div>
        </div>
      )}
    </div>
  );
}

interface TreeItemData {
  label: string;
  indent: number;
  expandable?: boolean;
  treeKey?: string;
  icon?: string;
  category?: string;
}

function TreeItem({ label, indent = 0, expandable, isExpanded, onToggle, selected, icon }: TreeItemData & {
  isExpanded?: boolean;
  onToggle?: () => void;
  selected?: boolean;
}) {
  return (
    <div
      onClick={onToggle}
      className={`flex items-center gap-1 rounded cursor-pointer text-[11px] py-0.5 px-1 transition-colors
        ${selected ? 'bg-[#3a5a8a] text-white' : 'text-[#2a2a3e] hover:bg-black/[0.04]'}`}
      style={{ paddingLeft: 8 + indent * 14 }}
    >
      {expandable ? (
        <span className="text-[8px] w-2.5 shrink-0">
          {isExpanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
        </span>
      ) : (
        <span className="w-2.5 shrink-0" />
      )}
      {icon && <span className="text-[10px] opacity-60">{icon}</span>}
      <span className="truncate">{label}</span>
    </div>
  );
}

const OBJECT_TYPES = [
  { value: 'junction', label: 'Junction', collection: 'junctions' },
  { value: 'outfall', label: 'Outfall', collection: 'outfalls' },
  { value: 'storage', label: 'Storage Unit', collection: 'storageUnits' },
  { value: 'divider', label: 'Divider', collection: 'dividers' },
  { value: 'conduit', label: 'Conduit', collection: 'conduits' },
  { value: 'pump', label: 'Pump', collection: 'pumps' },
  { value: 'orifice', label: 'Orifice', collection: 'orifices' },
  { value: 'weir', label: 'Weir', collection: 'weirs' },
  { value: 'outlet', label: 'Outlet', collection: 'outlets' },
  { value: 'subcatchment', label: 'Subcatchment', collection: 'subcatchments' },
  { value: 'raingage', label: 'Rain Gage', collection: 'raingages' },
] as const;

interface ObjectLocatorProps {
  project: SwmmProject;
  onLocate: (objType: string, id: string) => void;
  onClose: () => void;
}

export function ObjectLocatorPanel({ project, onLocate, onClose }: ObjectLocatorProps) {
  const [objType, setObjType] = useState<string>('junction');
  const [searchId, setSearchId] = useState('');
  const [showList, setShowList] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const getObjectIds = (type: string): string[] => {
    const typeDef = OBJECT_TYPES.find(t => t.value === type);
    if (!typeDef) return [];
    const collection = (project as any)[typeDef.collection];
    if (!collection) return [];
    return collection.map((item: any) => item.id);
  };

  const objectIds = useMemo(() => getObjectIds(objType), [objType, project]);

  const handleLocate = () => {
    setErrorMsg('');
    const trimmed = searchId.trim();
    if (!trimmed) {
      setErrorMsg('Enter an object ID');
      return;
    }
    const ids = getObjectIds(objType);
    const found = ids.find((id: string) => id.toLowerCase() === trimmed.toLowerCase());
    if (found) {
      onLocate(objType, found);
      setErrorMsg('');
    } else {
      setErrorMsg(`${OBJECT_TYPES.find(t => t.value === objType)?.label || objType} "${trimmed}" not found`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLocate();
    }
  };

  return (
    <div className="border-b border-[#d0d0d8]" data-testid="object-locator-panel">
      <div className="flex items-center justify-between px-2 py-1.5 bg-[#e8e8ee]">
        <span className="text-[11px] font-bold text-[#2a2a3e]">Object Locator</span>
        <button
          onClick={onClose}
          className="text-[#6b6b7b] hover:text-[#2a2a3e] transition-colors"
          data-testid="btn-locator-close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2 space-y-2">
        <div>
          <label className="text-[9px] text-[#6b6b7b] mb-0.5 block">Object Type</label>
          <select
            value={objType}
            onChange={e => { setObjType(e.target.value); setShowList(false); setErrorMsg(''); }}
            className="w-full text-[10px] rounded px-1.5 py-1"
            style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
            data-testid="select-locator-type"
          >
            {OBJECT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[9px] text-[#6b6b7b] mb-0.5 block">Object ID</label>
          <input
            type="text"
            value={searchId}
            onChange={e => { setSearchId(e.target.value); setErrorMsg(''); }}
            onKeyDown={handleKeyDown}
            placeholder="Enter ID..."
            className="w-full text-[10px] rounded px-1.5 py-1"
            style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
            data-testid="input-locator-id"
          />
        </div>
        {errorMsg && (
          <div className="text-[9px] text-[#d04040]" data-testid="text-locator-error">{errorMsg}</div>
        )}
        <div className="flex gap-1.5">
          <button
            onClick={handleLocate}
            className="flex-1 flex items-center justify-center gap-1 text-[10px] px-2 py-1 rounded bg-[rgba(44,110,181,0.12)] text-[#2c6eb5] border border-[#2c6eb5]/30 hover:bg-[rgba(44,110,181,0.2)] transition-colors"
            data-testid="btn-locator-find"
          >
            <Search className="w-3 h-3" /> Find
          </button>
          <button
            onClick={() => setShowList(!showList)}
            className="flex-1 flex items-center justify-center gap-1 text-[10px] px-2 py-1 rounded border border-[#d0d0d8] text-[#4a4a5a] hover:bg-black/[0.04] transition-colors"
            data-testid="btn-locator-list"
          >
            <List className="w-3 h-3" /> List
          </button>
        </div>
        {showList && (
          <ScrollArea className="max-h-[120px]">
            <div className="space-y-px" data-testid="locator-list">
              {objectIds.length === 0 ? (
                <div className="text-[9px] text-[#9090a0] py-1 text-center">No objects</div>
              ) : (
                objectIds.map((id: string) => (
                  <button
                    key={id}
                    onClick={() => {
                      setSearchId(id);
                      onLocate(objType, id);
                      setShowList(false);
                    }}
                    className="w-full text-left text-[10px] px-1.5 py-0.5 rounded text-[#2a2a3e] hover:bg-black/[0.04] transition-colors cursor-pointer"
                    data-testid={`locator-item-${id}`}
                  >
                    {id}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

function getProperties(
  project: SwmmProject,
  selectedObj: SelectedObject,
  results: import('@/lib/swmm-types').SimulationResults | null,
  timeStep: number,
): [string, string][] {
  if (!selectedObj) return [];

  const { id, objType } = selectedObj;

  if (objType === 'junction') {
    const j = project.junctions.find(n => n.id === id);
    if (!j) return [['ID', id]];
    const props: [string, string][] = [
      ['ID', j.id],
      ['Type', 'Junction'],
      ['Invert El.', j.elevation.toFixed(2)],
      ['Max. Depth', j.maxDepth.toFixed(2)],
      ['Init. Depth', j.initDepth.toFixed(2)],
      ['Surcharge Dp.', j.surDepth.toFixed(2)],
      ['Ponded Area', j.aponded.toString()],
    ];
    if (results?.timeSteps[timeStep]?.nodes[id]) {
      const nr = results.timeSteps[timeStep].nodes[id];
      props.push(
        ['--- Results ---', ''],
        ['Depth (ft)', nr.depth.toFixed(4)],
        ['Head (ft)', nr.head.toFixed(4)],
        ['Inflow (CFS)', nr.totalInflow.toFixed(4)],
        ['Flooding', nr.flooding.toFixed(4)],
      );
    }
    return props;
  }

  if (objType === 'outfall') {
    const o = project.outfalls.find(n => n.id === id);
    if (!o) return [['ID', id]];
    const props: [string, string][] = [
      ['ID', o.id],
      ['Type', 'Outfall'],
      ['Invert El.', o.elevation.toFixed(2)],
      ['Outfall Type', o.type],
      ['Gated', o.gated],
    ];
    if (results?.timeSteps[timeStep]?.nodes[id]) {
      const nr = results.timeSteps[timeStep].nodes[id];
      props.push(
        ['--- Results ---', ''],
        ['Depth (ft)', nr.depth.toFixed(4)],
        ['Total Inflow', nr.totalInflow.toFixed(4)],
      );
    }
    return props;
  }

  if (objType === 'storage') {
    const s = project.storageUnits.find(n => n.id === id);
    if (!s) return [['ID', id]];
    const props: [string, string][] = [
      ['ID', s.id],
      ['Type', 'Storage'],
      ['Invert El.', s.elevation.toFixed(2)],
      ['Max. Depth', s.maxDepth.toFixed(2)],
      ['Init. Depth', s.initDepth.toFixed(2)],
      ['Shape', s.shape],
      ['Evap. Factor', s.fevap.toFixed(2)],
    ];
    if (results?.timeSteps[timeStep]?.nodes[id]) {
      const nr = results.timeSteps[timeStep].nodes[id];
      props.push(
        ['--- Results ---', ''],
        ['Depth (ft)', nr.depth.toFixed(4)],
        ['Volume', nr.volume.toFixed(2)],
        ['Inflow', nr.totalInflow.toFixed(4)],
      );
    }
    return props;
  }

  if (objType === 'subcatchment') {
    const sc = project.subcatchments.find(s => s.id === id);
    if (!sc) return [['ID', id]];
    const props: [string, string][] = [
      ['ID', sc.id],
      ['Rain Gage', sc.rainGage],
      ['Outlet', sc.outlet],
      ['Area (ac)', sc.area.toFixed(2)],
      ['% Imperv', sc.pctImperv.toFixed(1)],
      ['Width (ft)', sc.width.toFixed(0)],
      ['Slope (%)', sc.slope.toFixed(2)],
      ['Curb Len.', sc.curbLen.toString()],
    ];
    const inf = project.infiltration[sc.id];
    if (inf) {
      props.push(['Infiltration', inf.values.map(v => v.toFixed(2)).join(', ')]);
    }
    if (results?.timeSteps[timeStep]?.subcatchments[id]) {
      const sr = results.timeSteps[timeStep].subcatchments[id];
      props.push(
        ['--- Results ---', ''],
        ['Rainfall (in/hr)', sr.rainfall.toFixed(4)],
        ['Runoff (CFS)', sr.runoff.toFixed(4)],
        ['Infiltration', sr.infiltration.toFixed(4)],
      );
    }
    return props;
  }

  if (objType === 'conduit') {
    const c = project.conduits.find(l => l.id === id);
    if (!c) return [['ID', id]];
    const xs = project.xsections[id];
    const props: [string, string][] = [
      ['ID', c.id],
      ['Type', 'Conduit'],
      ['From Node', c.fromNode],
      ['To Node', c.toNode],
      ['Length (ft)', c.length.toFixed(2)],
      ['Roughness', c.roughness.toFixed(4)],
      ['In Offset', c.inOffset.toFixed(2)],
      ['Out Offset', c.outOffset.toFixed(2)],
    ];
    if (xs) {
      props.push(
        ['Shape', xs.shape],
        ['Geom1', typeof xs.geom1 === 'string' ? xs.geom1 : xs.geom1.toFixed(2)],
        ['Barrels', xs.barrels.toString()],
      );
    }
    if (results?.timeSteps[timeStep]?.links[id]) {
      const lr = results.timeSteps[timeStep].links[id];
      props.push(
        ['--- Results ---', ''],
        ['Flow (CFS)', lr.flow.toFixed(4)],
        ['Depth (ft)', lr.depth.toFixed(4)],
        ['Velocity (fps)', lr.velocity.toFixed(4)],
        ['Capacity', lr.capacity.toFixed(4)],
      );
    }
    return props;
  }

  if (objType === 'pump') {
    const p = project.pumps.find(l => l.id === id);
    if (!p) return [['ID', id]];
    const props: [string, string][] = [
      ['ID', p.id],
      ['Type', 'Pump'],
      ['From Node', p.fromNode],
      ['To Node', p.toNode],
      ['Pump Curve', p.pumpCurve],
      ['Status', p.status],
    ];
    if (results?.timeSteps[timeStep]?.links[id]) {
      const lr = results.timeSteps[timeStep].links[id];
      props.push(
        ['--- Results ---', ''],
        ['Flow (CFS)', lr.flow.toFixed(4)],
      );
    }
    return props;
  }

  if (objType === 'weir') {
    const w = project.weirs.find(l => l.id === id);
    if (!w) return [['ID', id]];
    const props: [string, string][] = [
      ['ID', w.id],
      ['Type', 'Weir'],
      ['Weir Type', w.type],
      ['From Node', w.fromNode],
      ['To Node', w.toNode],
      ['Crest Height', w.crestHeight.toFixed(2)],
      ['Disch. Coeff.', w.cd.toFixed(2)],
      ['Gated', w.gated],
    ];
    if (results?.timeSteps[timeStep]?.links[id]) {
      const lr = results.timeSteps[timeStep].links[id];
      props.push(
        ['--- Results ---', ''],
        ['Flow (CFS)', lr.flow.toFixed(4)],
        ['Depth (ft)', lr.depth.toFixed(4)],
      );
    }
    return props;
  }

  if (objType === 'raingage') {
    const rg = project.raingages.find(r => r.id === id);
    if (!rg) return [['ID', id]];
    return [
      ['ID', rg.id],
      ['Format', rg.format],
      ['Interval', rg.interval],
      ['SCF', rg.scf.toString()],
      ['Source', `${rg.sourceType} ${rg.sourceName}`],
    ];
  }

  return [['ID', id], ['Type', objType]];
}

export interface MapQuery {
  objectType: 'node' | 'link' | 'subcatchment';
  property: string;
  operator: '>' | '<' | '=' | '>=' | '<=';
  value: number;
  active: boolean;
  useResults?: boolean;
  resultsTimeStep?: number;
}

const NODE_QUERY_PROPERTIES: [string, string][] = [
  ['elevation', 'Invert Elevation'],
  ['maxDepth', 'Max Depth'],
  ['initDepth', 'Init Depth'],
  ['surDepth', 'Surcharge Depth'],
  ['aponded', 'Ponded Area'],
];

const NODE_RESULTS_PROPERTIES: [string, string][] = [
  ['depth', 'Depth (result)'],
  ['head', 'Head (result)'],
  ['totalInflow', 'Total Inflow (result)'],
  ['flooding', 'Flooding (result)'],
];

const LINK_QUERY_PROPERTIES: [string, string][] = [
  ['length', 'Length'],
  ['roughness', 'Roughness'],
  ['inOffset', 'Inlet Offset'],
  ['outOffset', 'Outlet Offset'],
  ['initFlow', 'Init Flow'],
  ['maxFlow', 'Max Flow'],
];

const LINK_RESULTS_PROPERTIES: [string, string][] = [
  ['flow', 'Flow (result)'],
  ['velocity', 'Velocity (result)'],
  ['depth', 'Depth (result)'],
  ['capacity', 'Capacity (result)'],
];

const SUBCATCH_QUERY_PROPERTIES: [string, string][] = [
  ['area', 'Area'],
  ['pctImperv', '% Imperv'],
  ['width', 'Width'],
  ['slope', 'Slope'],
  ['curbLen', 'Curb Length'],
];

const SUBCATCH_RESULTS_PROPERTIES: [string, string][] = [
  ['runoff', 'Runoff (result)'],
  ['rainfall', 'Rainfall (result)'],
  ['infiltration', 'Infiltration (result)'],
];

function getQueryPropertyOptions(objectType: string, hasResults?: boolean): [string, string][] {
  if (objectType === 'node') return hasResults ? [...NODE_QUERY_PROPERTIES, ...NODE_RESULTS_PROPERTIES] : NODE_QUERY_PROPERTIES;
  if (objectType === 'link') return hasResults ? [...LINK_QUERY_PROPERTIES, ...LINK_RESULTS_PROPERTIES] : LINK_QUERY_PROPERTIES;
  return hasResults ? [...SUBCATCH_QUERY_PROPERTIES, ...SUBCATCH_RESULTS_PROPERTIES] : SUBCATCH_QUERY_PROPERTIES;
}

const RESULT_NODE_PROPS = new Set(['depth', 'head', 'totalInflow', 'flooding', 'volume', 'lateralInflow']);
const RESULT_LINK_PROPS = new Set(['flow', 'velocity', 'capacity']);
const RESULT_SUBCATCH_PROPS = new Set(['runoff', 'rainfall', 'infiltration', 'evap', 'moisture']);

export function evaluateQuery(query: MapQuery, project: SwmmProject, results?: import('@/lib/swmm-types').SimulationResults | null, timeStep?: number): Set<string> {
  const matching = new Set<string>();
  if (!query.active) return matching;

  const compare = (val: number) => {
    switch (query.operator) {
      case '>': return val > query.value;
      case '<': return val < query.value;
      case '=': return Math.abs(val - query.value) < 0.0001;
      case '>=': return val >= query.value;
      case '<=': return val <= query.value;
      default: return false;
    }
  };

  const ts = timeStep ?? 0;
  const stepData = results?.timeSteps[ts];

  if (query.objectType === 'node') {
    const isResultProp = RESULT_NODE_PROPS.has(query.property);
    if (isResultProp && stepData) {
      for (const [nodeId, nr] of Object.entries(stepData.nodes)) {
        const val = (nr as any)[query.property];
        if (val !== undefined && compare(val)) matching.add(nodeId);
      }
    } else {
      const allNodes = [
        ...project.junctions.map(j => ({ id: j.id, elevation: j.elevation, maxDepth: j.maxDepth, initDepth: j.initDepth, surDepth: j.surDepth, aponded: j.aponded })),
        ...project.outfalls.map(o => ({ id: o.id, elevation: o.elevation, maxDepth: 0, initDepth: 0, surDepth: 0, aponded: 0 })),
        ...project.storageUnits.map(s => ({ id: s.id, elevation: s.elevation, maxDepth: s.maxDepth, initDepth: s.initDepth, surDepth: s.surDepth, aponded: 0 })),
        ...project.dividers.map(d => ({ id: d.id, elevation: d.elevation, maxDepth: d.maxDepth, initDepth: d.initDepth, surDepth: d.surDepth, aponded: d.aponded })),
      ];
      for (const node of allNodes) {
        const val = (node as any)[query.property];
        if (val !== undefined && compare(val)) matching.add(node.id);
      }
    }
  } else if (query.objectType === 'link') {
    const isResultProp = RESULT_LINK_PROPS.has(query.property);
    if (isResultProp && stepData) {
      for (const [linkId, lr] of Object.entries(stepData.links)) {
        const val = (lr as any)[query.property];
        if (val !== undefined && compare(val)) matching.add(linkId);
      }
    } else {
      const allLinks = [
        ...project.conduits.map(c => ({ id: c.id, length: c.length, roughness: c.roughness, inOffset: c.inOffset, outOffset: c.outOffset, initFlow: c.initFlow, maxFlow: c.maxFlow })),
        ...project.pumps.map(p => ({ id: p.id, length: 0, roughness: 0, inOffset: 0, outOffset: 0, initFlow: 0, maxFlow: 0 })),
        ...project.weirs.map(w => ({ id: w.id, length: 0, roughness: 0, inOffset: 0, outOffset: 0, initFlow: 0, maxFlow: 0 })),
        ...project.orifices.map(o => ({ id: o.id, length: 0, roughness: 0, inOffset: 0, outOffset: 0, initFlow: 0, maxFlow: 0 })),
        ...project.outlets.map(o => ({ id: o.id, length: 0, roughness: 0, inOffset: 0, outOffset: 0, initFlow: 0, maxFlow: 0 })),
      ];
      for (const link of allLinks) {
        const val = (link as any)[query.property];
        if (val !== undefined && compare(val)) matching.add(link.id);
      }
    }
  } else {
    const isResultProp = RESULT_SUBCATCH_PROPS.has(query.property);
    if (isResultProp && stepData) {
      for (const [scId, sr] of Object.entries(stepData.subcatchments)) {
        const val = (sr as any)[query.property];
        if (val !== undefined && compare(val)) matching.add(scId);
      }
    } else {
      for (const sc of project.subcatchments) {
        const val = (sc as any)[query.property];
        if (val !== undefined && compare(val)) matching.add(sc.id);
      }
    }
  }

  return matching;
}

interface MapQueryPanelProps {
  query: MapQuery;
  onQueryChange: (q: MapQuery) => void;
  onClose: () => void;
  matchCount: number;
  hasResults?: boolean;
}

export function MapQueryPanel({ query, onQueryChange, onClose, matchCount, hasResults }: MapQueryPanelProps) {
  const propertyOptions = getQueryPropertyOptions(query.objectType, hasResults);

  return (
    <div className="p-2.5 space-y-2 border-b border-[#d0d0d8]" data-testid="map-query-panel">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-bold text-[#2a2a3e]">Map Query</span>
        <button
          onClick={onClose}
          className="p-0.5 text-[#6b6b7b] hover:text-[#2a2a3e] transition-colors"
          data-testid="btn-query-close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[#6b6b7b] w-12 shrink-0">Type:</span>
          <select
            value={query.objectType}
            onChange={e => onQueryChange({ ...query, objectType: e.target.value as MapQuery['objectType'], property: getQueryPropertyOptions(e.target.value, hasResults)[0][0], active: false })}
            className="flex-1 text-[10px] rounded px-1 py-0.5"
            style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
            data-testid="select-query-type"
          >
            <option value="node">Node</option>
            <option value="link">Link</option>
            <option value="subcatchment">Subcatchment</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[#6b6b7b] w-12 shrink-0">Prop:</span>
          <select
            value={query.property}
            onChange={e => onQueryChange({ ...query, property: e.target.value, active: false })}
            className="flex-1 text-[10px] rounded px-1 py-0.5"
            style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
            data-testid="select-query-property"
          >
            {propertyOptions.map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[#6b6b7b] w-12 shrink-0">Op:</span>
          <select
            value={query.operator}
            onChange={e => onQueryChange({ ...query, operator: e.target.value as MapQuery['operator'] })}
            className="text-[10px] rounded px-1 py-0.5 w-12"
            style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
            data-testid="select-query-operator"
          >
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value="=">=</option>
            <option value=">=">&gt;=</option>
            <option value="<=">&lt;=</option>
          </select>
          <input
            type="number"
            value={query.value}
            onChange={e => onQueryChange({ ...query, value: parseFloat(e.target.value) || 0 })}
            className="flex-1 text-[10px] rounded px-1 py-0.5"
            style={{ backgroundColor: '#ffffff', color: '#2a2a3e', border: '1px solid #d0d0d8' }}
            data-testid="input-query-value"
          />
        </div>

        <button
          onClick={() => onQueryChange({ ...query, active: true })}
          className="w-full text-[10px] py-1 rounded border transition-colors"
          style={{ backgroundColor: 'rgba(44,110,181,0.12)', borderColor: '#2c6eb5', color: '#2c6eb5' }}
          data-testid="btn-query-submit"
        >
          Run Query
        </button>

        {query.active && (
          <div className="text-[10px] text-[#2a8a4a] text-center" data-testid="text-query-match-count">
            {matchCount} object{matchCount !== 1 ? 's' : ''} matched
          </div>
        )}
      </div>
    </div>
  );
}
