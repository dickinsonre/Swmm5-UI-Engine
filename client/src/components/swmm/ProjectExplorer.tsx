import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { SwmmProject, SelectedObject, SimulationResults } from '@/lib/swmm-types';
import { ChevronDown, ChevronRight, Search, X, FileText, BarChart3, Download } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { exportNodesCsv, exportLinksCsv } from '@/lib/import-export';
import { CrossSectionSvg } from './Panels';

export interface ProjectExplorerProps {
  project: SwmmProject;
  selectedObj: SelectedObject;
  onSelectObj: (obj: SelectedObject) => void;
  results: SimulationResults | null;
  timeStep: number;
  onViewTable?: (section: string) => void;
  onUpdateProject?: (updater: (prev: SwmmProject) => SwmmProject) => void;
}

interface TreeNodeDef {
  id: string;
  label: string;
  icon?: string;
  type: 'group' | 'leaf' | 'editor';
  inpSection?: string;
  countKey?: string;
  category?: string;
  children?: TreeNodeDef[];
}

const SWMM_TREE: TreeNodeDef[] = [
  { id: 'title', label: 'Title / Notes', icon: '📄', type: 'editor', inpSection: 'TITLE' },
  {
    id: 'options', label: 'Analysis Options', icon: '⚙️', type: 'group', children: [
      { id: 'opt-general', label: 'General', type: 'leaf', inpSection: 'OPTIONS' },
      { id: 'opt-hydrology', label: 'Hydrology', type: 'leaf' },
      { id: 'opt-hydraulics', label: 'Hydraulics', type: 'leaf' },
      { id: 'opt-routing', label: 'Routing', type: 'leaf' },
      { id: 'opt-quality', label: 'Quality', type: 'leaf' },
      { id: 'opt-dates', label: 'Dates', type: 'leaf' },
      { id: 'opt-timesteps', label: 'Time Steps', type: 'leaf' },
      { id: 'opt-reporting', label: 'Reporting', type: 'leaf', inpSection: 'REPORT' },
    ]
  },
  {
    id: 'climatology', label: 'Climatology', icon: '🌧️', type: 'group', children: [
      { id: 'raingages', label: 'Rain Gages', type: 'leaf', countKey: 'raingages', category: 'raingages', inpSection: 'RAINGAGES' },
      { id: 'evaporation', label: 'Evaporation', type: 'leaf', inpSection: 'EVAPORATION' },
      { id: 'temperature', label: 'Temperature', type: 'leaf', inpSection: 'TEMPERATURE' },
      { id: 'adjustments', label: 'Adjustments', type: 'leaf', inpSection: 'ADJUSTMENTS' },
      { id: 'snowpacks', label: 'Snow Packs', type: 'leaf', countKey: 'snowpacks', inpSection: 'SNOWPACKS' },
    ]
  },
  {
    id: 'subcatchments', label: 'Subcatchments', icon: '🏞️', type: 'group', countKey: 'subcatchments', children: [
      { id: 'subcatch-list', label: 'Subcatchments', type: 'leaf', countKey: 'subcatchments', category: 'subcatchments', inpSection: 'SUBCATCHMENTS' },
      { id: 'subareas', label: 'Subareas', type: 'leaf', inpSection: 'SUBAREAS' },
      { id: 'infiltration', label: 'Infiltration', type: 'leaf', inpSection: 'INFILTRATION' },
      { id: 'lid-controls', label: 'LID Controls', type: 'leaf', countKey: 'lidControls', inpSection: 'LID_CONTROLS' },
      { id: 'lid-usage', label: 'LID Usage', type: 'leaf', countKey: 'lidUsage', inpSection: 'LID_USAGE' },
      { id: 'aquifers', label: 'Aquifers', type: 'leaf', countKey: 'aquifers', inpSection: 'AQUIFERS' },
      { id: 'groundwater', label: 'Groundwater', type: 'leaf', countKey: 'groundwater', inpSection: 'GROUNDWATER' },
      { id: 'gwf', label: 'GWF', type: 'leaf', countKey: 'gwf', inpSection: 'GWF' },
      { id: 'coverages', label: 'Coverages', type: 'leaf', countKey: 'coverages', inpSection: 'COVERAGES' },
      { id: 'loadings', label: 'Initial Loadings', type: 'leaf', countKey: 'loadings', inpSection: 'LOADINGS' },
    ]
  },
  {
    id: 'nodes', label: 'Network Nodes', icon: '○', type: 'group', children: [
      { id: 'junctions', label: 'Junctions', type: 'leaf', countKey: 'junctions', category: 'junctions', inpSection: 'JUNCTIONS' },
      { id: 'outfalls', label: 'Outfalls', type: 'leaf', countKey: 'outfalls', category: 'outfalls', inpSection: 'OUTFALLS' },
      { id: 'dividers', label: 'Dividers', type: 'leaf', countKey: 'dividers', category: 'dividers', inpSection: 'DIVIDERS' },
      { id: 'storage', label: 'Storage Units', type: 'leaf', countKey: 'storage', category: 'storage', inpSection: 'STORAGE' },
    ]
  },
  {
    id: 'links', label: 'Network Links', icon: '─', type: 'group', children: [
      { id: 'conduits', label: 'Conduits', type: 'leaf', countKey: 'conduits', category: 'conduits', inpSection: 'CONDUITS' },
      { id: 'pumps', label: 'Pumps', type: 'leaf', countKey: 'pumps', category: 'pumps', inpSection: 'PUMPS' },
      { id: 'orifices', label: 'Orifices', type: 'leaf', countKey: 'orifices', category: 'orifices', inpSection: 'ORIFICES' },
      { id: 'weirs', label: 'Weirs', type: 'leaf', countKey: 'weirs', category: 'weirs', inpSection: 'WEIRS' },
      { id: 'outlets', label: 'Outlets', type: 'leaf', countKey: 'outlets', category: 'outlets', inpSection: 'OUTLETS' },
      { id: 'xsections', label: 'Cross-Sections', type: 'leaf', countKey: 'xsections', inpSection: 'XSECTIONS' },
      { id: 'transects', label: 'Transects', type: 'leaf', countKey: 'transects', inpSection: 'TRANSECTS' },
      { id: 'streets', label: 'Streets', type: 'leaf', countKey: 'streets', inpSection: 'STREETS' },
      { id: 'inlets', label: 'Inlets', type: 'leaf', countKey: 'inlets', inpSection: 'INLETS' },
      { id: 'inlet-usage', label: 'Inlet Usage', type: 'leaf', countKey: 'inletUsage', inpSection: 'INLET_USAGE' },
      { id: 'losses', label: 'Losses', type: 'leaf', countKey: 'losses', inpSection: 'LOSSES' },
    ]
  },
  {
    id: 'dryweather', label: 'Dry Weather', icon: '💧', type: 'group', children: [
      { id: 'dwf', label: 'Dry Weather Flow', type: 'leaf', countKey: 'dwf', inpSection: 'DWF' },
      { id: 'rdii', label: 'RDII', type: 'leaf', countKey: 'rdii', inpSection: 'RDII' },
      { id: 'hydrographs', label: 'Hydrographs', type: 'leaf', countKey: 'hydrographs', inpSection: 'HYDROGRAPHS' },
      { id: 'patterns', label: 'Patterns', type: 'leaf', countKey: 'patterns', inpSection: 'PATTERNS' },
    ]
  },
  {
    id: 'inflows', label: 'External Inflows', icon: '📥', type: 'group', children: [
      { id: 'inflows-direct', label: 'Direct Inflows', type: 'leaf', countKey: 'directInflows', inpSection: 'INFLOWS' },
      { id: 'timeseries', label: 'Time Series', type: 'leaf', countKey: 'timeseries', inpSection: 'TIMESERIES' },
      { id: 'curves', label: 'Curves', type: 'leaf', countKey: 'curves', inpSection: 'CURVES' },
    ]
  },
  {
    id: 'quality', label: 'Water Quality', icon: '🧪', type: 'group', children: [
      { id: 'pollutants', label: 'Pollutants', type: 'leaf', countKey: 'pollutants', inpSection: 'POLLUTANTS' },
      { id: 'landuses', label: 'Land Uses', type: 'leaf', countKey: 'landuses', inpSection: 'LANDUSES' },
      { id: 'buildup', label: 'Buildup', type: 'leaf', countKey: 'buildup', inpSection: 'BUILDUP' },
      { id: 'washoff', label: 'Washoff', type: 'leaf', countKey: 'washoff', inpSection: 'WASHOFF' },
      { id: 'treatment', label: 'Treatment', type: 'leaf', countKey: 'treatment', inpSection: 'TREATMENT' },
    ]
  },
  {
    id: 'controls', label: 'Controls', icon: '🔧', type: 'group', children: [
      { id: 'control-rules', label: 'Control Rules', type: 'leaf', countKey: 'controls', inpSection: 'CONTROLS' },
    ]
  },
  {
    id: 'map-gis', label: 'Map / GIS', icon: '🗺️', type: 'group', children: [
      { id: 'coordinates', label: 'Coordinates', type: 'leaf', countKey: 'coordinates', inpSection: 'COORDINATES' },
      { id: 'vertices', label: 'Vertices', type: 'leaf', countKey: 'vertices', inpSection: 'VERTICES' },
      { id: 'polygons', label: 'Polygons', type: 'leaf', countKey: 'polygons', inpSection: 'POLYGONS' },
      { id: 'symbols', label: 'Symbols', type: 'leaf', countKey: 'symbols', inpSection: 'SYMBOLS' },
      { id: 'labels', label: 'Labels', type: 'leaf', countKey: 'labels', inpSection: 'LABELS' },
      { id: 'backdrop', label: 'Backdrop', type: 'leaf', inpSection: 'BACKDROP' },
    ]
  },
  {
    id: 'tags-profiles', label: 'Tags / Profiles', icon: '🏷️', type: 'group', children: [
      { id: 'tags', label: 'Tags', type: 'leaf', countKey: 'tags', inpSection: 'TAGS' },
      { id: 'profiles', label: 'Profiles', type: 'leaf', countKey: 'profiles', inpSection: 'PROFILES' },
    ]
  },
];

