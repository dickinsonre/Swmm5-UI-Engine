import { useState, useMemo } from 'react';
import type { SwmmProject } from '@/lib/swmm-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BookOpen, ChevronDown, ChevronRight, AlertTriangle, AlertCircle,
  Info, CheckCircle, Search, MapPin, Droplets, Settings, Zap,
  Layers, FileText, BarChart3, Play, HelpCircle
} from 'lucide-react';

interface TopicSection {
  title: string;
  icon: any;
  topics: { title: string; content: string }[];
}

const HELP_TOPICS: TopicSection[] = [
  {
    title: 'Getting Started',
    icon: Play,
    topics: [
      {
        title: 'Opening a Model',
        content: 'Use File > Open to load an existing SWMM5 INP file from your computer. You can also load sample models from File > Samples, or fetch models from GitHub using File > GitHub. The model will be parsed and displayed on the network map automatically.'
      },
      {
        title: 'Creating a New Model',
        content: 'Click File > New to create a blank project. Use the drawing tools on the left toolbar (SpeedBar) to add network elements: junctions, outfalls, storage units, conduits, pumps, weirs, orifices, and subcatchments. Set project defaults first via Edit > Defaults to configure default properties for new objects.'
      },
      {
        title: 'Saving Your Work',
        content: 'Click File > Save to download the current model as an INP file. The file preserves all network elements, properties, options, and simulation settings in standard SWMM5 format. You can also use File > Export to export data in CSV, DXF, or GeoJSON formats.'
      },
    ]
  },
  {
    title: 'Network Map',
    icon: MapPin,
    topics: [
      {
        title: 'Navigation',
        content: 'Pan: Click and drag on the map background. Zoom: Use the mouse scroll wheel, or the Zoom In/Out buttons on the toolbar. Fit: Click the Fit button to zoom to show the entire network. The minimap in the bottom-right corner shows an overview and can be dragged to navigate quickly.'
      },
      {
        title: 'Selecting Objects',
        content: 'Click on any node (junction, outfall, storage, divider) or link (conduit, pump, weir, orifice, outlet) to select it. The selected object\'s properties appear in the Property Editor panel. You can also select subcatchments by clicking inside their polygon boundary.'
      },
      {
        title: 'Drawing New Elements',
        content: 'Use the SpeedBar tools on the left side to switch drawing modes. Click on the map to place nodes. To draw a link, click on a source node then click on a destination node. For subcatchments, click to place polygon vertices and double-click to close the shape.'
      },
      {
        title: 'Right-Click Context Menu',
        content: 'Right-click on any object to access quick actions: view Properties, Copy ID, Copy/Paste objects, Reverse link direction, Find Connected elements, or Delete. Right-click on empty space to access Find Object.'
      },
      {
        title: 'Map Display Options',
        content: 'Use View > Map Options to configure the display: toggle node/link labels, adjust symbol sizes, show flow direction arrows, enable subcatchment fill, and set backdrop images. The Legend panel shows color coding for the currently displayed variable.'
      },
    ]
  },
  {
    title: 'Hydrology',
    icon: Droplets,
    topics: [
      {
        title: 'Rain Gages',
        content: 'Rain gages define precipitation input. Each gage specifies rainfall format (intensity, volume, or cumulative), time interval, and a data source (time series or external file). Assign rain gages to subcatchments to drive runoff calculations.'
      },
      {
        title: 'Subcatchments',
        content: 'Subcatchments are land areas that generate runoff. Key properties include area, width (overland flow path), slope, percent impervious, and infiltration parameters. Each subcatchment must be assigned a rain gage and an outlet (junction or another subcatchment).'
      },
      {
        title: 'Infiltration',
        content: 'SWMM supports three infiltration methods: Horton (exponential decay), Green-Ampt (physics-based wetting front), and Curve Number (SCS method). Set the infiltration method in Analysis Options > General, then configure parameters for each subcatchment. The AI Assist > Parameters tab provides reference values for different soil types.'
      },
      {
        title: 'Groundwater',
        content: 'Subcatchments can model groundwater interactions. Click the [...] button next to Groundwater in the subcatchment properties to configure aquifer references, receiving nodes, and lateral/deep flow coefficients.'
      },
      {
        title: 'LID Controls',
        content: 'Low Impact Development (LID) practices like rain gardens, permeable pavement, and green roofs can be assigned to subcatchments. Define LID types in the Data Editor (Edit > Data Editor > LID Controls), then assign them via the [...] button in subcatchment properties.'
      },
    ]
  },
  {
    title: 'Hydraulics',
    icon: Zap,
    topics: [
      {
        title: 'Nodes',
        content: 'Junctions are internal network points where links connect. They have invert elevation and maximum depth. Outfalls are terminal nodes representing system discharge points (free, normal, fixed stage, tidal, or time series boundary conditions). Storage units are nodes with volume (functional or tabular storage curves). Dividers split flow between two downstream links.'
      },
      {
        title: 'Links',
        content: 'Conduits are pipes or channels with defined cross-sections (circular, rectangular, trapezoidal, etc.), length, roughness (Manning\'s N), and offset elevations. Pumps transfer flow using pump curves. Orifices are openings with defined shape and discharge coefficients. Weirs are overflow structures. Outlets use rating curves for flow control.'
      },
      {
        title: 'Cross-Sections',
        content: 'Each conduit requires a cross-section definition specifying shape and dimensions. Common shapes include CIRCULAR (diameter), RECT_CLOSED (height, width), TRAPEZOIDAL (height, base width, side slopes), TRIANGULAR, ARCH, and custom IRREGULAR transects. The Property Editor shows a visual preview of the cross-section shape.'
      },
      {
        title: 'External Inflows',
        content: 'Nodes can receive external inflows. Direct inflows add flow or pollutant loads from a time series. Dry weather flow (DWF) adds constant average flow with optional time-varying patterns. Access these via [...] buttons in the node property editor.'
      },
    ]
  },
  {
    title: 'Simulation',
    icon: Play,
    topics: [
      {
        title: 'Analysis Options',
        content: 'Configure simulation settings via Report > Analysis Options. The General tab sets flow units, routing method (Dynamic Wave, Kinematic Wave, or Steady Flow), and infiltration model. The Dates tab sets simulation start/end dates. The Time Steps tab controls reporting and routing intervals. The Dynamic Wave tab sets advanced hydraulic parameters.'
      },
      {
        title: 'Running a Simulation',
        content: 'Click the Run button (or Project > Run) to execute the simulation. The engine processes the model and generates results. Four engine modes are available: Local (EPA SWMM 5.2.4 binary), WASM (EPA SWMM 5.2.4 in-browser engine), Remote (cloud API), and Mock (synthetic test results). The active engine is shown in the status bar.'
      },
      {
        title: 'Viewing Results',
        content: 'After simulation, use the time slider in the toolbar to animate results across timesteps. Node and link colors change to reflect computed values (depth, flow, velocity, etc.). Use Report > Table to view tabular results by object or by variable. Profile plots show hydraulic grade lines along selected paths.'
      },
      {
        title: 'CFL Analysis',
        content: 'The CFL (Courant-Friedrichs-Lewy) stability analysis checks whether the routing timestep is small enough for accurate Dynamic Wave results. Access it from Report > CFL Analysis. It identifies conduits where flow may be unstable and suggests timestep or discretization adjustments.'
      },
    ]
  },
  {
    title: 'Data Management',
    icon: FileText,
    topics: [
      {
        title: 'Time Series',
        content: 'Time series define time-varying data for rainfall, inflows, tidal curves, and other inputs. Create and edit them in Edit > Data Editor > Time Series. Each series contains date/time and value pairs. You can import data from CSV files and preview the series as a graph.'
      },
      {
        title: 'Curves',
        content: 'Curves define relationships between variables: storage curves (depth vs. area), pump curves (various types), rating curves, tidal curves, diversion curves, and shape curves. Edit them in Edit > Data Editor > Curves, with interactive graph preview.'
      },
      {
        title: 'Patterns',
        content: 'Patterns are periodic multipliers applied to dry weather flow. Types include Monthly (12 values), Daily (7 values, Sun-Sat), Hourly (24 values), and Weekend (24 values). Edit in Edit > Data Editor > Patterns.'
      },
      {
        title: 'Control Rules',
        content: 'Control rules automate operation of pumps, orifices, and weirs based on conditions like node depth, time, or simulation clock. Use the IF-THEN-ELSE syntax in Edit > Data Editor > Controls. The rule editor provides syntax validation and keyword helpers.'
      },
    ]
  },
  {
    title: 'Analysis Tools',
    icon: BarChart3,
    topics: [
      {
        title: 'Profile Plots',
        content: 'Profile plots display the hydraulic grade line and pipe crowns/inverts along a path from an upstream node to a downstream node. Select source and destination nodes, then use Report > Profile Plot to visualize water surface elevation through the system.'
      },
      {
        title: 'Calibration',
        content: 'Compare simulation results with observed data using Report > Calibration. Load observed data files (.dat format), select comparison variables, and view correlation plots, scatter diagrams, and statistical metrics (R, NSE, RMSE, PBIAS).'
      },
      {
        title: 'Statistics Report',
        content: 'Report > Statistics provides event-based analysis of simulation results, computing summary statistics for selected variables across storm events or time periods.'
      },
      {
        title: 'AI Assist Panel',
        content: 'The AI Assist panel (toggle via the brain icon) provides four tabs: Errors (model validation diagnostics), Parameters (reference tables for soil types, pipe materials, and land uses), Insights (simulation results analysis), and Auto-Fix (automatic parameter estimation for conduit lengths and subcatchment widths).'
      },
    ]
  },
];

