import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  type SwmmVariable, type VarScope,
  PROVENANCE_INFO, getVarProvenance, findVarByKey,
} from '@/lib/swmm-variables';

interface ProvenanceBadgeProps {
  variable?: SwmmVariable;
  varKey?: string;
  scope?: VarScope;
}

export default function ProvenanceBadge({ variable, varKey, scope }: ProvenanceBadgeProps) {
  const v = variable ?? (varKey && scope ? findVarByKey(varKey, scope) : undefined);
  if (!v) return null;
  const { prov, explain } = getVarProvenance(v);
  const info = PROVENANCE_INFO[prov];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center shrink-0 rounded-sm px-1 py-0 text-[7px] font-bold leading-[11px] tracking-wide cursor-pointer border align-middle"
          style={{ color: info.color, backgroundColor: info.bg, borderColor: `${info.color}55` }}
          title={info.label}
          onClick={e => e.stopPropagation()}
          data-testid={`badge-provenance-${v.key}`}
        >
          {info.short}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 bg-white border-[#d0d0d8] shadow-xl z-[100]"
        onClick={e => e.stopPropagation()}
        data-testid={`popover-provenance-${v.key}`}
      >
        <div className="px-3 py-2 border-b border-[#e8e8f0]" style={{ backgroundColor: info.bg }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold" style={{ color: info.color }}>{info.label}</span>
            <span className="text-[9px] font-mono text-[#6b6b7b]">{v.units || '\u2014'}</span>
          </div>
          <div className="text-[10px] font-semibold text-[#2a2a3e] mt-0.5">{v.name}</div>
        </div>
        <div className="px-3 py-2 space-y-1.5 text-[9px] leading-relaxed text-[#4a4a5a]">
          <p className="text-[9px] text-[#6b6b7b] italic">{info.desc}</p>
          <div>
            <span className="font-semibold text-[#2a2a3e]">Source fields: </span>{explain.sources}
          </div>
          <div>
            <span className="font-semibold text-[#2a2a3e]">Calculation: </span>{explain.calc}
          </div>
          <div>
            <span className="font-semibold text-[#2a2a3e]">Assumptions: </span>{explain.assumptions}
          </div>
          <div>
            <span className="font-semibold text-[#2a2a3e]">Limitations: </span>{explain.limitations}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
