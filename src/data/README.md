# Data Layer Reference

This folder contains static reference tables used by the IDGT calculator engine. These datasets are intentionally separate from calculation logic to enforce strict separation of concerns.

## Files

- `mortalityTable.js`
  - Source: SSA 2021 Period Life Table, published 2024.
  - Provides SSA Lx values and helper functions for survival/death probabilities used in §7520 actuarial present value calculations.
  - Also includes a placeholder stub for IRS Table 2000CM, which is required for §7520 installment sale pricing.

- `estateTaxRates.js`
  - Source: IRC §2001(c) progressive estate/gift tax brackets (current law).
  - Provides `getMarginalEstateTax()` to compute effective estate tax rates based on the correct bracket schedule.
  - Constants included for TCJA sunset exemption projections.

- `afrRates.js`
  - Source: IRS Revenue Ruling (monthly AFR tables).
  - Contains default rates for January 2025 and a validator to ensure installment sale notes meet §7872 AFR requirements.

- `stateEstateTax.js`
  - Source: state statutes (2024 values). State rates and exemptions change frequently; users must verify current law.
  - Provides a simple marginal bracket estimator for state estate taxes.

## Update & Maintenance

- **Mortality data** should be updated when SSA publishes new period life tables.
- **AFR rates** must be updated monthly from the latest IRS Revenue Ruling.
- **State estate tax rates** should be reviewed at least annually and after major state legislative sessions.
