import { useRef, useSyncExternalStore, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileWarning, Paperclip, Trash2, CheckCircle2 } from 'lucide-react';
import type { SwmmProject } from '@/lib/swmm-types';
import {
  collectExternalRefs,
  getAttachment,
  addAttachment,
  removeAttachment,
  subscribeAttachments,
  getAttachmentsSnapshot,
  attachmentKey,
  type Attachment,
} from '@/lib/external-files';

export function useAttachments(): Attachment[] {
  return useSyncExternalStore(subscribeAttachments, getAttachmentsSnapshot, getAttachmentsSnapshot);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: SwmmProject;
  onAttached?: (names: string[]) => void;
}

/**
 * Manage the data files an .inp references but does not contain.
 *
 * Desktop SWMM finds these because they sit in the same folder as the model.
 * The browser never sees that folder, so the user attaches them here once and
 * every engine run places them beside the model.
 */
export function DataFilesDialog({ open, onOpenChange, project, onAttached }: Props) {
  const attachments = useAttachments();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const refs = collectExternalRefs(project);

  const take = async (files: FileList | File[] | null) => {
    if (!files) return;
    const added: string[] = [];
    for (const f of Array.from(files)) {
      await addAttachment(f);
      added.push(f.name);
    }
    if (added.length) onAttached?.(added);
  };

  // An attachment nothing in the model asks for — kept, but called out so the
  // user is not left believing a misnamed file is wired up.
  const referenced = new Set(refs.map(r => attachmentKey(r.path)));
  const unused = attachments.filter(a => !referenced.has(attachmentKey(a.name)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-data-files">
        <DialogHeader>
          <DialogTitle>External Data Files</DialogTitle>
          <DialogDescription>
            Files your model refers to by name but does not contain. On the desktop these sit next to the .inp;
            attach them here and they will be placed beside the model for every run.
          </DialogDescription>
        </DialogHeader>

        <div
          className={`border-2 border-dashed rounded-md p-4 text-center text-[12px] transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-[#d0d0d8]'}`}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); void take(e.dataTransfer.files); }}
          data-testid="data-files-dropzone"
        >
          Drop data files here, or{' '}
          <button className="text-blue-600 underline" onClick={() => inputRef.current?.click()} data-testid="btn-attach-data-file">
            browse
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            data-testid="input-attach-data-file"
            onChange={e => { void take(e.target.files); if (inputRef.current) inputRef.current.value = ''; }}
          />
        </div>

        <div className="max-h-[45vh] overflow-auto">
          {refs.length === 0 ? (
            <div className="text-[12px] text-[#70708a] py-3" data-testid="data-files-none-referenced">
              This model does not reference any external data files.
            </div>
          ) : (
            <table className="w-full text-[12px]" data-testid="data-files-table">
              <thead>
                <tr className="text-left text-[#70708a] border-b border-[#e0e0e8]">
                  <th className="py-1 font-medium">File referenced</th>
                  <th className="py-1 font-medium">Needed for</th>
                  <th className="py-1 font-medium">Status</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {refs.map(ref => {
                  const att = getAttachment(ref.path);
                  return (
                    <tr key={`${ref.ownerId}:${ref.path}`} className="border-b border-[#f0f0f4]" data-testid={`data-file-row-${ref.ownerId}`}>
                      <td className="py-1.5 font-mono">{ref.path}</td>
                      <td className="py-1.5 text-[#70708a]">{ref.purpose}</td>
                      <td className="py-1.5">
                        {att ? (
                          <span className="inline-flex items-center gap-1 text-green-700" data-testid={`data-file-attached-${ref.ownerId}`}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Attached ({formatSize(att.size)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700" data-testid={`data-file-missing-${ref.ownerId}`}>
                            <FileWarning className="w-3.5 h-3.5" /> Not attached
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">
                        {att ? (
                          <Button variant="ghost" size="sm" onClick={() => removeAttachment(ref.path)} data-testid={`btn-remove-data-file-${ref.ownerId}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
                            <Paperclip className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {unused.length > 0 && (
            <div className="mt-3 text-[11px] text-[#70708a]" data-testid="data-files-unused">
              Attached but not referenced by this model (check the file name matches the .inp):{' '}
              {unused.map(u => u.name).join(', ')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