function getSectionCount(project: SwmmProject, key: string): number {
  switch (key) {
    case 'raingages': return project.raingages.length;
    case 'subcatchments': return project.subcatchments.length;
    case 'junctions': return project.junctions.length;
    case 'outfalls': return project.outfalls.length;
    case 'dividers': return project.dividers.length;
    case 'storage': return project.storageUnits.length;
    case 'conduits': return project.conduits.length;
    case 'pumps': return project.pumps.length;
    case 'orifices': return project.orifices.length;
    case 'weirs': return project.weirs.length;
    case 'outlets': return project.outlets.length;
    case 'xsections': return Object.keys(project.xsections).length;
    case 'losses': return Object.keys(project.losses).length;
    case 'timeseries': return Object.keys(project.timeseries).length;
    case 'curves': return Object.keys(project.curves).length;
    case 'patterns': return Object.keys(project.patterns).length;
    case 'controls': return project.controls.length;
    case 'dwf': return project.dwf.length;
    case 'pollutants': return project.pollutants.length;
    case 'landuses': return project.landuses.length;
    case 'coordinates': return Object.keys(project.coordinates).length;
    case 'vertices': return Object.keys(project.vertices).length;
    case 'polygons': return Object.keys(project.polygons).length;
    case 'symbols': return Object.keys(project.symbols).length;
    case 'labels': return project.labels.length;
    default: {
      const camelToSection: Record<string, string> = {
        lidControls: 'LID_CONTROLS', lidUsage: 'LID_USAGE', directInflows: 'INFLOWS',
        inletUsage: 'INLET_USAGE', snowpacks: 'SNOWPACKS', aquifers: 'AQUIFERS',
        groundwater: 'GROUNDWATER', gwf: 'GWF', coverages: 'COVERAGES',
        loadings: 'LOADINGS', rdii: 'RDII', hydrographs: 'HYDROGRAPHS',
        buildup: 'BUILDUP', washoff: 'WASHOFF', treatment: 'TREATMENT',
        transects: 'TRANSECTS', streets: 'STREETS', inlets: 'INLETS',
        tags: 'TAGS', profiles: 'PROFILES', backdrop: 'BACKDROP',
      };
      const sectionName = camelToSection[key] || key.toUpperCase().replace(/-/g, '_');
      const raw = project.rawSections[sectionName];
      if (raw) return raw.filter(l => l.trim() && !l.trim().startsWith(';')).length;
      return 0;
    }
  }
}

function getStatusIndicator(count: number, hasResults: boolean): { symbol: string; color: string } {
  if (hasResults && count > 0) return { symbol: '●', color: '#2c6eb5' };
  if (count > 0) return { symbol: '●', color: '#2c6eb5' };
  return { symbol: '○', color: '#b0b0b8' };
}

function getCategoryFromId(id: string): string | null {
  const map: Record<string, string> = {
    'junctions': 'junction', 'outfalls': 'outfall', 'dividers': 'divider',
    'storage': 'storage', 'conduits': 'conduit', 'pumps': 'pump',
    'orifices': 'orifice', 'weirs': 'weir', 'outlets': 'outlet',
    'subcatch-list': 'subcatchment', 'raingages': 'raingage',
  };
  return map[id] || null;
}

function getObjectsForCategory(project: SwmmProject, category: string): { id: string }[] {
  switch (category) {
    case 'junction': return project.junctions;
    case 'outfall': return project.outfalls;
    case 'divider': return project.dividers;
    case 'storage': return project.storageUnits;
    case 'conduit': return project.conduits;
    case 'pump': return project.pumps;
    case 'orifice': return project.orifices;
    case 'weir': return project.weirs;
    case 'outlet': return project.outlets;
    case 'subcatchment': return project.subcatchments;
    case 'raingage': return project.raingages;
    default: return [];
  }
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
  nodeType: 'group' | 'leaf';
  category: string | null;
  countKey?: string;
}

