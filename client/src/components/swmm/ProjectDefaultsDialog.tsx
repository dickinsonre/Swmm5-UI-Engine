import { useState, useCallback } from 'react';
import type { SwmmProject } from '@/lib/swmm-types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: SwmmProject;
  onUpdateProject: (updater: (prev: SwmmProject) => SwmmProject) => void;
}

const TABS = ['ID Labels', 'Subcatchments', 'Nodes', 'Links', 'Conduits'] as const;
type Tab = typeof TABS[number];

interface DefaultValues {
  idPrefix: Record<string, string>;
  subcatch: Record<string, string>;
  node: Record<string, string>;
  link: Record<string, string>;
  conduit: Record<string, string>;
}

const INITIAL_DEFAULTS: DefaultValues = {
  idPrefix: { junction: 'J', outfall: 'O', divider: 'D', storage: 'SU', conduit: 'C', pump: 'P', orifice: 'OR', weir: 'W', outlet: 'OL', subcatchment: 'S', raingage: 'RG' },
  subcatch: { area: '5', width: '500', slope: '0.5', imperv: '25', nImperv: '0.01', nPerv: '0.1', dstoreImperv: '0.05', dstorePerv: '0.05', pctZero: '25', infiltMethod: 'HORTON', maxRate: '3', minRate: '0.5', decay: '4', dryTime: '7' },
  node: { invertEl: '0', maxDepth: '4', initDepth: '0', surDepth: '0', pondedArea: '0' },
  link: { length: '400', roughness: '0.01', inOffset: '0', outOffset: '0' },
  conduit: { shape: 'CIRCULAR', geom1: '1', geom2: '0', barrels: '1' },
};

