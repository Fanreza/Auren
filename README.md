# Auren

Standalone spin-out of the original `nestora/` app for a hackathon-focused migration.

This project keeps the best product primitives from the original app while giving us a clean workspace to rebuild the brand, onboarding, and execution story around:

- smart pockets and goal-based saving
- embedded wallets and account abstraction
- paymaster-backed gas sponsorship for first actions
- MoonPay funding through Privy-compatible flows

## Why this folder exists

`D:\Project\Auren` is intentionally separate from `D:\Project\nestora` so we can migrate aggressively without risking the original product, copy, or protocol assumptions.

## Current state

- Seeded from the previous production codebase
- New working brand scaffold added
- Browser storage keys moved to the new brand namespace
- Migration checklist added at `docs/migration-checklist.md`

## Next migration focus

- Replace remaining legacy branding in app screens
- Refactor protocol-specific flows that still assume YO / Enso
- Add smart-wallet-first onboarding UX
- Add gas sponsorship and paymaster policy handling
- Upgrade fund wallet flow around MoonPay + Privy