const TUTORIAL_STEPS = [
  {
    title: 'Step 1: Load a Sample Model',
    content: 'Start by loading a sample model to explore the interface. Click "File" in the menu bar, then click "Samples" in the toolbar. Choose one of the available sample models (e.g., "Example1" for a simple drainage network or a larger model to see more features). The network will appear on the map.',
    tip: 'The sample models are fetched from a GitHub repository and include a variety of network configurations.'
  },
  {
    title: 'Step 2: Explore the Network Map',
    content: 'The center of the screen shows the network map. Use the mouse wheel to zoom in/out, and click-drag to pan. Try clicking on different elements — nodes appear as circles or squares, links appear as lines connecting nodes, and subcatchments appear as colored polygons.',
    tip: 'The minimap in the bottom-right corner shows an overview. You can drag it to reposition, or click within it to navigate quickly.'
  },
  {
    title: 'Step 3: Inspect Object Properties',
    content: 'Click on any node or link to select it. The Property Editor panel on the right shows all properties for the selected object, organized in collapsible sections. You can edit values directly — changes are applied immediately to the model. Some fields have [...] buttons that open detailed sub-editors.',
    tip: 'Look for the cross-section preview when selecting a conduit — it shows a visual diagram of the pipe shape.'
  },
  {
    title: 'Step 4: Use the Project Explorer',
    content: 'The panel on the left is the Project Explorer. It shows a tree view of all model components organized by type (Junctions, Conduits, Subcatchments, etc.). Click on any item to select it on the map and show its properties. You can also use the data grid view to edit multiple objects in a spreadsheet-style table.',
    tip: 'The count next to each category shows how many objects of that type exist in the model.'
  },
  {
    title: 'Step 5: Check for Model Errors',
    content: 'Before running a simulation, check for errors. Click the brain icon in the right toolbar to open the AI Assist panel, then switch to the "Errors" tab. It runs 25+ diagnostic checks covering network connectivity, geometry, cross-sections, subcatchment parameters, and simulation options. Click on any error to select the problem object.',
    tip: 'You can also use Help > Errors for a quick summary of model validation issues.'
  },
  {
    title: 'Step 6: Configure Analysis Options',
    content: 'Click "Report" in the menu bar, then "Analysis Options". Review the General tab (flow units, routing method, infiltration model), Dates tab (simulation start/end dates), and Time Steps tab (reporting and routing intervals). For Dynamic Wave routing, check the DW tab for advanced settings.',
    tip: 'The default routing timestep is 30 seconds. For models with short conduits, you may need a smaller timestep — use CFL Analysis to check.'
  },
  {
    title: 'Step 7: Run the Simulation',
    content: 'Click the green "Run" button in the Project toolbar (or use Project > Run). The simulation engine processes the model and generates results. A progress indicator shows the computation status. Once complete, the status bar shows the summary and any warnings.',
    tip: 'Four engine modes are available. The status bar shows which engine is active (Local, WASM, Remote, or Mock). The system auto-selects the best available engine.'
  },
  {
    title: 'Step 8: View Results',
    content: 'After running, a time slider appears in the toolbar. Drag it or click Play to animate results over time. Node colors indicate depth, flooding, or other variables. Link colors show flow rates, velocities, or capacity usage. Use the Legend panel to see what colors represent.',
    tip: 'Use Report > Table to view detailed numerical results in a spreadsheet format, organized by object or by variable.'
  },
  {
    title: 'Step 9: Profile and Calibration Plots',
    content: 'For a visual profile of water levels through the system, use Report > Profile Plot. Select upstream and downstream nodes to see a cross-sectional view of the hydraulic grade line, pipe inverts, and crowns along the flow path. For model validation, use Report > Calibration to compare simulation output with observed data.',
    tip: 'Profile plots are particularly useful for identifying bottlenecks, surcharging, and backwater effects in the drainage network.'
  },
  {
    title: 'Step 10: Save and Export',
    content: 'Save your model using File > Save to download the INP file. You can also export network data in other formats using File > Export (CSV for node/link data, DXF for CAD interchange, GeoJSON for GIS). The exported files preserve all model edits and can be reimported later.',
    tip: 'The INP file format is the standard SWMM5 input format and can be opened in EPA SWMM5 desktop, InfoSWMM, PCSWMM, and other compatible software.'
  },
];

