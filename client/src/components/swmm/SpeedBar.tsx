import {
  MousePointer2, Circle, Triangle, Square, Minus, Zap, Tag, Trash2,
  BoxSelect, Play, Maximize, Diamond, CloudRain, Hexagon, CircleDot,
  ArrowDownToLine, Waves, Ruler,
} from 'lucide-react';

export type InteractionMode =
  | 'select'
  | 'addJunction'
  | 'addOutfall'
  | 'addStorage'
  | 'addDivider'
  | 'addConduit'
  | 'addPump'
  | 'addOrifice'
  | 'addWeir'
  | 'addOutlet'
  | 'addSubcatchment'
  | 'addRaingage'
  | 'addLabel'
  | 'groupSelect'
  | 'measure'
  | 'query';

interface SpeedBarProps {
  interactionMode: InteractionMode;
  onSetMode: (mode: InteractionMode) => void;
  onDelete: () => void;
  onRunSimulation: () => void;
  onFullExtent: () => void;
  simRunning?: boolean;
  isMobile?: boolean;
  expertMode?: boolean;
}

const EXPERT_ONLY_MODES: InteractionMode[] = ['addDivider', 'addOrifice', 'addWeir', 'addOutlet', 'measure'];

const tools: { mode: InteractionMode; icon: typeof Circle; label: string; shortLabel: string; testId: string; group?: string }[] = [
  { mode: 'select', icon: MousePointer2, label: 'Select', shortLabel: 'Sel', testId: 'speed-select' },
  { mode: 'addJunction', icon: Circle, label: 'Add Junction', shortLabel: 'Junc', testId: 'speed-junction', group: 'nodes' },
  { mode: 'addOutfall', icon: Triangle, label: 'Add Outfall', shortLabel: 'Out', testId: 'speed-outfall', group: 'nodes' },
  { mode: 'addStorage', icon: Square, label: 'Add Storage', shortLabel: 'Stor', testId: 'speed-storage', group: 'nodes' },
  { mode: 'addDivider', icon: Diamond, label: 'Add Divider', shortLabel: 'Div', testId: 'speed-divider', group: 'nodes' },
  { mode: 'addConduit', icon: Minus, label: 'Add Conduit', shortLabel: 'Cond', testId: 'speed-conduit', group: 'links' },
  { mode: 'addPump', icon: Zap, label: 'Add Pump', shortLabel: 'Pump', testId: 'speed-pump', group: 'links' },
  { mode: 'addOrifice', icon: CircleDot, label: 'Add Orifice', shortLabel: 'Orif', testId: 'speed-orifice', group: 'links' },
  { mode: 'addWeir', icon: ArrowDownToLine, label: 'Add Weir', shortLabel: 'Weir', testId: 'speed-weir', group: 'links' },
  { mode: 'addOutlet', icon: Waves, label: 'Add Outlet', shortLabel: 'Outl', testId: 'speed-outlet', group: 'links' },
  { mode: 'addSubcatchment', icon: Hexagon, label: 'Draw Subcatchment', shortLabel: 'Sub', testId: 'speed-subcatchment', group: 'hydro' },
  { mode: 'addRaingage', icon: CloudRain, label: 'Add Rain Gage', shortLabel: 'Rain', testId: 'speed-raingage', group: 'hydro' },
  { mode: 'addLabel', icon: Tag, label: 'Add Label', shortLabel: 'Label', testId: 'speed-label' },
  { mode: 'groupSelect', icon: BoxSelect, label: 'Group Select', shortLabel: 'Grp', testId: 'speed-group' },
  { mode: 'measure', icon: Ruler, label: 'Measure Distance', shortLabel: 'Meas', testId: 'speed-measure' },
];

