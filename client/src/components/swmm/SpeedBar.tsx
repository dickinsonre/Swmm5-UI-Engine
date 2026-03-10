import {
  MousePointer2, Circle, Triangle, Square, Minus, Zap, Tag, Trash2,
  BoxSelect, Play, Maximize,
} from 'lucide-react';

export type InteractionMode =
  | 'select'
  | 'addJunction'
  | 'addOutfall'
  | 'addStorage'
  | 'addConduit'
  | 'addPump'
  | 'addLabel'
  | 'groupSelect'
  | 'query';

interface SpeedBarProps {
  interactionMode: InteractionMode;
  onSetMode: (mode: InteractionMode) => void;
  onDelete: () => void;
  onRunSimulation: () => void;
  onFullExtent: () => void;
  simRunning?: boolean;
}

const tools: { mode: InteractionMode; icon: typeof Circle; label: string; testId: string }[] = [
  { mode: 'select', icon: MousePointer2, label: 'Select', testId: 'speed-select' },
  { mode: 'addJunction', icon: Circle, label: 'Junction', testId: 'speed-junction' },
  { mode: 'addOutfall', icon: Triangle, label: 'Outfall', testId: 'speed-outfall' },
  { mode: 'addStorage', icon: Square, label: 'Storage', testId: 'speed-storage' },
  { mode: 'addConduit', icon: Minus, label: 'Conduit', testId: 'speed-conduit' },
  { mode: 'addPump', icon: Zap, label: 'Pump', testId: 'speed-pump' },
  { mode: 'addLabel', icon: Tag, label: 'Label', testId: 'speed-label' },
  { mode: 'groupSelect', icon: BoxSelect, label: 'Group', testId: 'speed-group' },
];

export default function SpeedBar({
  interactionMode,
  onSetMode,
  onDelete,
  onRunSimulation,
  onFullExtent,
  simRunning,
}: SpeedBarProps) {
  return (
    <div
      className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 p-1.5 rounded-md z-10"
      style={{ backgroundColor: 'rgba(30,30,46,0.92)', border: '1px solid #3a3a52' }}
      data-testid="speed-bar"
    >
      {tools.map(({ mode, icon: Icon, label, testId }) => {
        const active = interactionMode === mode;
        return (
          <button
            key={mode}
            onClick={() => onSetMode(mode)}
            title={label}
            className="flex items-center justify-center w-8 h-8 rounded transition-colors"
            style={{
              backgroundColor: active ? 'rgba(78,168,222,0.25)' : 'transparent',
              border: active ? '1px solid #4ea8de' : '1px solid transparent',
              color: active ? '#4ea8de' : '#8888a0',
            }}
            data-testid={testId}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}

      <div className="w-full h-px my-0.5" style={{ backgroundColor: '#3a3a52' }} />

      <button
        onClick={onDelete}
        title="Delete"
        className="flex items-center justify-center w-8 h-8 rounded transition-colors"
        style={{ color: '#f07070', border: '1px solid transparent' }}
        data-testid="speed-delete"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <button
        onClick={onRunSimulation}
        disabled={simRunning}
        title="Run Simulation"
        className="flex items-center justify-center w-8 h-8 rounded transition-colors"
        style={{
          color: simRunning ? '#8888a0' : '#82e0a8',
          border: '1px solid transparent',
          opacity: simRunning ? 0.5 : 1,
          cursor: simRunning ? 'not-allowed' : 'pointer',
        }}
        data-testid="speed-run"
      >
        <Play className="w-4 h-4" />
      </button>

      <button
        onClick={onFullExtent}
        title="Full Extent"
        className="flex items-center justify-center w-8 h-8 rounded transition-colors"
        style={{ color: '#8888a0', border: '1px solid transparent' }}
        data-testid="speed-extent"
      >
        <Maximize className="w-4 h-4" />
      </button>
    </div>
  );
}
