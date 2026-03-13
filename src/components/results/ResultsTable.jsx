import { useMemo, useState } from 'react';

export default function ResultsTable({ results, calculatedAt }) {
  const [sortKey, setSortKey] = useState('npv');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    if (!results) return [];
    const copy = [...results];
    copy.sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
    return copy;
  }, [results, sortKey, sortAsc]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Results</h2>
      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="bg-slate-100 text-left text-sm font-semibold">
              <th className="border px-3 py-2">Rank</th>
              <th className="border px-3 py-2">Asset Name</th>
              <th className="border px-3 py-2">Transfer Mechanism</th>
              <th className="border px-3 py-2">Gift/Sale Value</th>
              <th
                className="border px-3 py-2 cursor-pointer"
                onClick={() => toggleSort('npv')}
              >
                NPV (No Swap)
              </th>
              <th className="border px-3 py-2">Efficiency Ratio</th>
              <th className="border px-3 py-2">Optimal Swap Year</th>
              <th className="border px-3 py-2">NPV (Optimal Swap)</th>
              <th className="border px-3 py-2">PV Tax Burn</th>
              <th className="border px-3 py-2">PV Estate Tax</th>
              <th className="border px-3 py-2">PV Step-Up</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const n = row.npv ?? 0;
              const rowClass = n > 0 ? 'bg-emerald-50' : n < 0 ? 'bg-red-50' : 'bg-white';
              return (
                <tr key={row.assetName} className={rowClass}>
                  <td className="border px-3 py-2">{idx + 1}</td>
                  <td className="border px-3 py-2">{row.assetName}</td>
                  <td className="border px-3 py-2">{row.transferMechanism}</td>
                  <td className="border px-3 py-2">${(row.assetValue ?? 0).toLocaleString()}</td>
                  <td className="border px-3 py-2">${(row.npv ?? 0).toLocaleString()}</td>
                  <td className="border px-3 py-2">{row.efficiencyRatio ?? '-'}</td>
                  <td className="border px-3 py-2">{row.optimalSwapYear ?? '-'}</td>
                  <td className="border px-3 py-2">${(row.optimalSwapNpv ?? 0).toLocaleString()}</td>
                  <td className="border px-3 py-2">${(row.pvTaxBurn ?? 0).toLocaleString()}</td>
                  <td className="border px-3 py-2">${(row.pvEstateTax ?? 0).toLocaleString()}</td>
                  <td className="border px-3 py-2">${(row.pvStepUp ?? 0).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-slate-600">Last calculated: {calculatedAt}</div>
    </section>
  );
}