export default function ProjectDefaultsDialog({ open, onOpenChange, project, onUpdateProject }: Props) {
  const [tab, setTab] = useState<Tab>('ID Labels');
  const stored = (project.options?.DEFAULTS as unknown as DefaultValues) || INITIAL_DEFAULTS;
  const [defaults, setDefaults] = useState<DefaultValues>({ ...INITIAL_DEFAULTS, ...stored });

  const updateField = useCallback((category: keyof DefaultValues, key: string, value: string) => {
    setDefaults(prev => ({ ...prev, [category]: { ...prev[category], [key]: value } }));
  }, []);

  const handleApply = useCallback(() => {
    onUpdateProject(prev => ({
      ...prev,
      options: { ...prev.options, DEFAULTS: defaults as any },
    }));
    onOpenChange(false);
  }, [defaults, onUpdateProject, onOpenChange]);

  const renderField = (category: keyof DefaultValues, key: string, label: string, type: 'text' | 'number' = 'text') => (
    <div className="flex items-center gap-2" key={key}>
      <Label className="text-[11px] text-[#3a3a4a] w-32 shrink-0">{label}</Label>
      <Input
        className="h-7 text-[11px] flex-1"
        type={type}
        value={defaults[category][key] || ''}
        onChange={e => updateField(category, key, e.target.value)}
        data-testid={`default-${category}-${key}`}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white border-[#d0d0d8] max-h-[85vh] overflow-y-auto" data-testid="project-defaults-dialog">
        <DialogHeader>
          <DialogTitle className="text-[#2c3e6b] flex items-center gap-2">
            <Settings className="w-4 h-4" /> Project Defaults
          </DialogTitle>
          <DialogDescription>Set default properties for new objects added to the project.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-3">
          <div className="flex flex-col gap-0.5 min-w-[110px] border-r border-[#e0e0e8] pr-2">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="text-left text-[11px] px-2 py-1.5 rounded transition-colors"
                style={{ backgroundColor: tab === t ? '#2c6eb5' : 'transparent', color: tab === t ? '#fff' : '#3a3a4a', fontWeight: tab === t ? 600 : 400 }}
                data-testid={`defaults-tab-${t.toLowerCase().replace(/\s/g, '-')}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-2.5 min-h-[300px]">
            {tab === 'ID Labels' && (
              <div className="space-y-2">
                <div className="text-[10px] text-[#6b6b7b] font-medium uppercase tracking-wide">ID Prefixes for New Objects</div>
                {Object.entries(defaults.idPrefix).map(([k]) =>
                  renderField('idPrefix', k, k.charAt(0).toUpperCase() + k.slice(1))
                )}
              </div>
            )}
            {tab === 'Subcatchments' && (
              <div className="space-y-2">
                <div className="text-[10px] text-[#6b6b7b] font-medium uppercase tracking-wide">Subcatchment Defaults</div>
                {renderField('subcatch', 'area', 'Area', 'number')}
                {renderField('subcatch', 'width', 'Width', 'number')}
                {renderField('subcatch', 'slope', '% Slope', 'number')}
                {renderField('subcatch', 'imperv', '% Imperv', 'number')}
                {renderField('subcatch', 'nImperv', 'N-Imperv', 'number')}
                {renderField('subcatch', 'nPerv', 'N-Perv', 'number')}
                {renderField('subcatch', 'dstoreImperv', 'Dstore-Imperv', 'number')}
                {renderField('subcatch', 'dstorePerv', 'Dstore-Perv', 'number')}
                {renderField('subcatch', 'pctZero', '% Zero-Imperv', 'number')}
              </div>
            )}
            {tab === 'Nodes' && (
              <div className="space-y-2">
                <div className="text-[10px] text-[#6b6b7b] font-medium uppercase tracking-wide">Node Defaults</div>
                {renderField('node', 'invertEl', 'Invert Elev.', 'number')}
                {renderField('node', 'maxDepth', 'Max. Depth', 'number')}
                {renderField('node', 'initDepth', 'Init. Depth', 'number')}
                {renderField('node', 'surDepth', 'Surcharge Depth', 'number')}
                {renderField('node', 'pondedArea', 'Ponded Area', 'number')}
              </div>
            )}
            {tab === 'Links' && (
              <div className="space-y-2">
                <div className="text-[10px] text-[#6b6b7b] font-medium uppercase tracking-wide">Link Defaults</div>
                {renderField('link', 'length', 'Length', 'number')}
                {renderField('link', 'roughness', 'Roughness', 'number')}
                {renderField('link', 'inOffset', 'Inlet Offset', 'number')}
                {renderField('link', 'outOffset', 'Outlet Offset', 'number')}
              </div>
            )}
            {tab === 'Conduits' && (
              <div className="space-y-2">
                <div className="text-[10px] text-[#6b6b7b] font-medium uppercase tracking-wide">Conduit Cross-Section Defaults</div>
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-[#3a3a4a] w-32 shrink-0">Shape</Label>
                  <Select value={defaults.conduit.shape || 'CIRCULAR'} onValueChange={v => updateField('conduit', 'shape', v)}>
                    <SelectTrigger className="h-7 text-[11px] flex-1" data-testid="default-conduit-shape">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['CIRCULAR', 'FORCE_MAIN', 'FILLED_CIRCULAR', 'RECT_CLOSED', 'RECT_OPEN', 'TRAPEZOIDAL', 'TRIANGULAR', 'HORIZ_ELLIPSE', 'VERT_ELLIPSE', 'ARCH', 'PARABOLIC', 'POWER', 'RECT_TRIANGULAR', 'RECT_ROUND', 'MOD_BASKET', 'EGG', 'HORSESHOE', 'GOTHIC', 'CATENARY', 'SEMI_ELLIPTICAL', 'BASKET_HANDLE', 'SEMI_CIRCULAR', 'IRREGULAR', 'CUSTOM'].map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {renderField('conduit', 'geom1', 'Max. Height', 'number')}
                {renderField('conduit', 'geom2', 'Max. Width', 'number')}
                {renderField('conduit', 'barrels', '# Barrels', 'number')}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-[#e0e0e8]">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="btn-defaults-cancel">Cancel</Button>
          <Button size="sm" onClick={handleApply} style={{ backgroundColor: '#2c6eb5' }} data-testid="btn-defaults-apply">Apply</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
