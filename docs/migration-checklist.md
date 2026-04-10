# Auren Migration Checklist

## Working brand

- Brand name: `Auren`
- Positioning: goal-based onchain saving with smart wallets and sponsored first actions
- Tone: premium, simple, beginner-safe

## Immediate migration priorities

- Replace top-level brand surfaces and metadata
- Move browser storage keys off the `nestora_*` namespace
- Audit all visible references to Nestora, YO, and Enso
- Introduce AA / paymaster / MoonPay funding requirements into the new product story

## Feature decisions

### Keep

- pockets / savings goals
- create, edit, and delete pocket flows
- target amount and timeline
- dashboard and pocket detail experience
- deposit / withdraw UX
- portfolio visibility
- shareable progress card
- Privy auth and embedded wallet path
- profile and wallet management

### Adapt

- strategy definitions
- quiz recommendation mapping
- APY / profit data source
- transaction previews
- recurring reminders
- funding flow
- gas copy and onboarding messaging

### De-scope for MVP unless replaced cleanly

- legacy reward claim flow
- legacy protocol-specific switching logic
- export suite if it slows down core onboarding work

## New additions

- account abstraction as a first-class onboarding path
- paymaster-based gas sponsorship
- a clear sponsorship policy for first actions
- MoonPay deposit flow through Privy-compatible wallet funding
