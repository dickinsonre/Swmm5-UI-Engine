import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LayoutGrid, ExternalLink, Plus, Trash2, Pencil, Check, X, Globe } from 'lucide-react';

interface AppLink {
  name: string;
  url: string;
}

const DEFAULT_APPS: AppLink[] = [
  { name: 'SWMM5/SWMM6 Phase Space', url: 'https://swmm5-swmm6-phase-space.netlify.app/' },
  { name: 'SWMM5 3D Viewer', url: 'https://swmm5-3d-viewer.netlify.app/' },
];

const STORAGE_KEY = 'swmm-ui-app-links';

function loadApps(): AppLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every(a => typeof a?.name === 'string' && typeof a?.url === 'string')) {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_APPS;
}

function saveApps(apps: AppLink[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(apps)); } catch { /* ignore */ }
}

function isValidUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch { return false; }
}

export default function AppsLauncherDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [apps, setApps] = useState<AppLink[]>(loadApps);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [urlError, setUrlError] = useState(false);

  useEffect(() => {
    if (open) {
      const loaded = loadApps();
      setApps(loaded);
      setActiveUrl(prev => prev ?? loaded[0]?.url ?? null);
      setEditing(null);
    }
  }, [open]);

  const startEdit = (idx: number | 'new') => {
    if (idx === 'new') { setEditName(''); setEditUrl(''); }
    else { setEditName(apps[idx].name); setEditUrl(apps[idx].url); }
    setUrlError(false);
    setEditing(idx);
  };

  const commitEdit = () => {
    const name = editName.trim() || editUrl.trim();
    const url = editUrl.trim();
    if (!isValidUrl(url)) { setUrlError(true); return; }
    let next: AppLink[];
    if (editing === 'new') next = [...apps, { name, url }];
    else next = apps.map((a, i) => i === editing ? { name, url } : a);
    setApps(next);
    saveApps(next);
    setEditing(null);
    setActiveUrl(url);
  };

  const removeApp = (idx: number) => {
    const removed = apps[idx];
    const next = apps.filter((_, i) => i !== idx);
    setApps(next);
    saveApps(next);
    if (activeUrl === removed.url) setActiveUrl(next[0]?.url ?? null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[94vw] h-[88vh] flex flex-col p-0 gap-0" data-testid="dialog-apps-launcher">
        <DialogHeader className="px-4 pt-3 pb-2 shrink-0 border-b border-[#e0e0e8]">
          <DialogTitle className="flex items-center gap-2 text-[#2a2a3e] text-sm">
            <LayoutGrid className="w-4 h-4 text-[#2c6eb5]" />
            Companion Apps
          </DialogTitle>
          <DialogDescription className="text-[11px] text-[#6b6b7b]">
            Launch your external web apps. Your list is saved in this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex">
          <div className="w-[270px] shrink-0 border-r border-[#e0e0e8] bg-[#f8f8fa] flex flex-col">
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-2 space-y-1">
                {apps.map((app, i) => (
                  editing === i ? (
                    <div key={i} className="p-2 bg-white border border-[#2c6eb5] rounded space-y-1">
                      <input
                        className="w-full text-[10.5px] px-1.5 py-1 border border-[#d0d0d8] rounded outline-none focus:border-[#2c6eb5]"
                        placeholder="Name"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        data-testid="input-app-name"
                      />
                      <input
                        className={`w-full text-[10.5px] px-1.5 py-1 border rounded outline-none focus:border-[#2c6eb5] ${urlError ? 'border-red-500' : 'border-[#d0d0d8]'}`}
                        placeholder="https://…"
                        value={editUrl}
                        onChange={e => { setEditUrl(e.target.value); setUrlError(false); }}
                        data-testid="input-app-url"
                      />
                      {urlError && <div className="text-[9.5px] text-red-600">Enter a valid http(s) URL</div>}
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditing(null)} className="p-1 rounded hover:bg-[#f0f0f4]" data-testid="btn-app-edit-cancel"><X className="w-3.5 h-3.5 text-[#6b6b7b]" /></button>
                        <button onClick={commitEdit} className="p-1 rounded hover:bg-[#eef2f8]" data-testid="btn-app-edit-save"><Check className="w-3.5 h-3.5 text-[#2a8a4a]" /></button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={i}
                      className={`group flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer text-[10.5px] transition-colors
                        ${activeUrl === app.url ? 'bg-[#2c6eb5] text-white' : 'text-[#3a3a4a] hover:bg-[#eef2f8]'}`}
                      onClick={() => setActiveUrl(app.url)}
                      data-testid={`app-link-${i}`}
                    >
                      <Globe className={`w-3.5 h-3.5 shrink-0 ${activeUrl === app.url ? 'text-white/80' : 'text-[#6b6b7b]'}`} />
                      <span className="flex-1 truncate" title={app.url}>{app.name}</span>
                      <button
                        onClick={e => { e.stopPropagation(); startEdit(i); }}
                        className={`p-0.5 rounded opacity-0 group-hover:opacity-100 ${activeUrl === app.url ? 'hover:bg-white/20' : 'hover:bg-[#e0e6f0]'}`}
                        data-testid={`btn-app-edit-${i}`}
                      >
                        <Pencil className={`w-3 h-3 ${activeUrl === app.url ? 'text-white/80' : 'text-[#6b6b7b]'}`} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); removeApp(i); }}
                        className={`p-0.5 rounded opacity-0 group-hover:opacity-100 ${activeUrl === app.url ? 'hover:bg-white/20' : 'hover:bg-[#e0e6f0]'}`}
                        data-testid={`btn-app-remove-${i}`}
                      >
                        <Trash2 className={`w-3 h-3 ${activeUrl === app.url ? 'text-white/80' : 'text-red-500'}`} />
                      </button>
                    </div>
                  )
                ))}

                {editing === 'new' ? (
                  <div className="p-2 bg-white border border-[#2c6eb5] rounded space-y-1">
                    <input
                      className="w-full text-[10.5px] px-1.5 py-1 border border-[#d0d0d8] rounded outline-none focus:border-[#2c6eb5]"
                      placeholder="Name"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      autoFocus
                      data-testid="input-app-name"
                    />
                    <input
                      className={`w-full text-[10.5px] px-1.5 py-1 border rounded outline-none focus:border-[#2c6eb5] ${urlError ? 'border-red-500' : 'border-[#d0d0d8]'}`}
                      placeholder="https://…"
                      value={editUrl}
                      onChange={e => { setEditUrl(e.target.value); setUrlError(false); }}
                      data-testid="input-app-url"
                    />
                    {urlError && <div className="text-[9.5px] text-red-600">Enter a valid http(s) URL</div>}
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => setEditing(null)} className="p-1 rounded hover:bg-[#f0f0f4]" data-testid="btn-app-edit-cancel"><X className="w-3.5 h-3.5 text-[#6b6b7b]" /></button>
                      <button onClick={commitEdit} className="p-1 rounded hover:bg-[#eef2f8]" data-testid="btn-app-edit-save"><Check className="w-3.5 h-3.5 text-[#2a8a4a]" /></button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit('new')}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[10.5px] text-[#2c6eb5] hover:bg-[#eef2f8] border border-dashed border-[#c0c8d8]"
                    data-testid="btn-app-add"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add app…
                  </button>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="flex-1 min-w-0 bg-white flex flex-col">
            {activeUrl ? (
              <>
                <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-[#e0e0e8] bg-[#f8f8fa]">
                  <span className="text-[10px] text-[#6b6b7b] truncate flex-1" data-testid="text-app-url">{activeUrl}</span>
                  <a
                    href={activeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-[#2c6eb5] hover:underline shrink-0"
                    data-testid="link-app-open-tab"
                  >
                    <ExternalLink className="w-3 h-3" /> Open in new tab
                  </a>
                </div>
                <iframe
                  key={activeUrl}
                  src={activeUrl}
                  title="Companion app"
                  className="flex-1 w-full border-0"
                  sandbox="allow-scripts allow-forms allow-popups allow-downloads"
                  data-testid="iframe-app"
                />
                <div className="shrink-0 px-3 py-1 border-t border-[#e0e0e8] bg-[#f8f8fa] text-[9.5px] text-[#8a8a96]">
                  If the app appears blank, its host may block embedding — use "Open in new tab" instead.
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[11px] text-[#8a8a96]">
                Add an app link to get started
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
