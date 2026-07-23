import { useEffect, useRef, useState } from 'react';
import { X, ExternalLink, RefreshCw } from 'lucide-react';
import type { SwmmProject } from '@/lib/swmm-types';
import { projectToInp } from '@/lib/inp-parser';

interface Viewer3DDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: SwmmProject | null;
  projectName?: string;
}

export default function Viewer3DDialog({ open, onOpenChange, project, projectName }: Viewer3DDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'loading' | 'sent' | 'confirmed' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const sentRef = useRef(false);
  const confirmedRef = useRef(false);

  const sendModel = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !project) return;
    try {
      const inp = projectToInp(project);
      win.postMessage(
        { type: 'load-inp', inp, name: (projectName || project.title?.[0] || 'model') + '.inp' },
        window.location.origin,
      );
      sentRef.current = true;
      setStatus('sent');
    } catch (e) {
      console.warn('3D viewer: failed to send model', e);
    }
  };

  useEffect(() => {
    if (!open) { sentRef.current = false; confirmedRef.current = false; setStatus('loading'); setErrorMsg(null); return; }
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'swmm3d-ready') {
        // Viewer just finished booting — (re)send unless already acknowledged.
        // An earlier fallback send may have been posted before the viewer's
        // listener existed, so "ready" always wins over sentRef.
        if (!confirmedRef.current) sendModel();
      } else if (d.type === 'swmm3d-loaded') {
        confirmedRef.current = true;
        if (d.ok === false) {
          setErrorMsg(typeof d.error === 'string' ? d.error : 'Viewer could not load the model');
          setStatus('error');
        } else {
          setStatus('confirmed');
        }
      }
    };
    window.addEventListener('message', onMsg);
    // Fallback in case the ready announcement raced ahead of our listener
    const t = setTimeout(() => { if (!sentRef.current) sendModel(); }, 2500);
    return () => { window.removeEventListener('message', onMsg); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" data-testid="dialog-3d-viewer">
      <div className="bg-white rounded-lg shadow-2xl w-full h-full max-w-[1400px] flex flex-col overflow-hidden border border-[#d0d0d8]">
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#2c3e6b] text-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" data-testid="text-3d-title">3D Network Viewer</span>
            <span className="text-[11px] text-white/70">
              {status === 'confirmed' ? 'Model loaded' : status === 'error' ? (errorMsg || 'Viewer error') : status === 'sent' ? 'Sending model…' : 'Loading viewer…'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { sentRef.current = false; sendModel(); }}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded hover:bg-white/15 transition-colors"
              title="Re-send current model to the viewer"
              data-testid="btn-3d-resend"
            >
              <RefreshCw className="w-3 h-3" /> Reload model
            </button>
            <a
              href="/3d-viewer.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded hover:bg-white/15 transition-colors"
              title="Open in new tab"
              data-testid="link-3d-newtab"
            >
              <ExternalLink className="w-3 h-3" /> New tab
            </a>
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-white/15 transition-colors"
              data-testid="btn-3d-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <iframe
          ref={iframeRef}
          src="/3d-viewer.html"
          title="SWMM 3D Viewer"
          sandbox="allow-scripts allow-same-origin allow-downloads"
          className="flex-1 w-full border-0"
          data-testid="iframe-3d-viewer"
        />
      </div>
    </div>
  );
}