export default function ProjectExplorer({
  project, selectedObj, onSelectObj, results, timeStep, onViewTable, onUpdateProject
}: ProjectExplorerProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    options: false, nodes: true, links: true, subcatchments: false,
  });
  const [searchText, setSearchText] = useState('');
  const [activeLeaf, setActiveLeaf] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [expandedLeaves, setExpandedLeaves] = useState<Record<string, boolean>>({});
  const [showDataGrid, setShowDataGrid] = useState<string | null>(null);
  const [showTitleEditor, setShowTitleEditor] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback((key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleLeaf = useCallback((key: string) => {
    setExpandedLeaves(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    const collectCounts = (nodes: TreeNodeDef[]) => {
      for (const n of nodes) {
        if (n.countKey) c[n.countKey] = getSectionCount(project, n.countKey);
        if (n.children) collectCounts(n.children);
      }
    };
    collectCounts(SWMM_TREE);
    return c;
  }, [project]);

  const handleLeafClick = useCallback((node: TreeNodeDef) => {
    setActiveLeaf(node.id);
    const category = getCategoryFromId(node.id);
    if (category) {
      const count = node.countKey ? getSectionCount(project, node.countKey) : 0;
      if (count > 0) {
        setShowDataGrid(node.id);
      }
      toggleLeaf(node.id);
    }
    if (node.id === 'title') {
      setShowTitleEditor(true);
    }
  }, [toggleLeaf, project]);

  const handleLeafDoubleClick = useCallback((node: TreeNodeDef) => {
    if (node.inpSection && onViewTable) {
      onViewTable(node.inpSection);
    }
  }, [onViewTable]);

  const handleObjectClick = useCallback((category: string, id: string) => {
    onSelectObj({ id, objType: category as NonNullable<SelectedObject>['objType'] });
  }, [onSelectObj]);

  const handleContextMenu = useCallback((e: React.MouseEvent, nodeId: string, nodeType: 'group' | 'leaf', category: string | null, countKey?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId, nodeType, category, countKey });
  }, []);

  const handleExportSection = useCallback((category: string) => {
    let content = '';
    let filename = '';
    if (category === 'junction') {
      content = exportNodesCsv(project);
      filename = 'nodes.csv';
    } else if (category === 'conduit') {
      content = exportLinksCsv(project);
      filename = 'links.csv';
    } else {
      const objects = getObjectsForCategory(project, category);
      const keys = objects.length > 0 ? Object.keys(objects[0]) : [];
      content = keys.join(',') + '\n' + objects.map(o => keys.map(k => (o as any)[k] ?? '').join(',')).join('\n');
      filename = `${category}s.csv`;
    }
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    setContextMenu(null);
  }, [project]);

  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  const filteredTree = useMemo(() => {
    if (!searchText.trim()) return SWMM_TREE;
    const q = searchText.toLowerCase();
    const filterNodes = (nodes: TreeNodeDef[]): TreeNodeDef[] => {
      return nodes.reduce<TreeNodeDef[]>((acc, node) => {
        if (node.label.toLowerCase().includes(q)) {
          acc.push(node);
        } else if (node.children) {
          const filtered = filterNodes(node.children);
          if (filtered.length > 0) acc.push({ ...node, children: filtered });
        }
        return acc;
      }, []);
    };
    return filterNodes(SWMM_TREE);
  }, [searchText]);

  useEffect(() => {
    if (!searchText.trim()) return;
    const q = searchText.toLowerCase();
    const groupsToExpand: Record<string, boolean> = {};
    const findMatchingGroups = (nodes: TreeNodeDef[], ancestors: string[]) => {
      for (const n of nodes) {
        if (n.label.toLowerCase().includes(q)) {
          ancestors.forEach(a => groupsToExpand[a] = true);
        }
        if (n.children) findMatchingGroups(n.children, [...ancestors, n.id]);
      }
    };
    findMatchingGroups(SWMM_TREE, []);
    if (Object.keys(groupsToExpand).length > 0) {
      setExpanded(prev => ({ ...prev, ...groupsToExpand }));
    }
  }, [searchText]);

  const objectSearchResults = useMemo(() => {
    if (!searchText.trim() || searchText.length < 2) return [];
    const q = searchText.toLowerCase();
    const results: { id: string; type: string }[] = [];
    const categories = ['junction', 'outfall', 'divider', 'storage', 'conduit', 'pump', 'orifice', 'weir', 'outlet', 'subcatchment', 'raingage'];
    for (const cat of categories) {
      const objects = getObjectsForCategory(project, cat);
      for (const obj of objects) {
        if (obj.id.toLowerCase().includes(q)) {
          results.push({ id: obj.id, type: cat });
          if (results.length >= 20) return results;
        }
      }
    }
    return results;
  }, [searchText, project]);

  const properties = useMemo(() => getProperties(project, selectedObj, results, timeStep), [project, selectedObj, results, timeStep]);

  const resultsTree = useMemo(() => {
    if (!results) return null;
    return {
      id: 'sim-results', label: 'Simulation Results', icon: '📊', type: 'group' as const,
      children: [
        { id: 'res-summary', label: 'Run Summary', type: 'leaf' as const },
        {
          id: 'res-nodes', label: 'Node Results', type: 'group' as const, children: [
            { id: 'res-node-depth', label: 'Depth', type: 'leaf' as const },
            { id: 'res-node-head', label: 'Head', type: 'leaf' as const },
            { id: 'res-node-inflow', label: 'Inflow', type: 'leaf' as const },
            { id: 'res-node-flooding', label: 'Flooding', type: 'leaf' as const },
          ]
        },
        {
          id: 'res-links', label: 'Link Results', type: 'group' as const, children: [
            { id: 'res-link-flow', label: 'Flow', type: 'leaf' as const },
            { id: 'res-link-velocity', label: 'Velocity', type: 'leaf' as const },
            { id: 'res-link-depth', label: 'Depth', type: 'leaf' as const },
            { id: 'res-link-capacity', label: 'Capacity', type: 'leaf' as const },
          ]
        },
        {
          id: 'res-subcatch', label: 'Subcatchment Results', type: 'group' as const, children: [
            { id: 'res-sc-runoff', label: 'Runoff', type: 'leaf' as const },
            { id: 'res-sc-infiltration', label: 'Infiltration', type: 'leaf' as const },
          ]
        },
      ]
    };
  }, [results]);

  const renderNode = (node: TreeNodeDef, depth: number = 0) => {
    const count = node.countKey ? counts[node.countKey] : undefined;
    const isGroup = node.type === 'group';
    const isExpanded = expanded[node.id] ?? false;
    const isActive = activeLeaf === node.id;
    const category = getCategoryFromId(node.id);
    const hasData = count !== undefined && count > 0;
    const hasResults = !!(results && hasData);
    const status = count !== undefined ? getStatusIndicator(count, hasResults) : null;
    const isDimmed = count !== undefined && count === 0;
    const isLeafExpanded = expandedLeaves[node.id] ?? false;

    return (
      <div key={node.id}>
        <div
          onClick={() => isGroup ? toggle(node.id) : handleLeafClick(node)}
          onDoubleClick={() => { if (!isGroup) handleLeafDoubleClick(node); }}
          onContextMenu={e => handleContextMenu(e, node.id, isGroup ? 'group' : 'leaf', category, node.countKey)}
          className={`flex items-center gap-1 rounded cursor-pointer text-[11px] py-[3px] px-1 transition-colors select-none
            ${isActive ? 'bg-[#2c6eb5]/15 text-[#2c6eb5]' : isDimmed ? 'text-[#b0b0b8] hover:bg-black/[0.03]' : 'text-[#2a2a3e] hover:bg-black/[0.04]'}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          data-testid={`tree-${node.id}`}
        >
          {isGroup ? (
            <span className="w-3 shrink-0 flex items-center justify-center">
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
          ) : category && hasData ? (
            <span className="w-3 shrink-0 flex items-center justify-center">
              {isLeafExpanded ? <ChevronDown className="w-2.5 h-2.5 opacity-50" /> : <ChevronRight className="w-2.5 h-2.5 opacity-50" />}
            </span>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          {status && (
            <span className="text-[8px] shrink-0" style={{ color: status.color }}>{status.symbol}</span>
          )}
          {node.icon && !status && (
            <span className="text-[10px] opacity-60 shrink-0">{node.icon}</span>
          )}
          <span className="truncate flex-1">{node.label}</span>
          {count !== undefined && count > 0 && (
            <span className="text-[9px] shrink-0 tabular-nums bg-[#e2eaf3] text-[#2c6eb5] px-1.5 py-px rounded-full font-medium min-w-[18px] text-center">
              {count}
            </span>
          )}
          {count !== undefined && count === 0 && (
            <span className="text-[9px] shrink-0 tabular-nums text-[#c0c0c8]">
              0
            </span>
          )}
          {hasResults && (
            <BarChart3 className="w-2.5 h-2.5 shrink-0 text-[#2c6eb5] opacity-60" />
          )}
        </div>

        {isGroup && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}

        {!isGroup && category && isLeafExpanded && hasData && (
          <div className="ml-1">
            {getObjectsForCategory(project, category).map(obj => (
              <div
                key={obj.id}
                onClick={(e) => { e.stopPropagation(); handleObjectClick(category, obj.id); }}
                className={`flex items-center gap-1 rounded cursor-pointer text-[10px] py-[2px] px-1 transition-colors
                  ${selectedObj?.id === obj.id && selectedObj?.objType === category
                    ? 'bg-[#2c6eb5] text-white' : 'text-[#4a4a5e] hover:bg-black/[0.04]'}`}
                style={{ paddingLeft: 6 + (depth + 1) * 14 }}
                data-testid={`tree-obj-${obj.id}`}
              >
                <span className="w-2 h-2 shrink-0 rounded-full border" style={{
                  borderColor: selectedObj?.id === obj.id ? '#fff' : '#9090a0',
                  backgroundColor: selectedObj?.id === obj.id ? '#fff' : 'transparent',
                }} />
                <span className="truncate font-mono">{obj.id}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" ref={containerRef} data-testid="project-explorer">
      <div className="text-[11px] font-bold text-center py-1.5 border-b border-[#d0d0d8] text-[#2a2a3e] shrink-0">
        Project Explorer
      </div>

      <div className="px-1 py-1 border-b border-[#d0d0d8] shrink-0">
        <div className="flex items-center gap-1 bg-[#f0f0f4] rounded px-1.5 py-0.5 border border-[#d0d0d8]">
          <Search className="w-3 h-3 text-[#9090a0] shrink-0" />
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Search sections or items..."
            className="flex-1 bg-transparent text-[10px] text-[#2a2a3e] outline-none placeholder:text-[#b0b0b8]"
            onKeyDown={e => { if (e.key === 'Escape') setSearchText(''); }}
            data-testid="explorer-search"
          />
          {searchText && (
            <button onClick={() => setSearchText('')} className="shrink-0" data-testid="explorer-search-clear">
              <X className="w-3 h-3 text-[#9090a0]" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1">
          {filteredTree.map(node => renderNode(node, 0))}

          {resultsTree && (
            <div className="mt-1 pt-1 border-t border-[#d0d0d8]">
              {renderNode(resultsTree, 0)}
            </div>
          )}

          {objectSearchResults.length > 0 && (
            <div className="mt-1 pt-1 border-t border-[#d0d0d8]">
              <div className="text-[9px] text-[#6b6b7b] px-2 py-0.5 font-semibold">Search Results</div>
              {objectSearchResults.map(r => (
                <div
                  key={`${r.type}-${r.id}`}
                  onClick={() => handleObjectClick(r.type, r.id)}
                  className={`flex items-center gap-1.5 rounded cursor-pointer text-[10px] py-[3px] px-2 transition-colors
                    ${selectedObj?.id === r.id ? 'bg-[#2c6eb5] text-white' : 'text-[#2a2a3e] hover:bg-black/[0.04]'}`}
                  data-testid={`search-result-${r.id}`}
                >
                  <span className="text-[9px] bg-[#e8e8ee] text-[#6b6b7b] rounded px-1 py-0 shrink-0">{r.type}</span>
                  <span className="font-mono truncate">{r.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {showTitleEditor && (
        <div className="border-t border-[#d0d0d8] p-2 shrink-0 bg-[#f8f8fa]" data-testid="title-editor">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-[#2a2a3e]">Title / Notes</span>
            <button onClick={() => setShowTitleEditor(false)} className="text-[#9090a0] hover:text-[#2a2a3e]">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="text-[10px] font-mono text-[#4a4a5e] bg-white rounded p-1.5 border border-[#d0d0d8] max-h-16 overflow-y-auto whitespace-pre-wrap">
            {project.title.length > 0 ? project.title.join('\n') : '(no title)'}
          </div>
        </div>
      )}

      {selectedObj && (
        <div className="border-t border-[#d0d0d8] shrink-0" data-testid="property-editor">
          <div className="flex items-center justify-between px-2 py-1 bg-[#e8e8ee]">
            <span className="text-[11px] font-semibold text-[#2a2a3e]">
              {selectedObj.objType.charAt(0).toUpperCase() + selectedObj.objType.slice(1)} {selectedObj.id}
            </span>
          </div>
          <ScrollArea className="max-h-[220px]">
            <PropertyTable
              properties={properties}
              selectedObj={selectedObj}
              project={project}
              onUpdateProject={onUpdateProject}
            />
          </ScrollArea>
          <div className="px-1.5 py-1 text-[9px] text-[#9090a0] bg-[rgba(44,110,181,0.06)] border-t border-[#d0d0d8]">
            Click value to edit. Esc to cancel.
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-[100] min-w-[180px] rounded shadow-lg border bg-white py-1"
          style={{ left: contextMenu.x, top: contextMenu.y, borderColor: '#d0d0d8' }}
          onClick={e => e.stopPropagation()}
          data-testid="context-menu-explorer"
        >
          {contextMenu.nodeType === 'leaf' && contextMenu.category && (
            <>
              <ContextMenuItem
                icon={<FileText className="w-3 h-3" />}
                label="View Table"
                onClick={() => { setShowDataGrid(contextMenu.nodeId); setContextMenu(null); }}
                testId="ctx-view-table"
              />
              <div className="h-px bg-[#e8e8ee] mx-1 my-0.5" />
              <ContextMenuItem
                icon={<Download className="w-3 h-3" />}
                label="Export to CSV..."
                onClick={() => { handleExportSection(contextMenu.category!); }}
                testId="ctx-export-csv"
              />
              <div className="h-px bg-[#e8e8ee] mx-1 my-0.5" />
            </>
          )}
          {contextMenu.nodeType === 'group' && (
            <>
              <ContextMenuItem
                label="Expand All Children"
                onClick={() => {
                  const node = findNode(SWMM_TREE, contextMenu.nodeId);
                  if (node?.children) {
                    const updates: Record<string, boolean> = { [contextMenu.nodeId]: true };
                    node.children.forEach(c => { if (c.type === 'group') updates[c.id] = true; });
                    setExpanded(prev => ({ ...prev, ...updates }));
                  }
                  setContextMenu(null);
                }}
                testId="ctx-expand-all"
              />
              <ContextMenuItem
                label="Collapse All Children"
                onClick={() => {
                  const node = findNode(SWMM_TREE, contextMenu.nodeId);
                  if (node?.children) {
                    const updates: Record<string, boolean> = { [contextMenu.nodeId]: false };
                    node.children.forEach(c => { if (c.type === 'group') updates[c.id] = false; });
                    setExpanded(prev => ({ ...prev, ...updates }));
                  }
                  setContextMenu(null);
                }}
                testId="ctx-collapse-all"
              />
            </>
          )}
        </div>
      )}

      {showDataGrid && (
        <DataGridOverlay
          project={project}
          nodeId={showDataGrid}
          results={results}
          timeStep={timeStep}
          onClose={() => setShowDataGrid(null)}
          onSelectObj={onSelectObj}
          onUpdateProject={onUpdateProject}
        />
      )}
    </div>
  );
}

function findNode(nodes: TreeNodeDef[], id: string): TreeNodeDef | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function ContextMenuItem({ icon, label, onClick, testId }: { icon?: React.ReactNode; label: string; onClick: () => void; testId: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1 text-[11px] text-[#2a2a3e] hover:bg-[#f0f0f4] text-left"
      data-testid={testId}
    >
      {icon}
      {label}
    </button>
  );
}

interface DataGridOverlayProps {
  project: SwmmProject;
  nodeId: string;
  results: SimulationResults | null;
  timeStep: number;
  onClose: () => void;
  onSelectObj: (obj: SelectedObject) => void;
  onUpdateProject?: (updater: (prev: SwmmProject) => SwmmProject) => void;
}

function DataGridOverlay({ project, nodeId, results, timeStep, onClose, onSelectObj, onUpdateProject }: DataGridOverlayProps) {
  const category = getCategoryFromId(nodeId);
  if (!category) return null;

  const objects = getObjectsForCategory(project, category);
  if (objects.length === 0) return null;

  const columns = getColumnsForCategory(project, category, results, timeStep);

  return (
    <div className="fixed inset-0 z-[90] bg-black/30 flex items-center justify-center p-4" onClick={onClose} data-testid="data-grid-overlay">
      <div
        className="bg-white rounded-lg shadow-xl border border-[#d0d0d8] max-w-4xl w-full max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#d0d0d8] bg-[#f0f0f4] rounded-t-lg shrink-0">
          <span className="text-sm font-semibold text-[#2a2a3e]">
            {category.charAt(0).toUpperCase() + category.slice(1)}s — {objects.length} items
          </span>
          <button onClick={onClose} className="text-[#6b6b7b] hover:text-[#2a2a3e]" data-testid="btn-close-grid">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0">
              <tr className="bg-[#e8e8ee]">
                {columns.map(col => (
                  <th key={col.key} className="text-left px-2 py-1.5 border-b border-[#d0d0d8] text-[#6b6b7b] font-medium whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {objects.map((obj, idx) => (
                <DataGridRow
                  key={obj.id}
                  obj={obj}
                  idx={idx}
                  category={category}
                  columns={columns}
                  project={project}
                  results={results}
                  timeStep={timeStep}
                  onSelectObj={onSelectObj}
                  onUpdateProject={onUpdateProject}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface EditableDef { field: string; collection: string; type?: 'string' }

const GRID_EDITABLE_COLS: Record<string, Record<string, EditableDef>> = {
  junction: {
    elev: { field: 'elevation', collection: 'junctions' },
    maxDepth: { field: 'maxDepth', collection: 'junctions' },
    initDepth: { field: 'initDepth', collection: 'junctions' },
    surDepth: { field: 'surDepth', collection: 'junctions' },
    aponded: { field: 'aponded', collection: 'junctions' },
  },
  outfall: {
    elev: { field: 'elevation', collection: 'outfalls' },
    type: { field: 'type', collection: 'outfalls', type: 'string' },
    stageData: { field: 'stageData', collection: 'outfalls', type: 'string' },
    gated: { field: 'gated', collection: 'outfalls', type: 'string' },
    routeTo: { field: 'routeTo', collection: 'outfalls', type: 'string' },
  },
  storage: {
    elev: { field: 'elevation', collection: 'storageUnits' },
    maxDepth: { field: 'maxDepth', collection: 'storageUnits' },
    initDepth: { field: 'initDepth', collection: 'storageUnits' },
    shape: { field: 'shape', collection: 'storageUnits', type: 'string' },
    evapFrac: { field: 'fevap', collection: 'storageUnits' },
  },
  conduit: {
    from: { field: 'fromNode', collection: 'conduits', type: 'string' },
    to: { field: 'toNode', collection: 'conduits', type: 'string' },
    length: { field: 'length', collection: 'conduits' },
    roughness: { field: 'roughness', collection: 'conduits' },
    inOffset: { field: 'inOffset', collection: 'conduits' },
    outOffset: { field: 'outOffset', collection: 'conduits' },
    initFlow: { field: 'initFlow', collection: 'conduits' },
    maxFlow: { field: 'maxFlow', collection: 'conduits' },
  },
  subcatchment: {
    raingage: { field: 'rainGage', collection: 'subcatchments', type: 'string' },
    outlet: { field: 'outlet', collection: 'subcatchments', type: 'string' },
    area: { field: 'area', collection: 'subcatchments' },
    pctImperv: { field: 'pctImperv', collection: 'subcatchments' },
    width: { field: 'width', collection: 'subcatchments' },
    slope: { field: 'slope', collection: 'subcatchments' },
    curbLen: { field: 'curbLen', collection: 'subcatchments' },
    snowPack: { field: 'snowPack', collection: 'subcatchments', type: 'string' },
    nImperv: { field: 'nImperv', collection: 'subareas' },
    nPerv: { field: 'nPerv', collection: 'subareas' },
    sImperv: { field: 'sImperv', collection: 'subareas' },
    sPerv: { field: 'sPerv', collection: 'subareas' },
    pctZero: { field: 'pctZero', collection: 'subareas' },
  },
  pump: {
    from: { field: 'fromNode', collection: 'pumps', type: 'string' },
    to: { field: 'toNode', collection: 'pumps', type: 'string' },
    curve: { field: 'pumpCurve', collection: 'pumps', type: 'string' },
    status: { field: 'status', collection: 'pumps', type: 'string' },
    startup: { field: 'startupDepth', collection: 'pumps' },
    shutoff: { field: 'shutoffDepth', collection: 'pumps' },
  },
  weir: {
    from: { field: 'fromNode', collection: 'weirs', type: 'string' },
    to: { field: 'toNode', collection: 'weirs', type: 'string' },
    type: { field: 'type', collection: 'weirs', type: 'string' },
    crest: { field: 'crestHeight', collection: 'weirs' },
    cd: { field: 'cd', collection: 'weirs' },
    ec: { field: 'ec', collection: 'weirs' },
    flapGate: { field: 'gated', collection: 'weirs', type: 'string' },
  },
  orifice: {
    from: { field: 'fromNode', collection: 'orifices', type: 'string' },
    to: { field: 'toNode', collection: 'orifices', type: 'string' },
    type: { field: 'type', collection: 'orifices', type: 'string' },
    offset: { field: 'offset', collection: 'orifices' },
    cd: { field: 'cd', collection: 'orifices' },
    flapGate: { field: 'gated', collection: 'orifices', type: 'string' },
  },
  outlet: {
    from: { field: 'fromNode', collection: 'outlets', type: 'string' },
    to: { field: 'toNode', collection: 'outlets', type: 'string' },
    offset: { field: 'offset', collection: 'outlets' },
    type: { field: 'type', collection: 'outlets', type: 'string' },
    curve: { field: 'curveOrTable', collection: 'outlets', type: 'string' },
  },
  divider: {
    elev: { field: 'elevation', collection: 'dividers' },
    divertedLink: { field: 'divertedLink', collection: 'dividers', type: 'string' },
    type: { field: 'type', collection: 'dividers', type: 'string' },
    maxDepth: { field: 'maxDepth', collection: 'dividers' },
    initDepth: { field: 'initDepth', collection: 'dividers' },
  },
  raingage: {
    format: { field: 'format', collection: 'raingages', type: 'string' },
    interval: { field: 'interval', collection: 'raingages', type: 'string' },
    scf: { field: 'scf', collection: 'raingages' },
    source: { field: 'sourceType', collection: 'raingages', type: 'string' },
    tsName: { field: 'sourceName', collection: 'raingages', type: 'string' },
  },
};

function DataGridRow({ obj, idx, category, columns, project, results, timeStep, onSelectObj, onUpdateProject }: {
  obj: any;
  idx: number;
  category: string;
  columns: ColumnDef[];
  project: SwmmProject;
  results: SimulationResults | null;
  timeStep: number;
  onSelectObj: (obj: SelectedObject) => void;
  onUpdateProject?: (updater: (prev: SwmmProject) => SwmmProject) => void;
}) {
  const [editCell, setEditCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const committedRef = useRef(false);

  const commitEdit = useCallback((colKey: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (!onUpdateProject) { setEditCell(null); return; }
    const editable = GRID_EDITABLE_COLS[category]?.[colKey];
    if (!editable) { setEditCell(null); return; }
    const isStr = editable.type === 'string';
    const trimmed = editValue.trim();
    const val = isStr ? trimmed : parseFloat(trimmed);
    if (!isStr && isNaN(val as number)) { setEditCell(null); return; }
    if (isStr && !trimmed) { setEditCell(null); return; }
    const { field, collection } = editable;
    onUpdateProject(prev => {
      const target = (prev as any)[collection];
      if (Array.isArray(target)) {
        const updated = target.map((item: any) =>
          item.id === obj.id ? { ...item, [field]: val } : item
        );
        return { ...prev, [collection]: updated };
      }
      if (target && typeof target === 'object') {
        const entry = target[obj.id] || {};
        return { ...prev, [collection]: { ...target, [obj.id]: { ...entry, [field]: val } } };
      }
      return prev;
    });
    setEditCell(null);
  }, [editValue, category, obj.id, onUpdateProject]);

  return (
    <tr
      className={`cursor-pointer transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'} hover:bg-[#e8f0fb]`}
      data-testid={`grid-row-${obj.id}`}
    >
      {columns.map(col => {
        const isEditable = !!GRID_EDITABLE_COLS[category]?.[col.key] && !!onUpdateProject;
        const isEditing = editCell === col.key;
        const displayVal = col.getValue(obj, project, results, timeStep);

        if (isEditing) {
          const isStrField = GRID_EDITABLE_COLS[category]?.[col.key]?.type === 'string';
          return (
            <td key={col.key} className="px-1 py-0.5 border-b border-[#f0f0f4]">
              <input
                type={isStrField ? 'text' : 'number'}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitEdit(col.key)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit(col.key);
                  if (e.key === 'Escape') setEditCell(null);
                }}
                autoFocus
                className="w-full text-[11px] font-mono px-1 py-0.5 border border-[#2c6eb5] rounded outline-none bg-white text-[#2a2a3e]"
                data-testid={`grid-cell-edit-${obj.id}-${col.key}`}
              />
            </td>
          );
        }

        return (
          <td
            key={col.key}
            className={`px-2 py-1 border-b border-[#f0f0f4] text-[#2a2a3e] font-mono whitespace-nowrap ${isEditable ? 'cursor-text hover:bg-[#e0edfa]' : ''}`}
            onClick={() => {
              if (isEditable) {
                committedRef.current = false;
                setEditCell(col.key);
                setEditValue(displayVal);
              } else {
                onSelectObj({ id: obj.id, objType: category as NonNullable<SelectedObject>['objType'] });
              }
            }}
            data-testid={`grid-cell-${obj.id}-${col.key}`}
          >
            {col.render ? col.render(obj, project) : displayVal}
          </td>
        );
      })}
    </tr>
  );
}

