import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Droplets, ArrowLeft, ExternalLink } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Apache-2.0 section 4(d) lets a NOTICE be reproduced in "the display generated
 * by the Derivative Works, if and wherever such third-party notices normally
 * appear". For a browser app that display is this panel, so the NOTICE text has
 * to actually be READABLE here — a link alone would leave the condition unmet
 * for anyone who only ever sees the deployed page.
 *
 * The text is fetched rather than inlined so there is exactly one copy of it in
 * the shipped app (client/public/licenses/NOTICE.txt, held byte-identical to
 * the repo root NOTICE by tests/attribution.test.ts). Inlining it in TSX would
 * create a second copy that drifts silently the next time upstream changes.
 */
// Built from BASE_URL, not hardcoded to "/", so the panel still resolves if the
// app is ever hosted under a subpath — a licence link that 404s satisfies
// nothing.
const LICENSES = `${import.meta.env.BASE_URL || '/'}licenses/`;
const NOTICE_URL = `${LICENSES}NOTICE.txt`;
const APACHE_URL = `${LICENSES}Apache-2.0-OpenSWMM.txt`;
const DEV_MIT_URL = `${LICENSES}MIT-OpenSWMM-develop.txt`;
const MIT_URL = `${LICENSES}LICENSE-MIT.txt`;
const OPENSWMM_REPO = 'https://github.com/HydroCouple/openswmm.engine';

function useNoticeText(active: boolean) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active || text !== null) return;
    let cancelled = false;
    fetch(NOTICE_URL)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(t => { if (!cancelled) setText(t); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [active, text]);

  return { text, failed };
}

function LicensesView({ onBack }: { onBack: () => void }) {
  const { text, failed } = useNoticeText(true);

  return (
    <div className="space-y-3 text-sm text-[#3a3a4a]" data-testid="licenses-view">
      <div className="space-y-2">
        <p className="text-xs leading-relaxed">
          <span className="font-semibold">SWMM5-UI</span> — Copyright © 2026 Robert Dickinson, released under the{' '}
          <a href={MIT_URL} target="_blank" rel="noopener noreferrer" className="text-[#2c6eb5] underline underline-offset-2" data-testid="link-mit-license">MIT License</a>.
          That covers this interface only. The simulation engines below are separate works under their own terms.
        </p>
      </div>

      <div className="border-t border-[#e0e0e8] pt-3 space-y-1.5">
        <div className="text-xs font-semibold text-[#2c3e6b]">OpenSWMM 6, release build — Apache License 2.0</div>
        <p className="text-xs leading-relaxed">
          OpenSWMM Engine — Copyright 2026 HydroCouple Developers, licensed under the{' '}
          <a href={APACHE_URL} target="_blank" rel="noopener noreferrer" className="text-[#2c6eb5] underline underline-offset-2" data-testid="link-apache-license">
            Apache License, Version 2.0 <ExternalLink className="w-3 h-3 inline-block -mt-0.5" />
          </a>
          . Source:{' '}
          <a href={OPENSWMM_REPO} target="_blank" rel="noopener noreferrer" className="text-[#2c6eb5] underline underline-offset-2" data-testid="link-openswmm-source">
            HydroCouple/openswmm.engine
          </a>
          , branch <code className="text-[11px] bg-[#f0f0f5] px-1 rounded">swmm6_rel</code>, version 6.0.0-alpha.3.
        </p>
        <p className="text-xs leading-relaxed">
          <span className="font-semibold">Modified:</span> the engine sources were changed before compilation to
          WebAssembly (Emscripten platform and threading fixes, and a consolidated LID report). The modified files,
          the changes, who made them and when are recorded in <code className="text-[11px] bg-[#f0f0f5] px-1 rounded">swmm-engine/patches/MODIFICATIONS.md</code>.
        </p>
      </div>

      <div className="border-t border-[#e0e0e8] pt-3 space-y-1.5">
        <div className="text-xs font-semibold text-[#2c3e6b]">OpenSWMM 6, develop build — MIT License</div>
        <p className="text-xs leading-relaxed" data-testid="dev-engine-licence">
          The second SWMM6 engine in this app is built from the same repository's{' '}
          <code className="text-[11px] bg-[#f0f0f5] px-1 rounded">develop</code> branch, which is licensed
          differently: Copyright 2026 Caleb Buahin, under the{' '}
          <a href={DEV_MIT_URL} target="_blank" rel="noopener noreferrer" className="text-[#2c6eb5] underline underline-offset-2" data-testid="link-develop-mit">
            MIT License <ExternalLink className="w-3 h-3 inline-block -mt-0.5" />
          </a>
          . The Apache NOTICE below does not apply to it. Also modified for the Emscripten build.
        </p>
      </div>

      <div className="border-t border-[#e0e0e8] pt-3 space-y-1.5">
        <div className="text-xs font-semibold text-[#2c3e6b]">EPA SWMM 5.2.4 engine — public domain</div>
        <p className="text-xs leading-relaxed">
          Derived from the Storm Water Management Model developed and released by the U.S. Environmental Protection
          Agency. Prepared by or for the United States Government and in the public domain: domestic copyright
          protection is not available for it under 17 USC § 105.
        </p>
      </div>

      <div className="border-t border-[#e0e0e8] pt-3 space-y-1.5">
        <div className="text-xs font-semibold text-[#2c3e6b]">NOTICE</div>
        <div
          className="max-h-64 overflow-auto rounded border border-[#e0e0e8] bg-[#fafafc] p-2"
          data-testid="notice-scroll"
        >
          {text !== null ? (
            <pre className="text-[10px] leading-[1.45] whitespace-pre-wrap font-mono text-[#3a3a4a]" data-testid="notice-text">{text}</pre>
          ) : failed ? (
            <div className="text-[11px] text-[#8a3a3a]" data-testid="notice-error">
              Could not load the NOTICE text.{' '}
              <a href={NOTICE_URL} target="_blank" rel="noopener noreferrer" className="text-[#2c6eb5] underline underline-offset-2">
                Open it directly
              </a>
              , or read the NOTICE file shipped alongside this application.
            </div>
          ) : (
            <div className="text-[11px] text-[#6b6b7b]" data-testid="notice-loading">Loading NOTICE…</div>
          )}
        </div>
      </div>

      <div className="border-t border-[#e0e0e8] pt-3">
        <p className="text-[10px] leading-relaxed text-[#6b6b7b]" data-testid="no-endorsement">
          Neither the USEPA nor HydroCouple endorses this product. The names “EPA”, “USEPA”, “SWMM”, “OpenSWMM” and
          “HydroCouple” are used solely to describe the origin of the software included here. This is not an official
          EPA, HydroCouple or OpenSWMM release, and it is not SWMM 6 itself.
        </p>
      </div>

      <div className="flex justify-between pt-1">
        <Button variant="outline" size="sm" onClick={onBack} data-testid="btn-licenses-back">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
        </Button>
      </div>
    </div>
  );
}

