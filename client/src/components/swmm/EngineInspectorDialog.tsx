// Engine Inspector ("calculation microscope"): for one conduit at one timestep,
// show Inputs → Intermediate calculations → Governing equation → Result,
// with an Equation Mode that substitutes live numbers into each formula.
import { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SwmmProject, SimulationResults } from '@/lib/swmm-types';
import { buildInspectorTrace, type InspectorTrace } from '@/lib/engine-insights';

interface Props {
  open: boolean;
  onClose: () => void;
  project: SwmmProject;
  results: SimulationResults;
  timeStep: number;
  setTimeStep: (t: number) => void;
  initialLinkId: string | null;
}

const fmt = (v: number | null | undefined, d = 3) =>
  v == null || !isFinite(v) ? '—' : v.toFixed(d);

function Row({ label, value, unit, mono = true }: { label: string; value: string; unit?: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 border-b" style={{ borderColor: '#f0f0f4' }}>
      <span className="text-[#6b6b7b]">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} text-right`}>{value}{unit ? <span className="text-[#9aa0a6] ml-1">{unit}</span> : null}</span>
    </div>
  );
}

function Eq({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] bg-[#f6f8fa] border rounded px-2 py-1 my-1 overflow-x-auto whitespace-nowrap" style={{ borderColor: '#e0e0e8' }}>
      {children}
    </div>
  );
}

export default function EngineInspectorDialog({ open, onClose, project, results, timeStep, setTimeStep, initialLinkId }: Props) {
  const conduitIds = useMemo(() => project.conduits.map(c => c.id), [project]);
  const [linkId, setLinkId] = useState<string>(initialLinkId || conduitIds[0] || '');
  const [equationMode, setEquationMode] = useState(true);

  useEffect(() => {
    if (open) {
      if (initialLinkId && conduitIds.includes(initialLinkId)) setLinkId(initialLinkId);
      else if (!conduitIds.includes(linkId) && conduitIds.length > 0) setLinkId(conduitIds[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialLinkId]);

  const maxT = results.timeSteps.length - 1;
  const trace: InspectorTrace | null = useMemo(
    () => (linkId ? buildInspectorTrace(project, results, linkId, timeStep) : null),
    [project, results, linkId, timeStep],
  );
  const dateTime = results.timeSteps[Math.max(0, Math.min(timeStep, maxT))]?.dateTime;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col bg-white text-[#2a2a3e]" data-testid="engine-inspector-dialog">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2 text-[#2a2a3e]">
            🔬 Engine Inspector
            {trace && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded text-white"
                style={{ backgroundColor: trace.regime.color }}
                data-testid="insp-regime-badge"
              >
                {trace.regime.label}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <label className="text-[#6b6b7b]">Conduit</label>
          <select
            value={linkId}
            onChange={e => setLinkId(e.target.value)}
            className="border rounded px-1.5 py-0.5 text-[11px] font-mono max-w-[160px]"
            style={{ borderColor: '#d0d0d8' }}
            data-testid="insp-link-select"
          >
            {conduitIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
          <label className="text-[#6b6b7b] ml-2">Timestep</label>
          <button className="border rounded px-1.5" style={{ borderColor: '#d0d0d8' }} onClick={() => setTimeStep(Math.max(0, timeStep - 1))} data-testid="insp-t-prev">◀</button>
          <input
            type="range" min={0} max={maxT} value={Math.min(timeStep, maxT)}
            onChange={e => setTimeStep(parseInt(e.target.value, 10))}
            className="w-40"
            data-testid="insp-t-slider"
          />
          <button className="border rounded px-1.5" style={{ borderColor: '#d0d0d8' }} onClick={() => setTimeStep(Math.min(maxT, timeStep + 1))} data-testid="insp-t-next">▶</button>
          <span className="font-mono text-[10px] text-[#6b6b7b]">
            {dateTime ? dateTime.toLocaleString() : `step ${timeStep}`}
          </span>
          <button
            onClick={() => setEquationMode(m => !m)}
            className={`ml-auto text-[10px] px-2 py-1 rounded border ${equationMode ? 'bg-[#2c6eb5] text-white border-[#2c6eb5]' : 'bg-white border-[#d0d0d8]'}`}
            data-testid="btn-equation-mode"
            title="Engineer Mode shows values; Engine Mode also shows the governing equations with live numbers substituted"
          >
            {equationMode ? 'Engine Mode (equations ON)' : 'Engineer Mode'}
          </button>
        </div>

        {!trace ? (
          <div className="text-[11px] text-[#6b6b7b] py-6 text-center">
            {conduitIds.length === 0 ? 'No conduits in this model.' : 'No result data for this conduit at this timestep.'}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-1 text-[11px] space-y-3">
            {/* 1. Inputs */}
            <section>
              <div className="font-semibold text-[#2c3e6b] mb-1">1 · Inputs</div>
              <div className="grid sm:grid-cols-2 gap-x-6">
                <div>
                  <Row label="Shape" value={trace.shape} mono={false} />
                  <Row label={`Depth full (geom1)`} value={fmt(trace.geom1)} unit={trace.units.len} />
                  <Row label="Length L" value={fmt(trace.length, 1)} unit={trace.units.len} />
                  <Row label="Manning n" value={fmt(trace.roughness, 4)} />
                  <Row label="Slope S₀" value={`${fmt(trace.slope * 100, 3)}%`} />
                </div>
                <div>
                  <Row label={`Upstream node (${trace.upNode}) invert`} value={fmt(trace.upInvert)} unit={trace.units.len} />
                  <Row label={`Downstream node (${trace.dnNode}) invert`} value={fmt(trace.dnInvert)} unit={trace.units.len} />
                  <Row label="Upstream head H₁" value={fmt(trace.upHead)} unit={trace.units.len} />
                  <Row label="Downstream head H₂" value={fmt(trace.dnHead)} unit={trace.units.len} />
                </div>
              </div>
            </section>

            {/* 2. Intermediate calculations */}
            <section>
              <div className="font-semibold text-[#2c3e6b] mb-1">2 · Intermediate calculations</div>
              {!trace.geometrySupported && (
                <div className="text-[10px] rounded border px-2 py-1.5 mb-1 bg-[#fdf3df] text-[#b0730a]" style={{ borderColor: '#e8d5a8' }} data-testid="insp-geom-unsupported">
                  Cross-section shape <b>{trace.shape}</b> is not supported by the inspector's geometry reconstruction —
                  A, P, R, T, D, normal flow, and full capacity are shown as unavailable. Engine-reported values (Q, V, Y, heads) are still exact.
                </div>
              )}
              {equationMode && trace.headGradient != null && (
                <Eq>∇H = (H₁ − H₂) / L = ({fmt(trace.upHead)} − {fmt(trace.dnHead)}) / {fmt(trace.length, 1)} = {fmt(trace.headGradient, 5)}</Eq>
              )}
              <div className="grid sm:grid-cols-2 gap-x-6">
                <div>
                  <Row label="Hydraulic gradient (H₁−H₂)/L" value={fmt(trace.headGradient, 5)} />
                  <Row label="Flow depth Y" value={fmt(trace.depth)} unit={trace.units.len} />
                  <Row label="Flow area A(Y)" value={fmt(trace.area)} unit={`${trace.units.len}²`} />
                  <Row label="Wetted perimeter P(Y)" value={fmt(trace.wettedP)} unit={trace.units.len} />
                </div>
                <div>
                  <Row label="Hydraulic radius R = A/P" value={fmt(trace.hydRadius)} unit={trace.units.len} />
                  <Row label="Top width T(Y)" value={fmt(trace.topWidth)} unit={trace.units.len} />
                  <Row label="Hydraulic depth D = A/T" value={fmt(trace.hydDepth)} unit={trace.units.len} />
                  <Row label="Velocity V" value={fmt(trace.velocity)} unit={trace.units.vel} />
                </div>
              </div>
              {equationMode && trace.geometrySupported && (
                <>
                  <Eq>R = A / P = {fmt(trace.area)} / {fmt(trace.wettedP)} = {fmt(trace.hydRadius)} {trace.units.len}</Eq>
                  <Eq>D = A / T = {fmt(trace.area)} / {fmt(trace.topWidth)} = {fmt(trace.hydDepth)} {trace.units.len}</Eq>
                </>
              )}
            </section>

            {/* 3. Governing equations */}
            <section>
              <div className="font-semibold text-[#2c3e6b] mb-1">3 · Governing equations</div>
              <div className="mb-1">Froude number:</div>
              <Eq>
                Fr = V / √(g·D) {equationMode && <> = {fmt(Math.abs(trace.velocity))} / √({trace.g.toFixed(2)} × {fmt(trace.hydDepth)}) </>} = <b>{fmt(trace.froude, 2)}</b>
              </Eq>
              <div className="mb-1 mt-2">Manning normal flow at current depth (S₀ = {fmt(trace.slope, 5)}):</div>
              <Eq>
                Qₙ = (φ/n)·A·R^⅔·√S₀ {equationMode && trace.normalFlow != null && <> = ({trace.phi.toFixed(4)}/{fmt(trace.roughness, 4)}) × {fmt(trace.area)} × {fmt(trace.hydRadius)}^⅔ × √{fmt(Math.max(trace.slope, 0), 5)} </>} = <b>{fmt(trace.normalFlow, 2)} {trace.units.flow}</b>
              </Eq>
              {trace.slope <= 0 && <div className="text-[10px] text-[#b0730a]">Adverse or flat slope — normal flow is undefined; the dynamic wave solution is driven by the head gradient instead.</div>}
              <div className="mb-1 mt-2">Full-pipe (design) capacity:</div>
              <Eq>Q_full = <b>{fmt(trace.fullFlow, 2)} {trace.units.flow}</b></Eq>
            </section>

            {/* 4. Result */}
            <section>
              <div className="font-semibold text-[#2c3e6b] mb-1">4 · Result (engine solution)</div>
              <div className="grid sm:grid-cols-2 gap-x-6">
                <div>
                  <Row label="Computed flow Q" value={fmt(trace.flow, 3)} unit={trace.units.flow} />
                  <Row label="Velocity" value={fmt(trace.velocity)} unit={trace.units.vel} />
                  <Row label="Froude number" value={fmt(trace.froude, 2)} />
                </div>
                <div>
                  <Row label="Fraction full (d/D)" value={fmt(trace.capacity, 2)} />
                  <Row label="Q / Q_full" value={trace.fullFlow ? fmt(Math.abs(trace.flow) / trace.fullFlow, 2) : '—'} />
                  <Row label="Surcharge state" value={trace.surcharged ? 'SURCHARGED' : 'free surface'} mono={false} />
                </div>
              </div>
              <div className="mt-2 text-[10px] rounded border px-2 py-1.5 bg-[#f8f8fa]" style={{ borderColor: '#e0e0e8' }} data-testid="insp-interpretation">
                <b>Interpretation:</b>{' '}
                {trace.froude > 1.05 ? 'Supercritical flow — inertia dominates; disturbances travel downstream only.'
                  : trace.froude > 0.95 ? 'Near-critical flow — the engine dampens inertial terms in this range (sigma weighting).'
                  : trace.depth <= 0.001 ? 'Dry conduit at this timestep.'
                  : 'Subcritical flow — backwater from downstream can influence this conduit.'}
                {trace.flow < -0.001 && ' Flow is reversed relative to the drawn direction.'}
                {trace.surcharged && ' The conduit is flowing full — pressurized (surcharged) conditions; the free-surface relations above are limits.'}
                {trace.normalFlow != null && Math.abs(trace.flow) > 0.001 && trace.normalFlow > 0 && Math.abs(trace.flow) < trace.normalFlow * 0.5 &&
                  ' Computed flow is well below normal flow — the conduit is outlet-controlled (downstream head limits discharge).'}
              </div>
              <div className="mt-1 text-[10px] text-[#9aa0a6]">
                Geometry terms (A, P, R, T, D) are reconstructed from the cross-section at the reported depth; Q, V, Y, and heads come from the engine's .out file at the reporting interval. Fr uses the engine value when available.
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