interface ColumnDef {
  key: string;
  label: string;
  getValue: (obj: any, project: SwmmProject, results: SimulationResults | null, timeStep: number) => string;
  render?: (obj: any, project: SwmmProject) => React.ReactNode;
}

function getColumnsForCategory(project: SwmmProject, category: string, results: SimulationResults | null, timeStep: number): ColumnDef[] {
  const base: ColumnDef[] = [{ key: 'id', label: 'ID', getValue: (o) => o.id }];

  switch (category) {
    case 'junction':
      base.push(
        { key: 'elev', label: 'Elevation', getValue: o => o.elevation?.toFixed(2) ?? '' },
        { key: 'maxDepth', label: 'Max Depth', getValue: o => o.maxDepth?.toFixed(2) ?? '' },
        { key: 'initDepth', label: 'Init Depth', getValue: o => o.initDepth?.toFixed(2) ?? '' },
        { key: 'surDepth', label: 'Sur Depth', getValue: o => o.surDepth?.toFixed(2) ?? '' },
        { key: 'aponded', label: 'Ponded', getValue: o => o.aponded?.toString() ?? '' },
      );
      if (results) {
        base.push(
          { key: 'r_depth', label: 'Depth*', getValue: (o, _p, r, ts) => r?.timeSteps[ts]?.nodes[o.id]?.depth?.toFixed(3) ?? '' },
          { key: 'r_head', label: 'Head*', getValue: (o, _p, r, ts) => r?.timeSteps[ts]?.nodes[o.id]?.head?.toFixed(3) ?? '' },
        );
      }
      break;
    case 'outfall':
      base.push(
        { key: 'elev', label: 'Elevation', getValue: o => o.elevation?.toFixed(2) ?? '' },
        { key: 'type', label: 'Type', getValue: o => o.type ?? '' },
        { key: 'stageData', label: 'Stage Data', getValue: o => o.stageData ?? '' },
        { key: 'gated', label: 'Gated', getValue: o => o.gated ?? '' },
        { key: 'routeTo', label: 'Route To', getValue: o => o.routeTo ?? '' },
      );
      break;
    case 'storage':
      base.push(
        { key: 'elev', label: 'Elevation', getValue: o => o.elevation?.toFixed(2) ?? '' },
        { key: 'maxDepth', label: 'Max Depth', getValue: o => o.maxDepth?.toFixed(2) ?? '' },
        { key: 'initDepth', label: 'Init Depth', getValue: o => o.initDepth?.toFixed(2) ?? '0' },
        { key: 'shape', label: 'Shape', getValue: o => o.shape ?? '' },
        { key: 'evapFrac', label: 'Evap Frac', getValue: o => o.fevap?.toFixed(2) ?? '0' },
      );
      break;
    case 'conduit':
      base.push(
        { key: 'from', label: 'From', getValue: o => o.fromNode ?? '' },
        { key: 'to', label: 'To', getValue: o => o.toNode ?? '' },
        { key: 'length', label: 'Length', getValue: o => o.length?.toFixed(2) ?? '' },
        { key: 'roughness', label: 'Roughness', getValue: o => o.roughness?.toFixed(4) ?? '' },
        { key: 'inOffset', label: 'In Offset', getValue: o => o.inOffset?.toFixed(2) ?? '0' },
        { key: 'outOffset', label: 'Out Offset', getValue: o => o.outOffset?.toFixed(2) ?? '0' },
        { key: 'initFlow', label: 'Init Flow', getValue: o => o.initFlow?.toFixed(2) ?? '0' },
        { key: 'maxFlow', label: 'Max Flow', getValue: o => o.maxFlow?.toFixed(0) ?? '0' },
        { key: 'shape', label: 'Shape', getValue: (o, p) => p.xsections[o.id]?.shape ?? '' },
        { key: 'geom1', label: 'Geom1', getValue: (o, p) => { const g = p.xsections[o.id]?.geom1; return g == null ? '' : typeof g === 'string' ? g : g.toFixed(2); } },
        {
          key: 'section', label: 'Section',
          getValue: (o, p) => p.xsections[o.id]?.shape ?? '',
          render: (o, p) => {
            const xs = p.xsections[o.id];
            if (!xs) return null;
            return <span className="inline-block align-middle" data-testid={`xsection-thumb-${o.id}`}><CrossSectionSvg xs={xs} size={22} /></span>;
          },
        },
      );
      if (results) {
        base.push(
          { key: 'r_flow', label: 'Flow*', getValue: (o, _p, r, ts) => r?.timeSteps[ts]?.links[o.id]?.flow?.toFixed(3) ?? '' },
          { key: 'r_vel', label: 'Velocity*', getValue: (o, _p, r, ts) => r?.timeSteps[ts]?.links[o.id]?.velocity?.toFixed(3) ?? '' },
        );
      }
      break;
    case 'pump':
      base.push(
        { key: 'from', label: 'From', getValue: o => o.fromNode ?? '' },
        { key: 'to', label: 'To', getValue: o => o.toNode ?? '' },
        { key: 'curve', label: 'Curve', getValue: o => o.pumpCurve ?? '' },
        { key: 'status', label: 'Status', getValue: o => o.status ?? '' },
        { key: 'startup', label: 'Startup Depth', getValue: o => o.startupDepth?.toFixed(2) ?? '' },
        { key: 'shutoff', label: 'Shutoff Depth', getValue: o => o.shutoffDepth?.toFixed(2) ?? '' },
      );
      break;
    case 'weir':
      base.push(
        { key: 'from', label: 'From', getValue: o => o.fromNode ?? '' },
        { key: 'to', label: 'To', getValue: o => o.toNode ?? '' },
        { key: 'type', label: 'Type', getValue: o => o.type ?? '' },
        { key: 'crest', label: 'Crest Ht', getValue: o => o.crestHeight?.toFixed(2) ?? '' },
        { key: 'cd', label: 'Disch Coef', getValue: o => o.cd?.toFixed(2) ?? '' },
        { key: 'ec', label: 'End Coef', getValue: o => o.ec?.toFixed(2) ?? '' },
        { key: 'flapGate', label: 'Flap Gate', getValue: o => o.gated ?? 'NO' },
      );
      break;
    case 'orifice':
      base.push(
        { key: 'from', label: 'From', getValue: o => o.fromNode ?? '' },
        { key: 'to', label: 'To', getValue: o => o.toNode ?? '' },
        { key: 'type', label: 'Type', getValue: o => o.type ?? '' },
        { key: 'offset', label: 'Offset', getValue: o => o.offset?.toFixed(2) ?? '' },
        { key: 'cd', label: 'Disch Coef', getValue: o => o.cd?.toFixed(2) ?? '' },
        { key: 'flapGate', label: 'Flap Gate', getValue: o => o.gated ?? 'NO' },
      );
      break;
    case 'subcatchment':
      base.push(
        { key: 'raingage', label: 'Rain Gage', getValue: o => o.rainGage ?? '' },
        { key: 'outlet', label: 'Outlet', getValue: o => o.outlet ?? '' },
        { key: 'area', label: 'Area', getValue: o => o.area?.toFixed(2) ?? '' },
        { key: 'pctImperv', label: '% Imperv', getValue: o => o.pctImperv?.toFixed(1) ?? '' },
        { key: 'width', label: 'Width', getValue: o => o.width?.toFixed(0) ?? '' },
        { key: 'slope', label: 'Slope %', getValue: o => o.slope?.toFixed(2) ?? '' },
        { key: 'curbLen', label: 'Curb Len', getValue: o => o.curbLen?.toFixed(0) ?? '0' },
        { key: 'nImperv', label: 'N-Imperv', getValue: (o, p) => p.subareas[o.id]?.nImperv?.toFixed(3) ?? '' },
        { key: 'nPerv', label: 'N-Perv', getValue: (o, p) => p.subareas[o.id]?.nPerv?.toFixed(3) ?? '' },
        { key: 'sImperv', label: 'S-Imperv', getValue: (o, p) => p.subareas[o.id]?.sImperv?.toFixed(2) ?? '' },
        { key: 'sPerv', label: 'S-Perv', getValue: (o, p) => p.subareas[o.id]?.sPerv?.toFixed(2) ?? '' },
        { key: 'pctZero', label: '% Zero', getValue: (o, p) => p.subareas[o.id]?.pctZero?.toFixed(0) ?? '' },
      );
      break;
    case 'outlet':
      base.push(
        { key: 'from', label: 'From', getValue: o => o.fromNode ?? '' },
        { key: 'to', label: 'To', getValue: o => o.toNode ?? '' },
        { key: 'offset', label: 'Offset', getValue: o => o.offset?.toFixed(2) ?? '' },
        { key: 'type', label: 'Type', getValue: o => o.type ?? '' },
        { key: 'curve', label: 'Curve', getValue: o => o.curveOrTable ?? '' },
      );
      if (results) {
        base.push(
          { key: 'r_flow', label: 'Flow*', getValue: (o, _p, r, ts) => r?.timeSteps[ts]?.links[o.id]?.flow?.toFixed(3) ?? '' },
        );
      }
      break;
    case 'divider':
      base.push(
        { key: 'elev', label: 'Elevation', getValue: o => o.elevation?.toFixed(2) ?? '' },
        { key: 'divertedLink', label: 'Div. Link', getValue: o => o.divertedLink ?? '' },
        { key: 'type', label: 'Type', getValue: o => o.type ?? '' },
        { key: 'maxDepth', label: 'Max Depth', getValue: o => o.maxDepth?.toFixed(2) ?? '' },
        { key: 'initDepth', label: 'Init Depth', getValue: o => o.initDepth?.toFixed(2) ?? '0' },
      );
      if (results) {
        base.push(
          { key: 'r_depth', label: 'Depth*', getValue: (o, _p, r, ts) => r?.timeSteps[ts]?.nodes[o.id]?.depth?.toFixed(3) ?? '' },
        );
      }
      break;
    case 'raingage':
      base.push(
        { key: 'format', label: 'Format', getValue: o => o.format ?? '' },
        { key: 'interval', label: 'Interval', getValue: o => o.interval ?? '' },
        { key: 'scf', label: 'SCF', getValue: o => o.scf?.toString() ?? '' },
        { key: 'source', label: 'Source', getValue: o => o.source ?? o.sourceType ?? '' },
        { key: 'tsName', label: 'TS Name', getValue: o => o.tsName ?? o.sourceName ?? '' },
      );
      break;
  }

  return base;
}