export default function AboutDialog({ open, onOpenChange }: Props) {
  const [showLicenses, setShowLicenses] = useState(false);

  // Reopening the dialog should land on About, not wherever it was left.
  useEffect(() => { if (!open) setShowLicenses(false); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${showLicenses ? 'max-w-2xl' : 'max-w-md'} bg-white border-[#d0d0d8] max-h-[85vh] overflow-y-auto`}
        data-testid="about-dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
            <Droplets className="w-5 h-5" /> {showLicenses ? 'Licenses & attribution' : 'EPA SWMM5 — Web Edition'}
          </DialogTitle>
          <DialogDescription>
            {showLicenses ? 'Third-party notices for the engines this application includes' : 'Storm Water Management Model'}
          </DialogDescription>
        </DialogHeader>

        {showLicenses ? (
          <LicensesView onBack={() => setShowLicenses(false)} />
        ) : (
          <div className="space-y-4 text-sm text-[#3a3a4a]">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2c6eb5 0%, #2c3e6b 100%)' }}>
                <Droplets className="w-10 h-10 text-white" />
              </div>
              <div>
                <div className="font-bold text-base text-[#2c3e6b]">SWMM 5.2</div>
                <div className="text-[11px] text-[#6b6b7b]">Web-Based Interface</div>
                <div className="text-[11px] text-[#6b6b7b]">Engine Version: 5.2.004</div>
              </div>
            </div>
            <div className="border-t border-[#e0e0e8] pt-3 space-y-2">
              <p className="text-xs leading-relaxed">
                The Storm Water Management Model (SWMM) is used for planning, analysis, and design related to stormwater runoff, combined and sanitary sewers, and other drainage systems.
              </p>
              <p className="text-xs leading-relaxed">
                Originally developed by the U.S. Environmental Protection Agency (EPA). This web-based interface provides access to SWMM's full modeling capabilities through a modern browser-based environment.
              </p>
            </div>
            <div className="border-t border-[#e0e0e8] pt-3 space-y-2">
              <div className="text-xs font-semibold text-[#2c3e6b]">Credits &amp; Acknowledgements</div>
              <p className="text-xs leading-relaxed">
                With gratitude to <span className="font-semibold">Dr. Lewis A. Rossman</span>, author of SWMM and EPANET.
                For more than thirty years, modelers and modellers around the world have built their careers on his code.
              </p>
              <p className="text-xs leading-relaxed">
                The interface design here also draws on his{' '}
                <a
                  href="https://github.com/OpenWaterAnalytics/EPANET-UI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2c6eb5] underline underline-offset-2 hover:text-[#2c3e6b]"
                  data-testid="link-epanet-ui"
                >
                  EPANET-UI
                </a>
                , which this project uses and adapts for SWMM5 — including the side-by-side SWMM5 vs. SWMM6 comparison.
                Like almost everything Lew has made across his career, it is open source, and there is a great deal to
                learn from reading it.
              </p>
              <p className="text-xs leading-relaxed">
                The <span className="font-semibold">OpenSWMM 6</span> engine is developed by the HydroCouple/OpenSWMM
                project — Caleb Buahin (lead developer), Corinne Wiesner-Friedman (developer, documentation, technical
                review) and Scott Jeffers (documentation and outreach).
              </p>
            </div>
            <div className="border-t border-[#e0e0e8] pt-3">
              <div className="text-[10px] text-[#6b6b7b] space-y-0.5">
                <div>EPA SWMM is public domain software.</div>
                <div>OpenSWMM 6 is © 2026 HydroCouple Developers, Apache-2.0. Modified for the WebAssembly build.</div>
                <div>EPANET-UI is maintained by OpenWaterAnalytics.</div>
                <div>Web interface built with React, Canvas rendering, and local/WASM/remote engine support.</div>
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setShowLicenses(true)} data-testid="btn-show-licenses">
                Licenses &amp; attribution
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="btn-close-about">Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
