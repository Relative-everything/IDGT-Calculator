import { FLAG_LABELS, SEVERITY_CHIP } from './auditLabels.js';

/** One chip per distinct flag code; the tooltip carries every message for that code. */
export default function FlagChips({ flags }) {
  if (!flags?.length) return null;
  const byCode = new Map();
  for (const f of flags) byCode.set(f.code, [...(byCode.get(f.code) ?? []), f]);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {[...byCode.entries()].map(([code, list]) => (
        <span key={code} title={list.map((f) => f.message).join('\n')}
          className={`whitespace-nowrap rounded border px-1.5 text-[11px] leading-5 print:whitespace-normal print:text-[8px] print:leading-3 ${SEVERITY_CHIP[list[0].severity]}`}>
          {FLAG_LABELS[code] ?? code}
        </span>
      ))}
    </span>
  );
}
