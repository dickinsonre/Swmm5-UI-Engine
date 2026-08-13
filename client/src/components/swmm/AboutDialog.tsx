import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Droplets } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function AboutDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white border-[#d0d0d8]" data-testid="about-dialog">
        <DialogHeader>
          <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
            <Droplets className="w-5 h-5" /> EPA SWMM5 — Web Edition
          </DialogTitle>
          <DialogDescription>Storm Water Management Model</DialogDescription>
        </DialogHeader>
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
          </div>
          <div className="border-t border-[#e0e0e8] pt-3">
            <div className="text-[10px] text-[#6b6b7b] space-y-0.5">
              <div>EPA SWMM is public domain software.</div>
              <div>EPANET-UI is maintained by OpenWaterAnalytics.</div>
              <div>Web interface built with React, Canvas rendering, and local/WASM/remote engine support.</div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="btn-close-about">Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
