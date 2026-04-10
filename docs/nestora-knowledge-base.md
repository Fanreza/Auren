# Auren - Knowledge Base

## Overview

**Auren** is a goal-based onchain savings application on Base. It helps users organize savings into pockets, track progress toward targets, and interact with yield-bearing strategies through a simpler interface.

This knowledge base is intentionally high-level during migration. Legacy protocol-specific details from the previous product have been removed so the new brand does not present outdated or conflicting infrastructure claims.

## Core concepts

### Pockets

Pockets are named savings containers with:

- a name
- an optional purpose
- an optional USD target
- an optional timeline
- a selected strategy

### Strategies

Auren currently uses a three-tier mental model for user guidance:

- Savings
- Growth
- High Growth

These labels help users choose a comfort level while the underlying protocol layer is being migrated.

### Deposit experience

- Users choose a pocket
- Users choose an amount and source asset
- The app shows a preview before confirmation
- Funds are routed into the selected strategy flow

### Withdrawal experience

- Users can withdraw from an existing pocket
- The app shows an estimate before confirmation
- Funds return to the user's wallet after completion

### Portfolio tracking

The dashboard shows:

- total portfolio value
- active pockets
- current value per pocket
- strategy labels
- progress toward savings targets

## Onboarding direction

Auren is being rebuilt around:

- embedded wallets
- smart-account-friendly flows
- easier wallet funding
- reduced gas anxiety for first-time users

## Product principles

- self-custodial by default
- no lock-up messaging unless explicitly supported
- no guaranteed return claims
- consumer-simple language over DeFi jargon