type Severity = 'error' | 'warning' | 'info';

interface ErrorItem {
  severity: Severity;
  category: string;
  message: string;
  objectId?: string;
  objectType?: string;
}

function runModelErrors(project: SwmmProject): ErrorItem[] {
  const items: ErrorItem[] = [];
  const add = (severity: Severity, category: string, message: string, objectId?: string, objectType?: string) => {
    items.push({ severity, category, message, objectId, objectType });
  };

  if (project.junctions.length === 0 && project.outfalls.length === 0) {
    add('error', 'Network', 'No nodes defined in the model');
  }
  if (project.conduits.length === 0 && project.pumps.length === 0 && project.orifices.length === 0 && project.weirs.length === 0 && project.outlets.length === 0) {
    add('error', 'Network', 'No links defined in the model');
  }
  if (project.outfalls.length === 0) {
    add('error', 'Network', 'No outfall nodes — model needs at least one outfall');
  }
  if (project.raingages.length === 0 && project.subcatchments.length > 0) {
    add('error', 'Hydrology', 'Subcatchments exist but no rain gages defined');
  }

  const allNodeIds = new Set([
    ...project.junctions.map(j => j.id),
    ...project.outfalls.map(o => o.id),
    ...project.storageUnits.map(s => s.id),
    ...project.dividers.map(d => d.id),
  ]);
  const allLinks = [
    ...project.conduits.map(c => ({ id: c.id, from: c.fromNode, to: c.toNode, type: 'conduit' })),
    ...project.pumps.map(p => ({ id: p.id, from: p.fromNode, to: p.toNode, type: 'pump' })),
    ...project.orifices.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'orifice' })),
    ...project.weirs.map(w => ({ id: w.id, from: w.fromNode, to: w.toNode, type: 'weir' })),
    ...project.outlets.map(o => ({ id: o.id, from: o.fromNode, to: o.toNode, type: 'outlet' })),
  ];

  for (const link of allLinks) {
    if (!allNodeIds.has(link.from)) {
      add('error', 'Connectivity', `${link.type} "${link.id}" references unknown from-node "${link.from}"`, link.id, link.type);
    }
    if (!allNodeIds.has(link.to)) {
      add('error', 'Connectivity', `${link.type} "${link.id}" references unknown to-node "${link.to}"`, link.id, link.type);
    }
    if (link.from === link.to) {
      add('error', 'Connectivity', `${link.type} "${link.id}" connects a node to itself`, link.id, link.type);
    }
  }

  const connectedNodes = new Set<string>();
  for (const link of allLinks) {
    connectedNodes.add(link.from);
    connectedNodes.add(link.to);
  }
  for (const nid of allNodeIds) {
    if (!connectedNodes.has(nid)) {
      const nType = project.junctions.find(j => j.id === nid) ? 'junction'
        : project.outfalls.find(o => o.id === nid) ? 'outfall'
        : project.storageUnits.find(s => s.id === nid) ? 'storage' : 'divider';
      add('warning', 'Connectivity', `Node "${nid}" is not connected to any link`, nid, nType);
    }
  }

  for (const c of project.conduits) {
    if (c.length <= 0) add('error', 'Geometry', `Conduit "${c.id}" has zero or negative length`, c.id, 'conduit');
    if (c.roughness <= 0 || c.roughness > 1) add('warning', 'Geometry', `Conduit "${c.id}" has unusual Manning's N: ${c.roughness}`, c.id, 'conduit');
    const xs = Array.isArray(project.xsections)
      ? project.xsections.find((x: any) => x.linkId === c.id)
      : (project.xsections as Record<string, any>)[c.id];
    if (!xs) add('error', 'Cross-Section', `Conduit "${c.id}" has no cross-section defined`, c.id, 'conduit');
    else if (typeof xs.geom1 === 'number' && xs.geom1 <= 0) add('error', 'Cross-Section', `Conduit "${c.id}" has zero or negative max depth`, c.id, 'conduit');
  }

  for (const j of project.junctions) {
    if (j.maxDepth < 0) add('warning', 'Geometry', `Junction "${j.id}" has negative max depth`, j.id, 'junction');
  }

  for (const s of project.subcatchments) {
    if (s.area <= 0) add('error', 'Subcatchment', `Subcatchment "${s.id}" has zero or negative area`, s.id, 'subcatchment');
    if (s.width <= 0) add('warning', 'Subcatchment', `Subcatchment "${s.id}" has zero width`, s.id, 'subcatchment');
    if (s.slope <= 0) add('warning', 'Subcatchment', `Subcatchment "${s.id}" has zero or negative slope`, s.id, 'subcatchment');
    if (s.pctImperv < 0 || s.pctImperv > 100) add('error', 'Subcatchment', `Subcatchment "${s.id}" % impervious out of range: ${s.pctImperv}`, s.id, 'subcatchment');
    if (!s.outlet) add('error', 'Subcatchment', `Subcatchment "${s.id}" has no outlet defined`, s.id, 'subcatchment');
    if (!s.rainGage) add('error', 'Subcatchment', `Subcatchment "${s.id}" has no rain gage assigned`, s.id, 'subcatchment');
  }

  const opts = project.options;
  const startDate = opts['START_DATE'] || opts.startDate;
  const endDate = opts['END_DATE'] || opts.endDate;
  if (!startDate || !endDate) add('warning', 'Options', 'Simulation start/end dates not set');
  if (startDate && endDate) {
    const sd = new Date(String(startDate)).getTime();
    const ed = new Date(String(endDate)).getTime();
    if (!isNaN(sd) && !isNaN(ed) && sd > ed) add('error', 'Options', 'Start date is after end date');
  }

  const dupJunctions = findDups(project.junctions.map(j => j.id));
  for (const d of dupJunctions) add('error', 'Duplicates', `Duplicate junction ID: "${d}"`);
  const dupConduits = findDups(project.conduits.map(c => c.id));
  for (const d of dupConduits) add('error', 'Duplicates', `Duplicate conduit ID: "${d}"`);

  return items;
}