export default function SpeedBar({
  interactionMode,
  onSetMode,
  onDelete,
  onRunSimulation,
  onFullExtent,
  simRunning,
  isMobile,
  expertMode = true,
}: SpeedBarProps) {
  const visibleTools = expertMode ? tools : tools.filter(t => !EXPERT_ONLY_MODES.includes(t.mode));
  if (isMobile) {
    return (
      <div
        className="absolute bottom-3 left-3 right-3 flex flex-row gap-0.5 p-1.5 rounded-xl z-10 overflow-x-auto"
        style={{ backgroundColor: 'rgba(255,255,255,0.97)', border: '1px solid #d0d0d8', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', WebkitOverflowScrolling: 'touch' }}
        data-testid="speed-bar"
      >
        {visibleTools.map(({ mode, icon: Icon, shortLabel, label, testId }) => {
          const active = interactionMode === mode;
          return (
            <button
              key={mode}
              onClick={() => onSetMode(mode)}
              title={label}
              aria-label={label}
              aria-pressed={active}
              className="flex flex-col items-center justify-center min-w-[44px] h-11 rounded-lg transition-colors gap-0.5 px-1"
              style={{
                backgroundColor: active ? 'rgba(44,110,181,0.12)' : 'transparent',
                border: active ? '1.5px solid #2c6eb5' : '1.5px solid transparent',
                color: active ? '#2c6eb5' : '#6b6b7b',
              }}
              data-testid={testId}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[7px] leading-none opacity-70">{shortLabel}</span>
            </button>
          );
        })}
        <div className="w-px h-10 mx-0.5 self-center" style={{ backgroundColor: '#d0d0d8' }} />
        <button onClick={onDelete} title="Delete" aria-label="Delete selected object" className="flex flex-col items-center justify-center min-w-[44px] h-11 rounded-lg transition-colors gap-0.5 px-1" style={{ color: '#d04040' }} data-testid="speed-delete"><Trash2 className="w-4 h-4" /><span className="text-[7px] leading-none opacity-70">Del</span></button>
        <button onClick={onRunSimulation} disabled={simRunning} title="Run" aria-label="Run simulation" className="flex flex-col items-center justify-center min-w-[44px] h-11 rounded-lg transition-colors gap-0.5 px-1" style={{ color: simRunning ? '#6b6b7b' : '#2a8a4a', opacity: simRunning ? 0.5 : 1 }} data-testid="speed-run"><Play className="w-4 h-4" /><span className="text-[7px] leading-none opacity-70">Run</span></button>
        <button onClick={onFullExtent} title="Fit" aria-label="Zoom to full extent" className="flex flex-col items-center justify-center min-w-[44px] h-11 rounded-lg transition-colors gap-0.5 px-1" style={{ color: '#6b6b7b' }} data-testid="speed-extent"><Maximize className="w-4 h-4" /><span className="text-[7px] leading-none opacity-70">Fit</span></button>
      </div>
    );
  }

  return (
    <div
      className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 p-1.5 rounded-md z-10"
      style={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #d0d0d8' }}
      data-testid="speed-bar"
    >
      {visibleTools.map(({ mode, icon: Icon, label, shortLabel, testId }) => {
        const active = interactionMode === mode;
        return (
          <button
            key={mode}
            onClick={() => onSetMode(mode)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className="flex flex-col items-center justify-center w-9 h-9 rounded transition-colors gap-px"
            style={{
              backgroundColor: active ? 'rgba(44,110,181,0.12)' : 'transparent',
              border: active ? '1px solid #2c6eb5' : '1px solid transparent',
              color: active ? '#2c6eb5' : '#6b6b7b',
            }}
            data-testid={testId}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="text-[7px] leading-none opacity-70">{shortLabel}</span>
          </button>
        );
      })}

      <div className="w-full h-px my-0.5" style={{ backgroundColor: '#d0d0d8' }} />

      <button
        onClick={onDelete}
        title="Delete Selected"
        aria-label="Delete selected object"
        className="flex flex-col items-center justify-center w-9 h-9 rounded transition-colors gap-px"
        style={{ color: '#d04040', border: '1px solid transparent' }}
        data-testid="speed-delete"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span className="text-[7px] leading-none opacity-70">Del</span>
      </button>

      <button
        onClick={onRunSimulation}
        disabled={simRunning}
        title="Run Simulation"
        aria-label="Run simulation"
        className="flex flex-col items-center justify-center w-9 h-9 rounded transition-colors gap-px"
        style={{
          color: simRunning ? '#6b6b7b' : '#2a8a4a',
          border: '1px solid transparent',
          opacity: simRunning ? 0.5 : 1,
          cursor: simRunning ? 'not-allowed' : 'pointer',
        }}
        data-testid="speed-run"
      >
        <Play className="w-3.5 h-3.5" />
        <span className="text-[7px] leading-none opacity-70">Run</span>
      </button>

      <button
        onClick={onFullExtent}
        title="Full Extent"
        aria-label="Zoom to full extent"
        className="flex flex-col items-center justify-center w-9 h-9 rounded transition-colors gap-px"
        style={{ color: '#6b6b7b', border: '1px solid transparent' }}
        data-testid="speed-extent"
      >
        <Maximize className="w-3.5 h-3.5" />
        <span className="text-[7px] leading-none opacity-70">Fit</span>
      </button>
    </div>
  );
}