const EDITABLE_FIELDS: Record<string, Record<string, EditableDef>> = {
  junction: {
    'Invert El.': { field: 'elevation', collection: 'junctions' },
    'Max. Depth': { field: 'maxDepth', collection: 'junctions' },
    'Init. Depth': { field: 'initDepth', collection: 'junctions' },
    'Surcharge Dp.': { field: 'surDepth', collection: 'junctions' },
    'Ponded Area': { field: 'aponded', collection: 'junctions' },
  },
  outfall: {
    'Invert El.': { field: 'elevation', collection: 'outfalls' },
    'Outfall Type': { field: 'type', collection: 'outfalls', type: 'string' },
    'Gated': { field: 'gated', collection: 'outfalls', type: 'string' },
  },
  storage: {
    'Invert El.': { field: 'elevation', collection: 'storageUnits' },
    'Max. Depth': { field: 'maxDepth', collection: 'storageUnits' },
    'Init. Depth': { field: 'initDepth', collection: 'storageUnits' },
    'Shape': { field: 'shape', collection: 'storageUnits', type: 'string' },
    'Evap. Factor': { field: 'fevap', collection: 'storageUnits' },
  },
  conduit: {
    'From Node': { field: 'fromNode', collection: 'conduits', type: 'string' },
    'To Node': { field: 'toNode', collection: 'conduits', type: 'string' },
    'Length (ft)': { field: 'length', collection: 'conduits' },
    'Roughness': { field: 'roughness', collection: 'conduits' },
    'In Offset': { field: 'inOffset', collection: 'conduits' },
    'Out Offset': { field: 'outOffset', collection: 'conduits' },
  },
  subcatchment: {
    'Rain Gage': { field: 'rainGage', collection: 'subcatchments', type: 'string' },
    'Outlet': { field: 'outlet', collection: 'subcatchments', type: 'string' },
    'Area (ac)': { field: 'area', collection: 'subcatchments' },
    '% Imperv': { field: 'pctImperv', collection: 'subcatchments' },
    'Width (ft)': { field: 'width', collection: 'subcatchments' },
    'Slope (%)': { field: 'slope', collection: 'subcatchments' },
    'Curb Len.': { field: 'curbLen', collection: 'subcatchments' },
  },
  pump: {
    'From Node': { field: 'fromNode', collection: 'pumps', type: 'string' },
    'To Node': { field: 'toNode', collection: 'pumps', type: 'string' },
    'Pump Curve': { field: 'pumpCurve', collection: 'pumps', type: 'string' },
    'Status': { field: 'status', collection: 'pumps', type: 'string' },
    'Startup Depth': { field: 'startupDepth', collection: 'pumps' },
    'Shutoff Depth': { field: 'shutoffDepth', collection: 'pumps' },
  },
  weir: {
    'From Node': { field: 'fromNode', collection: 'weirs', type: 'string' },
    'To Node': { field: 'toNode', collection: 'weirs', type: 'string' },
    'Weir Type': { field: 'type', collection: 'weirs', type: 'string' },
    'Crest Height': { field: 'crestHeight', collection: 'weirs' },
    'Disch. Coeff.': { field: 'cd', collection: 'weirs' },
    'Gated': { field: 'gated', collection: 'weirs', type: 'string' },
    'End Coeff.': { field: 'ec', collection: 'weirs' },
    'Cd2': { field: 'cd2', collection: 'weirs' },
    'Surcharge': { field: 'surcharge', collection: 'weirs', type: 'string' },
  },
  orifice: {
    'From Node': { field: 'fromNode', collection: 'orifices', type: 'string' },
    'To Node': { field: 'toNode', collection: 'orifices', type: 'string' },
    'Orifice Type': { field: 'type', collection: 'orifices', type: 'string' },
    'Offset': { field: 'offset', collection: 'orifices' },
    'Disch. Coeff.': { field: 'cd', collection: 'orifices' },
    'Gated': { field: 'gated', collection: 'orifices', type: 'string' },
    'Close Time': { field: 'closeTime', collection: 'orifices' },
  },
  divider: {
    'Invert El.': { field: 'elevation', collection: 'dividers' },
    'Diverted Link': { field: 'divertedLink', collection: 'dividers', type: 'string' },
    'Divider Type': { field: 'type', collection: 'dividers', type: 'string' },
    'Max. Depth': { field: 'maxDepth', collection: 'dividers' },
    'Init. Depth': { field: 'initDepth', collection: 'dividers' },
    'Surcharge Dp.': { field: 'surDepth', collection: 'dividers' },
    'Ponded Area': { field: 'aponded', collection: 'dividers' },
  },
  outlet: {
    'From Node': { field: 'fromNode', collection: 'outlets', type: 'string' },
    'To Node': { field: 'toNode', collection: 'outlets', type: 'string' },
    'Offset': { field: 'offset', collection: 'outlets' },
    'Outlet Type': { field: 'type', collection: 'outlets', type: 'string' },
    'Curve/Table': { field: 'curveOrTable', collection: 'outlets', type: 'string' },
  },
  raingage: {
    'Format': { field: 'format', collection: 'raingages', type: 'string' },
    'Interval': { field: 'interval', collection: 'raingages', type: 'string' },
    'SCF': { field: 'scf', collection: 'raingages' },
  },
};

