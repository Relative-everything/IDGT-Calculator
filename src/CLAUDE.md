# IDGT Calculator — Claude Code Instructions

## Project Purpose
This is a professional-grade IDGT (Intentionally Defective Grantor Trust) asset optimization
calculator built in React/Vite, targeting UHNW estate planning advisors. Portfolio piece
benchmarked against Holistiplan and Tax Status. Future enterprise migration planned.

## Architecture Rules — NEVER VIOLATE

### Folder Responsibilities (Strict Separation)
- /src/engine/     → Pure calculation functions ONLY. No React imports. No UI logic.
                     Every function: inputs in, numbers out.
- /src/data/       → Static reference tables ONLY (SSA mortality, §2001 rates, AFR).
                     No calculations. No UI.
- /src/components/ → React UI ONLY. Components call engine functions.
                     Components contain ZERO calculation logic.
- /src/hooks/      → State management ONLY. Wire components to engine.

### Absolute Prohibitions
- NEVER put calculation logic inside a component file
- NEVER put UI rendering inside an engine file
- NEVER use a single mega-component — decompose into focused pieces
- NEVER use localStorage (not supported in this environment)
- NEVER truncate or stub code — every function must be fully implemented

### Code Standards
- Every engine function must have an inline comment citing its IRC section,
  actuarial source, or mathematical derivation
- All calculation assumptions must be explicit constants with named variables,
  never magic numbers
- Input validation must reject values that would produce IRC non-compliant results
  (e.g., installment note rate below AFR must flag, not silently compute)

## Domain Knowledge
- This calculator evaluates assets for transfer to an IDGT via gift, installment sale,
  GRAT, SLAT, or hybrid mechanisms
- Primary output: ranked asset table by transfer efficiency
- Secondary outputs: optimal swap timing, mechanism comparison, sensitivity analysis
- Key technical dependencies: IRC §§671–679 (grantor trust), §2036/2038 (estate inclusion),
  §7520 (AFR hurdle), §2001 (progressive estate tax), SSA 2021 mortality tables
- TCJA sunset (projected 2026) is the highest-impact legislative scenario — must be
  a one-click toggle that re-runs all calculations

## Conflict Handling
If you encounter an irreconcilable trade-off between calculation accuracy and
implementation complexity, surface it explicitly with your recommended resolution.
Do not resolve silently.

## Current commit
7168bd8

## NEXT SESSIONS ROADMAP
- Golden reference test suite (only after core calc confirmed working end-to-end in live site)

