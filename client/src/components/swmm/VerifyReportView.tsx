import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { diffOut, type Distribution, type OutDiff } from '@/lib/out-diff-core';
import type { SimulationResults } from '@/lib/swmm-types';

/**
 * The Verify view: what the two runs actually differ by, and what that does
 * not tell you.
 *
 * A comparison built on the reports alone leans on continuity, which is a
 * whole-run scalar computed from the very model under test — it closes whether
 * or not the change mattered, so it cannot distinguish "nothing happened" from
 * "the hydrograph moved but no water was lost". When both runs produced a
 * binary .out, this view measures the difference directly instead: every
 * reporting period, every element, against that element's own peak.
 *
 * Every claim here is either a measurement or an explicit refusal to make one.
 * The closing block is not decoration — a verification screen that lists
 * findings without listing its limits invites exactly the over-reading it
 * exists to prevent.
 */

const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '—');
const signedPct = (x: number) =>
  Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%` : '—';

function Section({ n, title, children }: { n?: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-bold text-[#2a2a3e] mb-1.5 flex items-center gap-1.5">
        {n === undefined
          ? <span className="w-4" />
          : <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#2c6eb5] text-white text-[9px]">{n}</span>}
        {title}
      </div>
      <div className="text-[10px] text-[#4a4a5a] leading-[1.6] pl-5.5">{children}</div>
    </div>
  );
}

function Note({ tone, children }: { tone: 'ok' | 'warn' | 'info'; children: React.ReactNode }) {
  const map = {
    ok: { icon: CheckCircle2, cls: 'border-[#1a9e8a] bg-[#effaf7] text-[#14705f]' },
    warn: { icon: AlertTriangle, cls: 'border-[#d08a1a] bg-[#fdf6e8] text-[#8a5a06]' },
    info: { icon: Info, cls: 'border-[#c0c0cc] bg-[#f6f6f9] text-[#4a4a5a]' },
  }[tone];
  const Icon = map.icon;
  return (
    <div className={`flex gap-1.5 items-start border rounded px-2 py-1.5 mb-2 ${map.cls}`}>
      <Icon className="w-3 h-3 mt-[1px] shrink-0" />
      <div className="text-[10px] leading-[1.5]">{children}</div>
    </div>
  );
}

function DistRow({ label, d }: { label: string; d: Distribution }) {
  return (
    <tr className="border-t border-[#e4e4ec]">
      <td className="py-1 pr-3 whitespace-nowrap">{label}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{d.n}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{pct(d.median)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{pct(d.p90)}</td>
      <td className="py-1 pr-3 text-right tabular-nums font-semibold">{pct(d.max)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{pct(d.past1)}</td>
      <td className="py-1 pr-3 text-right tabular-nums">{pct(d.past10)}</td>
      <td className="py-1 text-right tabular-nums">{pct(d.past25)}</td>
    </tr>
  );
}

function DistTable({ rows }: { rows: [string, Distribution][] }) {
  return (
    <table className="w-full text-[10px] mb-2">
      <thead>
        <tr className="text-[9px] uppercase tracking-wide text-[#80808f]">
          <th className="text-left font-semibold pb-1">measurement</th>
          <th className="text-right font-semibold pb-1">n</th>
          <th className="text-right font-semibold pb-1">median</th>
          <th className="text-right font-semibold pb-1">p90</th>
          <th className="text-right font-semibold pb-1">worst</th>
          <th className="text-right font-semibold pb-1">&gt;1%</th>
          <th className="text-right font-semibold pb-1">&gt;10%</th>
          <th className="text-right font-semibold pb-1">&gt;25%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, d]) => <DistRow key={label} label={label} d={d} />)}
      </tbody>
    </table>
  );
}

const FIDELITY_LABEL: Record<string, string> = {
  'native-binary': 'binary .out read directly from the engine',
  'report-summary': 'parsed from the .rpt text, not the binary .out',
  'synthetic-mock': 'synthetic placeholder — not an engine result',
};

export interface VerifyReportViewProps {
  results: SimulationResults | null;
  compareResults: SimulationResults | null;
  labelA: string;
  labelB: string;
}

export function VerifyReportView({ results, compareResults, labelA, labelB }: VerifyReportViewProps) {
  const outcome = useMemo(() => {
    if (!results?.outRaw?.length || !compareResults?.outRaw?.length) return null;
    try {
      return diffOut(results.outRaw, compareResults.outRaw);
    } catch (e) {
      return { kind: 'error' as const, message: e instanceof Error ? e.message : String(e) };
    }
  }, [results?.outRaw, compareResults?.outRaw]);

  const contA = results?.summary?.continuityErrors;
  const contB = compareResults?.summary?.continuityErrors;

  return (
    <div className="p-3 text-[10px] text-[#4a4a5a]" data-testid="report-verify-view">
      <div className="text-[12px] font-bold text-[#2a2a3e] mb-0.5">Verification</div>
      <div className="text-[10px] text-[#6b6b7b] mb-3">
        {labelA} (A) against {labelB} (B). Every number below is measured from these two runs;
        anything not measured is named as such.
      </div>

      <Section n={1} title="Parity contract — what each run actually is">
        <table className="w-full mb-2">
          <tbody>
            {([['A', labelA, results], ['B', labelB, compareResults]] as const).map(([tag, label, r]) => (
              <tr key={tag} className="border-t border-[#e4e4ec]">
                <td className="py-1 pr-3 font-semibold whitespace-nowrap">{tag} · {label}</td>
                <td className="py-1 pr-3">{r?.engineUsed ?? 'no run'}</td>
                <td className="py-1">
                  {r?.fidelity
                    ? FIDELITY_LABEL[r.fidelity] ?? r.fidelity
                    : 'fidelity not recorded'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(results?.fidelity === 'synthetic-mock' || compareResults?.fidelity === 'synthetic-mock') && (
          <Note tone="warn">
            One side is a synthetic placeholder. Nothing below is a statement about any engine.
          </Note>
        )}
        {(results?.isTruncated || compareResults?.isTruncated) && (
          <Note tone="warn">
            At least one run was decimated for display ({results?.samplingStride ?? 1}× / {compareResults?.samplingStride ?? 1}×).
            The diff below reads the full binary .out, not the decimated series, so it is unaffected —
            but the plots elsewhere in the app are.
          </Note>
        )}
      </Section>

      <Section n={2} title="The diagnostic that is blind">
        <table className="w-full mb-1">
          <thead>
            <tr className="text-[9px] uppercase tracking-wide text-[#80808f]">
              <th className="text-left font-semibold pb-1">continuity error</th>
              <th className="text-right font-semibold pb-1">A</th>
              <th className="text-right font-semibold pb-1">B</th>
            </tr>
          </thead>
          <tbody>
            {([['runoff', contA?.runoff, contB?.runoff], ['flow routing', contA?.flow, contB?.flow]] as const).map(([k, a, b]) => (
              <tr key={k} className="border-t border-[#e4e4ec]">
                <td className="py-1">{k}</td>
                <td className="py-1 text-right tabular-nums">{Number.isFinite(a as number) ? `${a}%` : '—'}</td>
                <td className="py-1 text-right tabular-nums">{Number.isFinite(b as number) ? `${b}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-[9px] text-[#80808f] italic">
          Continuity balances volumes computed from the same geometry under test, so it closes whether
          or not that geometry is right. Read it as a sanity check on each run, never as a measure of
          the difference between them.
        </div>
      </Section>

      {!outcome && (
        <Section n={3} title="The measurement that is not">
          <Note tone="info">
            A direct results diff needs a binary <code>.out</code> from both runs. At least one side
            does not have one, so no per-element comparison is offered here rather than substituting a
            weaker number from the report text.
          </Note>
        </Section>
      )}

      {outcome && outcome.kind === 'error' && (
        <Section n={3} title="The measurement that is not">
          <Note tone="warn">Could not read the binary results: {outcome.message}</Note>
        </Section>
      )}

      {outcome && outcome.kind === 'refused' && (
        <Section n={3} title="Refused — these runs are not answering the same question">
          <Note tone="warn">
            <ul className="list-disc pl-4">
              {outcome.problems.map(p => <li key={p}>{p}</li>)}
            </ul>
            <div className="mt-1">
              Aligning them by guesswork would produce a number describing two different questions
              rather than one change, so no comparison is made.
            </div>
          </Note>
        </Section>
      )}

      {outcome && outcome.kind === 'diff' && <DiffBody d={outcome} />}

      <Section n={7} title="What this does not show">
        <ul className="list-disc pl-4 space-y-0.5">
          <li>No field data. Nothing here says which run is closer to a real pipe network — only how far apart they are.</li>
          <li>One network and one event. Another model or another storm can reorder these results entirely.</li>
          <li>
            Nothing about speed. Each engine ran once, and one run each cannot separate a difference
            from run-to-run noise. Any timing quoted from these two runs would be unresolved.
          </li>
          <li>Nothing about elements below the magnitude floor, or link types excluded from the comparison.</li>
          <li>
            Nothing about which side is right. This measures how far two sets of output disagree —
            two engines, two builds, or two configurations — and disagreement alone does not say which
            one is wrong, or that either is accurate. Accuracy needs observations this app does not have.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function DiffBody({ d }: { d: OutDiff }) {
  const census = Object.entries(d.typeCensus)
    .map(([k, v]) => `${v} ${k.toLowerCase()}${v === 1 ? '' : 's'}`)
    .join(', ');

  return (
    <>
      <Section n={3} title="Census — what was actually compared">
        <div className="mb-1">
          {d.nNode} nodes, {d.nLink} links ({census}), {d.nSub} subcatchments ·{' '}
          {d.nPeriods} reporting periods at {d.reportStep}s · flow in {d.flowUnitName}
        </div>
        <div className="mb-1">
          Comparing <strong>{d.comparedLinks}</strong> link{d.comparedLinks === 1 ? '' : 's'}
          {d.excludedLinks > 0 && (
            <> — {d.excludedLinks} excluded because pumps, orifices, weirs and outlets are driven by
            control rules and answer a different question from the routing</>
          )}.
        </div>
        <div>
          Magnitude floor: {d.floor.toPrecision(3)} {d.flowUnitName} (1 L/s) for flow,{' '}
          {d.nodeFloor.toPrecision(3)} {d.si ? 'm' : 'ft'} (1 mm) for depth.{' '}
          {d.belowFloor} element{d.belowFloor === 1 ? '' : 's'} never cleared it and{' '}
          {d.belowFloor === 1 ? 'was' : 'were'} dropped, so a large swing in a trickle cannot become a
          headline.
        </div>
        {(d.errorCodes[0] !== 0 || d.errorCodes[1] !== 0) && (
          <Note tone="warn">
            Engine error codes A={d.errorCodes[0]} B={d.errorCodes[1]} — at least one run did not
            finish cleanly.
          </Note>
        )}
      </Section>

      <Section n={4} title="Null-effect control">
        {d.identical ? (
          <Note tone="ok">
            The two <code>.out</code> files are <strong>byte-identical</strong>. The two runs produced
            exactly the same results, and nothing further is claimed.
          </Note>
        ) : (
          <Note tone="info">
            The two <code>.out</code> files differ, so there is something to measure. (Had they been
            byte-identical, that would be the whole finding.)
          </Note>
        )}
      </Section>

      {!d.identical && (
        <>
          <Section n={5} title="Disagreement, each element against its own peak">
            <DistTable rows={[
              ['conduits — worst over the run', d.linkWorst],
              ['conduits — time-averaged', d.linkMean],
              ['node depth — worst over the run', d.nodeWorst],
              ['node depth — time-averaged', d.nodeMean],
              [`all — at the worst instant (${(d.worstPeriodSeconds / 3600).toFixed(2)} h)`, d.atWorstInstant],
            ]} />
            <div className="text-[9px] text-[#80808f] italic">
              Each element is normalised to its own peak, so a small pipe and a trunk sewer are weighted
              the same. The worst instant is the single reporting period at which the largest share of
              elements disagree past 10% of their own peak.
            </div>
          </Section>

          <Section n={6} title="What kind of change it is">
            <table className="w-full mb-1">
              <tbody>
                <tr className="border-t border-[#e4e4ec]">
                  <td className="py-1 pr-3">peak magnitude (conduits)</td>
                  <td className="py-1 pr-3 text-right tabular-nums">median {pct(d.peakChange.median)}</td>
                  <td className="py-1 text-right tabular-nums">worst {pct(d.peakChange.max)}</td>
                </tr>
                <tr className="border-t border-[#e4e4ec]">
                  <td className="py-1 pr-3">shape and timing, peak change divided out</td>
                  <td className="py-1 pr-3 text-right tabular-nums">median {pct(d.shapeAndTiming.median)}</td>
                  <td className="py-1 text-right tabular-nums">worst {pct(d.shapeAndTiming.max)}</td>
                </tr>
                <tr className="border-t border-[#e4e4ec]">
                  <td className="py-1 pr-3">conduits whose peak arrival moved</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{d.peakMoved} of {d.linkWorst.n}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <div className="text-[9px] text-[#80808f] italic">
              A change that rescales the answer and a change that reshapes it are different findings,
              and one summary number hides both — so they are reported apart. They are separate
              statistics over the same elements, normalised differently, and they do not add up to the
              total: read each on its own rather than as shares of one budget. Elements where one side
              never rises off zero have no common scale to divide out, so their shape figure is
              undefined rather than zero.
            </div>
          </Section>

          <Section title="Worst elements">
            <table className="w-full">
              <thead>
                <tr className="text-[9px] uppercase tracking-wide text-[#80808f]">
                  <th className="text-left font-semibold pb-1">element</th>
                  <th className="text-left font-semibold pb-1">kind</th>
                  <th className="text-right font-semibold pb-1">worst</th>
                  <th className="text-right font-semibold pb-1">mean</th>
                  <th className="text-right font-semibold pb-1">peak A</th>
                  <th className="text-right font-semibold pb-1">peak B</th>
                  <th className="text-right font-semibold pb-1">Δpeak</th>
                </tr>
              </thead>
              <tbody>
                {[...d.elements].sort((x, y) => y.worst - x.worst).slice(0, 12).map(e => (
                  <tr key={`${e.kind}:${e.name}`} className="border-t border-[#e4e4ec]">
                    <td className="py-1 pr-2 font-mono">{e.name}</td>
                    <td className="py-1 pr-2">{e.kind}</td>
                    <td className="py-1 pr-2 text-right tabular-nums font-semibold">{pct(e.worst)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{pct(e.mean)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{e.peakA.toPrecision(4)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{e.peakB.toPrecision(4)}</td>
                    <td className="py-1 text-right tabular-nums">{signedPct(e.peakChange)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </>
  );
}