function PropertyTable({ properties, selectedObj, project, onUpdateProject }: {
  properties: [string, string][];
  selectedObj: NonNullable<SelectedObject>;
  project: SwmmProject;
  onUpdateProject?: (updater: (prev: SwmmProject) => SwmmProject) => void;
}) {
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleStartEdit = useCallback((idx: number, value: string) => {
    if (!onUpdateProject) return;
    const propName = properties[idx][0];
    const editable = EDITABLE_FIELDS[selectedObj.objType]?.[propName];
    if (!editable) return;
    setEditingRow(idx);
    setEditValue(value);
  }, [properties, selectedObj, onUpdateProject]);

  const handleCommitEdit = useCallback(() => {
    if (editingRow === null || !onUpdateProject) return;
    const propName = properties[editingRow][0];
    const editable = EDITABLE_FIELDS[selectedObj.objType]?.[propName];
    if (!editable) { setEditingRow(null); return; }

    const isStr = editable.type === 'string';
    const trimmed = editValue.trim();
    const val = isStr ? trimmed : parseFloat(trimmed);
    if (!isStr && isNaN(val as number)) { setEditingRow(null); return; }
    if (isStr && !trimmed) { setEditingRow(null); return; }

    const { field, collection } = editable;
    const id = selectedObj.id;

    onUpdateProject(prev => {
      const target = (prev as any)[collection];
      if (Array.isArray(target)) {
        const updated = target.map((item: any) =>
          item.id === id ? { ...item, [field]: val } : item
        );
        return { ...prev, [collection]: updated };
      }
      if (target && typeof target === 'object') {
        const entry = target[id] || {};
        return { ...prev, [collection]: { ...target, [id]: { ...entry, [field]: val } } };
      }
      return prev;
    });
    setEditingRow(null);
  }, [editingRow, editValue, properties, selectedObj, onUpdateProject]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCommitEdit(); }
    else if (e.key === 'Escape') { setEditingRow(null); }
  }, [handleCommitEdit]);

  return (
    <table className="w-full border-collapse text-[10px]" data-testid="property-table">
      <thead>
        <tr className="bg-[#e8e8ee]">
          <th className="text-left px-1.5 py-0.5 border-b border-[#d0d0d8] text-[#6b6b7b] font-medium">Property</th>
          <th className="text-left px-1.5 py-0.5 border-b border-[#d0d0d8] text-[#6b6b7b] font-medium">Value</th>
        </tr>
      </thead>
      <tbody>
        {properties.map(([k, v], i) => {
          const isEditable = !!EDITABLE_FIELDS[selectedObj.objType]?.[k] && !!onUpdateProject;
          const isEditing = editingRow === i;
          return (
            <tr key={i} className={i % 2 === 0 ? '' : 'bg-black/[0.03]'}>
              <td className="px-1.5 py-0.5 border-b border-[#d0d0d8] text-[#2a2a3e]">{k}</td>
              <td
                className={`px-1.5 py-0.5 border-b border-[#d0d0d8] font-mono ${isEditable ? 'cursor-pointer hover:bg-[#2c6eb5]/10' : ''} ${isEditing ? 'p-0' : 'text-[#2c6eb5]'}`}
                onClick={() => isEditable && !isEditing && handleStartEdit(i, v)}
                data-testid={`prop-value-${k.replace(/[^a-zA-Z0-9]/g, '-')}`}
              >
                {isEditing ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={handleCommitEdit}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    className="w-full px-1 py-0.5 text-[10px] font-mono border border-[#2c6eb5] rounded bg-white text-[#2a2a3e] outline-none"
                    data-testid={`prop-input-${k.replace(/[^a-zA-Z0-9]/g, '-')}`}
                  />
                ) : (
                  <span>{v}</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function getProperties(
  project: SwmmProject,
  selectedObj: SelectedObject,
  results: SimulationResults | null,
  timeStep: number,
): [string, string][] {
  if (!selectedObj) return [];
  const { id, objType } = selectedObj;

  if (objType === 'junction') {
    const j = project.junctions.find(n => n.id === id);
    if (!j) return [['ID', id]];
    const props: [string, string][] = [
      ['ID', j.id], ['Type', 'Junction'], ['Invert El.', j.elevation.toFixed(2)],
      ['Max. Depth', j.maxDepth.toFixed(2)], ['Init. Depth', j.initDepth.toFixed(2)],
      ['Surcharge Dp.', j.surDepth.toFixed(2)], ['Ponded Area', j.aponded.toString()],
    ];
    if (results?.timeSteps[timeStep]?.nodes[id]) {
      const nr = results.timeSteps[timeStep].nodes[id];
      props.push(['--- Results ---', ''], ['Depth (ft)', nr.depth.toFixed(4)], ['Head (ft)', nr.head.toFixed(4)],
        ['Inflow (CFS)', nr.totalInflow.toFixed(4)], ['Flooding', nr.flooding.toFixed(4)]);
    }
    return props;
  }
  if (objType === 'outfall') {
    const o = project.outfalls.find(n => n.id === id);
    if (!o) return [['ID', id]];
    const props: [string, string][] = [['ID', o.id], ['Type', 'Outfall'], ['Invert El.', o.elevation.toFixed(2)], ['Outfall Type', o.type], ['Gated', o.gated]];
    if (results?.timeSteps[timeStep]?.nodes[id]) {
      const nr = results.timeSteps[timeStep].nodes[id];
      props.push(['--- Results ---', ''], ['Depth (ft)', nr.depth.toFixed(4)], ['Total Inflow', nr.totalInflow.toFixed(4)]);
    }
    return props;
  }
  if (objType === 'storage') {
    const s = project.storageUnits.find(n => n.id === id);
    if (!s) return [['ID', id]];
    const props: [string, string][] = [['ID', s.id], ['Type', 'Storage'], ['Invert El.', s.elevation.toFixed(2)],
      ['Max. Depth', s.maxDepth.toFixed(2)], ['Init. Depth', s.initDepth.toFixed(2)], ['Shape', s.shape], ['Evap. Factor', s.fevap.toFixed(2)]];
    if (results?.timeSteps[timeStep]?.nodes[id]) {
      const nr = results.timeSteps[timeStep].nodes[id];
      props.push(['--- Results ---', ''], ['Depth (ft)', nr.depth.toFixed(4)], ['Volume', nr.volume.toFixed(2)], ['Inflow', nr.totalInflow.toFixed(4)]);
    }
    return props;
  }
  if (objType === 'subcatchment') {
    const sc = project.subcatchments.find(s => s.id === id);
    if (!sc) return [['ID', id]];
    const props: [string, string][] = [['ID', sc.id], ['Rain Gage', sc.rainGage], ['Outlet', sc.outlet],
      ['Area (ac)', sc.area.toFixed(2)], ['% Imperv', sc.pctImperv.toFixed(1)], ['Width (ft)', sc.width.toFixed(0)],
      ['Slope (%)', sc.slope.toFixed(2)], ['Curb Len.', sc.curbLen.toString()]];
    const inf = project.infiltration[sc.id];
    if (inf) props.push(['Infiltration', inf.values.map(v => v.toFixed(2)).join(', ')]);
    if (results?.timeSteps[timeStep]?.subcatchments[id]) {
      const sr = results.timeSteps[timeStep].subcatchments[id];
      props.push(['--- Results ---', ''], ['Rainfall (in/hr)', sr.rainfall.toFixed(4)], ['Runoff (CFS)', sr.runoff.toFixed(4)], ['Infiltration', sr.infiltration.toFixed(4)]);
    }
    return props;
  }
  if (objType === 'conduit') {
    const c = project.conduits.find(l => l.id === id);
    if (!c) return [['ID', id]];
    const xs = project.xsections[id];
    const props: [string, string][] = [['ID', c.id], ['Type', 'Conduit'], ['From Node', c.fromNode], ['To Node', c.toNode],
      ['Length (ft)', c.length.toFixed(2)], ['Roughness', c.roughness.toFixed(4)], ['In Offset', c.inOffset.toFixed(2)], ['Out Offset', c.outOffset.toFixed(2)]];
    if (xs) props.push(['Shape', xs.shape], ['Geom1', typeof xs.geom1 === 'string' ? xs.geom1 : xs.geom1.toFixed(2)], ['Barrels', xs.barrels.toString()]);
    if (results?.timeSteps[timeStep]?.links[id]) {
      const lr = results.timeSteps[timeStep].links[id];
      props.push(['--- Results ---', ''], ['Flow (CFS)', lr.flow.toFixed(4)], ['Depth (ft)', lr.depth.toFixed(4)],
        ['Velocity (fps)', lr.velocity.toFixed(4)], ['Capacity', lr.capacity.toFixed(4)]);
    }
    return props;
  }
  if (objType === 'pump') {
    const p = project.pumps.find(l => l.id === id);
    if (!p) return [['ID', id]];
    const props: [string, string][] = [['ID', p.id], ['Type', 'Pump'], ['From Node', p.fromNode], ['To Node', p.toNode], ['Pump Curve', p.pumpCurve], ['Status', p.status],
      ['Startup Depth', p.startupDepth?.toFixed(2) ?? ''], ['Shutoff Depth', p.shutoffDepth?.toFixed(2) ?? '']];
    if (results?.timeSteps[timeStep]?.links[id]) {
      const lr = results.timeSteps[timeStep].links[id];
      props.push(['--- Results ---', ''], ['Flow (CFS)', lr.flow.toFixed(4)]);
    }
    return props;
  }
  if (objType === 'weir') {
    const w = project.weirs.find(l => l.id === id);
    if (!w) return [['ID', id]];
    const props: [string, string][] = [['ID', w.id], ['Type', 'Weir'], ['Weir Type', w.type], ['From Node', w.fromNode], ['To Node', w.toNode],
      ['Crest Height', w.crestHeight.toFixed(2)], ['Disch. Coeff.', w.cd.toFixed(2)], ['Gated', w.gated],
      ['End Coeff.', w.ec.toFixed(2)], ['Cd2', w.cd2.toFixed(2)], ['Surcharge', w.surcharge]];
    if (results?.timeSteps[timeStep]?.links[id]) {
      const lr = results.timeSteps[timeStep].links[id];
      props.push(['--- Results ---', ''], ['Flow (CFS)', lr.flow.toFixed(4)], ['Depth (ft)', lr.depth.toFixed(4)]);
    }
    return props;
  }
  if (objType === 'orifice') {
    const o = project.orifices.find(l => l.id === id);
    if (!o) return [['ID', id]];
    const props: [string, string][] = [['ID', o.id], ['Type', 'Orifice'], ['From Node', o.fromNode], ['To Node', o.toNode], ['Orifice Type', o.type],
      ['Offset', o.offset.toFixed(2)], ['Disch. Coeff.', o.cd.toFixed(2)], ['Gated', o.gated], ['Close Time', o.closeTime.toFixed(0)]];
    if (results?.timeSteps[timeStep]?.links[id]) {
      const lr = results.timeSteps[timeStep].links[id];
      props.push(['--- Results ---', ''], ['Flow (CFS)', lr.flow.toFixed(4)], ['Depth (ft)', lr.depth.toFixed(4)]);
    }
    return props;
  }
  if (objType === 'raingage') {
    const rg = project.raingages.find(r => r.id === id);
    if (!rg) return [['ID', id]];
    return [['ID', rg.id], ['Format', rg.format], ['Interval', rg.interval], ['SCF', rg.scf.toString()], ['Source', `${rg.sourceType} ${rg.sourceName}`]];
  }
  if (objType === 'divider') {
    const d = project.dividers.find(n => n.id === id);
    if (!d) return [['ID', id]];
    const props: [string, string][] = [['ID', d.id], ['Type', 'Divider'], ['Invert El.', d.elevation.toFixed(2)], ['Diverted Link', d.divertedLink], ['Divider Type', d.type],
      ['Max. Depth', d.maxDepth.toFixed(2)], ['Init. Depth', d.initDepth.toFixed(2)], ['Surcharge Dp.', d.surDepth.toFixed(2)], ['Ponded Area', d.aponded.toString()]];
    if (results?.timeSteps[timeStep]?.nodes[id]) {
      const nr = results.timeSteps[timeStep].nodes[id];
      props.push(['--- Results ---', ''], ['Depth (ft)', nr.depth.toFixed(4)], ['Head (ft)', nr.head.toFixed(4)]);
    }
    return props;
  }
  if (objType === 'outlet') {
    const o = project.outlets.find(l => l.id === id);
    if (!o) return [['ID', id]];
    const props: [string, string][] = [['ID', o.id], ['Type', 'Outlet'], ['From Node', o.fromNode], ['To Node', o.toNode], ['Offset', o.offset.toFixed(2)],
      ['Outlet Type', o.type], ['Curve/Table', o.curveOrTable]];
    if (results?.timeSteps[timeStep]?.links[id]) {
      const lr = results.timeSteps[timeStep].links[id];
      props.push(['--- Results ---', ''], ['Flow (CFS)', lr.flow.toFixed(4)]);
    }
    return props;
  }
  return [['ID', id], ['Type', objType]];
}
