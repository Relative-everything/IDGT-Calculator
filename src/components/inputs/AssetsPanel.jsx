import Card from '../ui/Card.jsx';
import NumberField from '../ui/NumberField.jsx';
import Button from '../ui/Button.jsx';
import { newId, MAX_IMPORT_ASSETS, MAX_TEXT_FIELD_LENGTH } from '../../hooks/scenarioIO.js';
import { parseNum } from '../../hooks/buildInputs.js';
import { makeAsset } from '../../hooks/defaults.js';

function AssetCard({ asset, index, errors, onChange, onRemove, onDuplicate, canRemove }) {
  const set = (field) => (value) => onChange({ ...asset, [field]: value });
  const err = (f) => errors?.[f];
  const hasSale = parseNum(asset.saleYear) > 0;
  return (
    <div className="rounded-lg border border-line bg-surface-2/60 p-3">
      <div className="flex items-center gap-2">
        <span className="rounded bg-accent-soft px-1.5 text-xs font-semibold text-ink">{index + 1}</span>
        <input
          aria-label="Asset name"
          value={asset.name}
          maxLength={MAX_TEXT_FIELD_LENGTH}
          onChange={(e) => set('name')(e.target.value)}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-sm font-medium text-ink hover:border-line focus:border-accent focus:outline-none"
        />
        <Button variant="ghost" onClick={onDuplicate} title="Duplicate">⧉</Button>
        <Button variant="danger" onClick={onRemove} disabled={!canRemove} title="Remove">✕</Button>
      </div>
      <label className="mt-1.5 flex items-center gap-2 text-xs text-muted" htmlFor={`source-${asset.id}`}>
        <span className="shrink-0">Source ref</span>
        <input
          id={`source-${asset.id}`}
          value={asset.source ?? ''}
          maxLength={MAX_TEXT_FIELD_LENGTH}
          onChange={(e) => set('source')(e.target.value)}
          placeholder="e.g. Excel B7, eMoney · Schwab …1234"
          title="Where this asset's figures come from. A label for the inputs audit; never used in the calculation."
          className="min-w-0 flex-1 rounded border border-line bg-transparent px-1.5 py-0.5 text-xs text-ink-2 placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <NumberField id={`fmv-${asset.id}`} label="Fair market value" value={asset.fmv} onChange={set('fmv')} prefix="$" error={err('fmv') ?? err('FMV')} />
        <NumberField id={`basis-${asset.id}`} label="Cost basis" value={asset.basis} onChange={set('basis')} prefix="$" error={err('basis') ?? err('B0')} />
        <NumberField id={`growth-${asset.id}`} label="Appreciation" value={asset.growth} onChange={set('growth')} suffix="%/yr" error={err('growth') ?? err('g')} />
        <NumberField id={`yield-${asset.id}`} label="Income yield" value={asset.yield} onChange={set('yield')} suffix="%/yr" error={err('yield') ?? err('y')}
          tip="Taxable yield on the asset's value each year, reinvested gross; the grantor pays the tax from the other estate in both scenarios." />
        <NumberField id={`discount-${asset.id}`} label="Valuation discount" value={asset.discount} onChange={set('discount')} suffix="%" error={err('discount') ?? err('delta')}
          tip="Lack-of-control / marketability discount on the gifted interest. Reduces the taxable gift (exclusion used); economic value is unchanged." />
        <NumberField id={`annualExclusions-${asset.id}`} label="Annual exclusions applied" value={asset.annualExclusions} onChange={set('annualExclusions')} prefix="$" error={err('annualExclusions')}
          tip="§2503(b) exclusions available for this gift (e.g. Crummey powers), 2026: $19,000 per donee. Subtracted from the taxable gift only." />
        <NumberField id={`saleYear-${asset.id}`} label="Sale year (0 = never)" value={asset.saleYear} onChange={set('saleYear')} suffix="yr" error={err('saleYear') ?? err('S')}
          tip="Year the holding is sold (inside the trust, or by the grantor if already swapped back). Gain on carryover basis is taxed to the grantor." />
        {hasSale && (
          <>
            <NumberField id={`postSaleGrowth-${asset.id}`} label="Post-sale appreciation" value={asset.postSaleGrowth} onChange={set('postSaleGrowth')} suffix="%/yr" error={err('postSaleGrowth') ?? err('gr')} />
            <NumberField id={`postSaleYield-${asset.id}`} label="Post-sale yield" value={asset.postSaleYield} onChange={set('postSaleYield')} suffix="%/yr" error={err('postSaleYield') ?? err('yr')} />
          </>
        )}
      </div>
    </div>
  );
}

export default function AssetsPanel({ assets, onChange, errorsById }) {
  const update = (id, next) => onChange(assets.map((a) => (a.id === id ? next : a)));
  const remove = (id) => onChange(assets.filter((a) => a.id !== id));
  const duplicate = (asset) => {
    if (assets.length >= MAX_IMPORT_ASSETS) return;
    const suffix = ' (copy)';
    // cut to the length cap without splitting a character written as two UTF-16 units (e.g. an emoji)
    const kept = String(asset.name ?? '').slice(0, MAX_TEXT_FIELD_LENGTH - suffix.length).replace(/[\uD800-\uDBFF]$/, '');
    const copy = { ...asset, id: newId(), name: `${kept}${suffix}` };
    const i = assets.findIndex((a) => a.id === asset.id);
    onChange([...assets.slice(0, i + 1), copy, ...assets.slice(i + 1)]);
  };
  const add = () => assets.length < MAX_IMPORT_ASSETS && onChange([...assets, makeAsset({ name: `Asset ${assets.length + 1}` })]);
  return (
    <Card title="Candidate assets" subtitle="Each asset is evaluated on its own against the estate above." aside={<Button variant="primary" onClick={add} disabled={assets.length >= MAX_IMPORT_ASSETS}>+ Add asset</Button>}>
      <div className="space-y-3">
        {assets.map((asset, i) => (
          <AssetCard key={asset.id} asset={asset} index={i} errors={errorsById?.[asset.id]}
            onChange={(next) => update(asset.id, next)} onRemove={() => remove(asset.id)} onDuplicate={() => duplicate(asset)}
            canRemove={assets.length > 1} />
        ))}
      </div>
    </Card>
  );
}
