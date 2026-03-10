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
  isMobile?: boolean;
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
  isMobile,
}: SpeedBarProps) {
  if (isMobile) {
    return (
      <div
        className="absolute bottom-2 left-2 right-2 flex flex-row gap-0.5 p-1 rounded-lg z-10 overflow-x-auto"
        style={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #d0d0d8', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', WebkitOverflowScrolling: 'touch' }}
        data-testid="speed-bar"
      >
        {tools.map(({ mode, icon: Icon, label, testId }) => {
          const active = interactionMode === mode;
          return (
            <button
              key={mode}
              onClick={() => onSetMode(mode)}
              title={label}
              className="flex items-center justify-center w-9 h-9 rounded transition-colors"
              style={{
                backgroundColor: active ? 'rgba(44,110,181,0.12)' : 'transparent',
                border: active ? '1px solid #2c6eb5' : '1px solid transparent',
                color: active ? '#2c6eb5' : '#6b6b7b',
              }}
              data-testid={testId}
            >
              <Icon className="w-4.5 h-4.5" />
            </button>
          );
        })}
        <div className="w-px h-9 mx-0.5" style={{ backgroundColor: '#d0d0d8' }} />
        <button onClick={onDelete} title="Delete" className="flex items-center justify-center w-9 h-9 rounded transition-colors" style={{ color: '#d04040' }} data-testid="speed-delete"><Trash2 className="w-4.5 h-4.5" /></button>
        <button onClick={onRunSimulation} disabled={simRunning} title="Run" className="flex items-center justify-center w-9 h-9 rounded transition-colors" style={{ color: simRunning ? '#6b6b7b' : '#2a8a4a', opacity: simRunning ? 0.5 : 1 }} data-testid="speed-run"><Play className="w-4.5 h-4.5" /></button>
        <button onClick={onFullExtent} title="Fit" className="flex items-center justify-center w-9 h-9 rounded transition-colors" style={{ color: '#6b6b7b' }} data-testid="speed-extent"><Maximize className="w-4.5 h-4.5" /></button>
      </div>
    );
  }

  return (
    <div
      className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 p-1.5 rounded-md z-10"
      style={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #d0d0d8' }}
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
              backgroundColor: active ? 'rgba(44,110,181,0.12)' : 'transparent',
              border: active ? '1px solid #2c6eb5' : '1px solid transparent',
              color: active ? '#2c6eb5' : '#6b6b7b',
            }}
            data-testid={testId}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}

      <div className="w-full h-px my-0.5" style={{ backgroundColor: '#d0d0d8' }} />

      <button
        onClick={onDelete}
        title="Delete"
        className="flex items-center justify-center w-8 h-8 rounded transition-colors"
        style={{ color: '#d04040', border: '1px solid transparent' }}
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
          color: simRunning ? '#6b6b7b' : '#2a8a4a',
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
        style={{ color: '#6b6b7b', border: '1px solid transparent' }}
        data-testid="speed-extent"
      >
        <Maximize className="w-4 h-4" />
      </button>
    </div>
  );
}
