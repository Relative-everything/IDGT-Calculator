import { useMemo, useState } from 'react';
import Card from '../ui/Card.jsx';
import { fmtMoney, fmtRatio, fmtYear } from '../format.js';

const COLUMNS = [
  { key: 'rank', label: '#', get: (r) => r.rank, align: 'right' },
  { key: 'name', label: 'Asset', get: (r) => r.name, align: 'left' },
  { key: 'Ug', label: 'Taxable gift', get: (r) => r.result.derived.Ug, fmt: fmtMoney },
  { key: 'Uc', label: 'Exclusion used', get: (r) => r.result.derived.Uc, fmt: fmtMoney },
  { key: 'G', label: 'Gift tax', get: (r) => r.result.derived.G, fmt: fmtMoney },
  { key: 'npvNone', label: 'NPV · no swap', get: (r) => r.result.npvNone, fmt: fmtMoney },
  { key: 'sStar', label: 'Best swap', get: (r) => r.result.sStar, fmt: fmtYear },
  { key: 'npvOpt', label: 'NPV · best swap', get: (r) => r.result.npvOpt, fmt: fmtMoney },
  { key: 'effOpt', label: 'NPV per $ gift (swap)', get: (r) => r.result.eff.opt, fmt: fmtRatio },
  { key: 'effNone', label: 'NPV per $ gift (none)', get: (r) => r.result.eff.none, fmt: fmtRatio },
  { key: 'cum', label: 'Cum. taxable gift', get: (r) => r.cumulativeTaxableGift, fmt: fmtMoney },
];

export default function RankingTable({ ranked, selectedId, onSelect, rankKey, remainingExclusion, invalid }) {
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' });
  const rows = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[0];
    const copy = [...ranked];
    copy.sort((a, b) => {
      const av = col.get(a); const bv = col.get(b);
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av ?? -Infinity) - (bv ?? -Infinity);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [ranked, sort]);
  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'rank' ? 'asc' : 'desc' }));
  const rankLabel = rankKey === 'none' ? 'NPV per $ of taxable gift, no swap' : 'NPV per $ of taxable gift with the optimal swap year';

  return (
    <Card title="Ranking" subtitle={`Ranked by ${rankLabel}. Rank is fixed; click a header to re-sort the view. Click a row for detail.`}
      aside={remainingExclusion != null && <span>Remaining exclusion: <strong className="tabular text-ink">{fmtMoney(remainingExclusion)}</strong></span>}>
      {invalid.length > 0 && (
        <div className="mb-3 rounded-md border border-bad/40 bg-bad-soft px-3 py-2 text-sm text-ink">
          {invalid.map((a) => (
            <div key={a.id}><strong>{a.name}:</strong> {a.errors.map((e) => `${e.label} — ${e.message}`).join(' ')}</div>
          ))}
        </div>
      )}
      <div className="scroll-x">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line-strong text-left text-xs uppercase tracking-wide text-muted">
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" className={`cursor-pointer select-none px-2 py-2 font-medium ${c.align === 'left' ? 'text-left' : 'text-right'}`} onClick={() => toggle(c.key)}>
                  {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const selected = r.id === selectedId;
              const warn = r.result.warnings.length;
              return (
                <tr key={r.id} onClick={() => onSelect(r.id)}
                  className={`cursor-pointer border-b border-line ${selected ? 'bg-accent-soft/60' : 'hover:bg-surface-2'}`}>
                  {COLUMNS.map((c) => {
                    const v = c.get(r);
                    const text = c.fmt ? c.fmt(v) : v;
                    const neg = typeof v === 'number' && v < 0 && ['npvNone', 'npvOpt', 'effOpt', 'effNone'].includes(c.key);
                    return (
                      <td key={c.key} className={`tabular whitespace-nowrap px-2 py-1.5 ${c.align === 'left' ? 'text-left' : 'text-right'} ${neg ? 'text-bad' : ''}`}>
                        {c.key === 'name' ? (
                          <span className="flex items-center gap-1.5">
                            <span className="font-medium text-ink">{text}</span>
                            {warn > 0 && <span className="rounded bg-warn-soft px-1 text-[10px] text-warn" title={r.result.warnings.map((w) => w.message).join('\n')}>⚠ {warn}</span>}
                            {r.exceedsRemainingExclusion && <span className="rounded bg-warn-soft px-1 text-[10px] text-warn" title="Cumulative taxable gifts in rank order exceed the remaining exclusion; gift tax would apply from here.">exclusion</span>}
                          </span>
                        ) : text}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={COLUMNS.length} className="px-2 py-6 text-center text-muted">No valid assets yet — fix the inputs flagged above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