function findDups(arr: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const v of arr) { if (seen.has(v)) dups.add(v); seen.add(v); }
  return [...dups];
}

interface HelpTopicsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function HelpTopicsDialog({ open, onOpenChange }: HelpTopicsDialogProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const toggleSection = (idx: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleTopic = (key: string) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const filteredTopics = useMemo(() => {
    if (!searchTerm.trim()) return HELP_TOPICS;
    const term = searchTerm.toLowerCase();
    return HELP_TOPICS.map(section => ({
      ...section,
      topics: section.topics.filter(t =>
        t.title.toLowerCase().includes(term) || t.content.toLowerCase().includes(term)
      )
    })).filter(s => s.topics.length > 0);
  }, [searchTerm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0" data-testid="dialog-help-topics">
        <DialogHeader className="px-5 pt-4 pb-2" style={{ borderBottom: '1px solid #d0d0d8' }}>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: '#2c3e6b' }}>
            <BookOpen className="w-4 h-4" />
            Help Topics
          </DialogTitle>
          <div className="relative mt-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search topics..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border rounded bg-white"
              style={{ borderColor: '#d0d0d8' }}
              data-testid="input-help-search"
            />
          </div>
        </DialogHeader>
        <ScrollArea className="h-[60vh]">
          <div className="px-5 py-3 space-y-1">
            {filteredTopics.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-8">No topics match your search.</p>
            )}
            {filteredTopics.map((section, sIdx) => {
              const Icon = section.icon;
              const isExpanded = expandedSections.has(sIdx) || searchTerm.trim().length > 0;
              return (
                <div key={section.title} className="mb-2">
                  <button
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-[#f0f4ff] transition-colors"
                    onClick={() => toggleSection(sIdx)}
                    data-testid={`help-section-${sIdx}`}
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                    <Icon className="w-3.5 h-3.5" style={{ color: '#2c6eb5' }} />
                    <span className="text-xs font-semibold" style={{ color: '#2c3e6b' }}>{section.title}</span>
                    <span className="text-[9px] text-gray-400 ml-auto">{section.topics.length} topics</span>
                  </button>
                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-0.5">
                      {section.topics.map((topic, tIdx) => {
                        const tKey = `${sIdx}-${tIdx}`;
                        const tExpanded = expandedTopics.has(tKey) || searchTerm.trim().length > 0;
                        return (
                          <div key={tKey}>
                            <button
                              className="w-full flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-[#f8f8ff] transition-colors"
                              onClick={() => toggleTopic(tKey)}
                              data-testid={`help-topic-${sIdx}-${tIdx}`}
                            >
                              {tExpanded ? <ChevronDown className="w-2.5 h-2.5 text-gray-300" /> : <ChevronRight className="w-2.5 h-2.5 text-gray-300" />}
                              <span className="text-[11px]" style={{ color: '#2a2a3e' }}>{topic.title}</span>
                            </button>
                            {tExpanded && (
                              <div className="ml-7 mr-2 mb-2 px-3 py-2 rounded text-[10px] leading-relaxed" style={{ backgroundColor: '#f8f8fa', color: '#4a4a5a', border: '1px solid #e8e8f0' }}>
                                {topic.content}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface HelpTutorialDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function HelpTutorialDialog({ open, onOpenChange }: HelpTutorialDialogProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const step = TUTORIAL_STEPS[currentStep];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] p-0" data-testid="dialog-help-tutorial">
        <DialogHeader className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid #d0d0d8' }}>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: '#2c3e6b' }}>
            <HelpCircle className="w-4 h-4" />
            SWMM5 Tutorial
          </DialogTitle>
          <div className="flex items-center gap-1 mt-2">
            {TUTORIAL_STEPS.map((_, i) => (
              <button
                key={i}
                className={`w-5 h-1.5 rounded-full transition-colors ${i === currentStep ? 'bg-[#2c6eb5]' : 'bg-gray-200 hover:bg-gray-300'}`}
                onClick={() => setCurrentStep(i)}
                data-testid={`tutorial-step-dot-${i}`}
              />
            ))}
          </div>
        </DialogHeader>
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: '#2c6eb5' }}>
              {currentStep + 1}
            </div>
            <h3 className="text-xs font-semibold" style={{ color: '#2c3e6b' }} data-testid="tutorial-step-title">{step.title}</h3>
          </div>
          <p className="text-[11px] leading-relaxed mb-3" style={{ color: '#4a4a5a' }} data-testid="tutorial-step-content">
            {step.content}
          </p>
          {step.tip && (
            <div className="flex items-start gap-2 px-3 py-2 rounded" style={{ backgroundColor: '#f0f4ff', border: '1px solid #d0d8e8' }}>
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#2c6eb5' }} />
              <p className="text-[10px] leading-relaxed" style={{ color: '#2c6eb5' }}>
                {step.tip}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between mt-5">
            <button
              className="px-3 py-1 text-[10px] rounded border transition-colors disabled:opacity-40"
              style={{ borderColor: '#d0d0d8', color: '#6b6b7b' }}
              disabled={currentStep === 0}
              onClick={() => setCurrentStep(p => p - 1)}
              data-testid="tutorial-prev"
            >
              Previous
            </button>
            <span className="text-[9px]" style={{ color: '#9090a0' }}>
              {currentStep + 1} of {TUTORIAL_STEPS.length}
            </span>
            <button
              className="px-3 py-1 text-[10px] rounded text-white transition-colors disabled:opacity-40"
              style={{ backgroundColor: '#2c6eb5' }}
              disabled={currentStep === TUTORIAL_STEPS.length - 1}
              onClick={() => setCurrentStep(p => p + 1)}
              data-testid="tutorial-next"
            >
              Next
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface HelpErrorsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: SwmmProject;
  onSelectObject?: (id: string, type: string) => void;
}

export function HelpErrorsDialog({ open, onOpenChange, project, onSelectObject }: HelpErrorsDialogProps) {
  const errors = useMemo(() => runModelErrors(project), [project]);

  const errorCount = errors.filter(e => e.severity === 'error').length;
  const warningCount = errors.filter(e => e.severity === 'warning').length;
  const infoCount = errors.filter(e => e.severity === 'info').length;

  const sevIcon = (sev: Severity) => {
    if (sev === 'error') return <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />;
    if (sev === 'warning') return <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />;
    return <Info className="w-3 h-3 text-blue-400 shrink-0" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] p-0" data-testid="dialog-help-errors">
        <DialogHeader className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid #d0d0d8' }}>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: '#2c3e6b' }}>
            <AlertTriangle className="w-4 h-4" />
            Model Validation
          </DialogTitle>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1 text-[10px]">
              <AlertCircle className="w-3 h-3 text-red-500" />
              <span className="font-semibold text-red-600" data-testid="error-count">{errorCount}</span> errors
            </span>
            <span className="flex items-center gap-1 text-[10px]">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              <span className="font-semibold text-amber-600" data-testid="warning-count">{warningCount}</span> warnings
            </span>
            <span className="flex items-center gap-1 text-[10px]">
              <Info className="w-3 h-3 text-blue-400" />
              <span className="font-semibold text-blue-500" data-testid="info-count">{infoCount}</span> info
            </span>
          </div>
        </DialogHeader>
        <ScrollArea className="h-[50vh]">
          <div className="px-4 py-2 space-y-0.5">
            {errors.length === 0 && (
              <div className="flex items-center gap-2 py-8 justify-center">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-xs text-gray-500">No issues found — model looks good!</span>
              </div>
            )}
            {errors.map((item, i) => (
              <button
                key={i}
                className="w-full flex items-start gap-2 px-2.5 py-1.5 rounded text-left hover:bg-[#f0f4ff] transition-colors"
                onClick={() => {
                  if (item.objectId && item.objectType && onSelectObject) {
                    onSelectObject(item.objectId, item.objectType);
                  }
                }}
                data-testid={`error-item-${i}`}
              >
                {sevIcon(item.severity)}
                <div className="min-w-0 flex-1">
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded mr-1.5" style={{
                    backgroundColor: item.severity === 'error' ? '#fef2f2' : item.severity === 'warning' ? '#fffbeb' : '#eff6ff',
                    color: item.severity === 'error' ? '#991b1b' : item.severity === 'warning' ? '#92400e' : '#1e40af'
                  }}>
                    {item.category}
                  </span>
                  <span className="text-[10px]" style={{ color: '#4a4a5a' }}>{item.message}</span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
