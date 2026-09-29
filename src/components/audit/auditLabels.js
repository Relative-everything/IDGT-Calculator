// Display strings for the inputs audit page. Formatting only (repo rule): no calculation here.

/** Short chip text per flag code; the full message is in the chip's tooltip and in the flags list. */
export const FLAG_LABELS = {
  INVALID: 'invalid',
  PCT_AS_FRACTION: '% typed as decimal?',
  DECIMAL_COMMA: 'decimal comma',
  IRREGULAR_GROUPING: 'comma grouping',
  DOT_GROUPING: 'point grouping',
  SMALL_AMOUNT: 'in thousands?',
  SMALL_SCHEDULE: 'schedule in thousands?',
  NOT_A_NUMBER: 'not a number',
  DUPLICATE_NAME: 'same name',
  DUPLICATE_ROW: 'same figures',
  BASIS_ABOVE_FMV: 'basis > FMV',
  SALE_BEYOND_HORIZON: 'sale after horizon',
  ZERO_TAXABLE_GIFT: 'taxable gift 0',
  PRIOR_GIFT_TAX: 'gift tax paid',
  SPOUSE_PRIOR_GIFT_TAX: 'spouse gift tax paid',
};

export const SEVERITY_TEXT = { error: 'Blocks the calculation', check: 'Probably a keying error', confirm: 'Confirm against the source' };

/** Chip classes per severity (theme tokens). */
export const SEVERITY_CHIP = {
  error: 'border-bad/40 bg-bad-soft text-bad',
  check: 'border-warn/40 bg-warn-soft text-warn',
  confirm: 'border-line-strong bg-surface-2 text-ink-2',
};

/** Cell highlight per worst severity. */
export const SEVERITY_CELL = {
  error: 'bg-bad-soft text-bad',
  check: 'bg-warn-soft',
  confirm: 'underline decoration-dotted decoration-muted underline-offset-2',
};

export function statusText(status) {
  switch (status.code) {
    case 'used': return 'in use';
    case 'scope': return `in use · ${status.why}`;
    case 'label': return `display only · ${status.why}`;
    default: return `not used · ${status.why}`;
  }
}

export const worstSeverity = (flags) => (flags.some((f) => f.severity === 'error') ? 'error' : flags.some((f) => f.severity === 'check') ? 'check' : flags.length ? 'confirm' : null);
