# Auren Demo Recording Guide

Complete workflow, script, and prep checklist for recording a ~3:45 product demo.
Covers the full user journey: landing → registration → dashboard tour → funding → pockets → earn → strategies.

---

## Pre-Recording Checklist

### Environment
- [ ] Browser at **1440×900** (or 1080p fullscreen)
- [ ] Zoom at **110%** so text is readable in video
- [ ] Hide bookmarks bar and extension icons (clean frame)
- [ ] Disable all notifications (Slack, Discord, system)
- [ ] Test mic levels — record 10s dummy first

### App state
- [ ] **Logout before recording** — Scene 2 needs a fresh login flow
- [ ] **Clear driver.js tour state** so Scene 3 auto-triggers:
  - DevTools → Application → Local Storage → delete `auren_tour_*` keys
  - Or use incognito mode
- [ ] Supabase reset + migrations applied (see [supabase/reset.sql](../supabase/reset.sql))
- [ ] 3 public system strategies seeded (Conservative / Balanced / Aggressive)
- [ ] One pre-existing "Vacation Fund" pocket with real transaction history (for Scene 6)
  - Best to set this up on a separate demo account, then switch mid-record

### Wallet state (for funding demo)
- [ ] Smart account USDC ≥ $50 (for deposit + gas)
- [ ] If using **Transfer In**: external wallet with ≥ $30 USDC on Arbitrum or Polygon
- [ ] If using **Google login + Transfer In**: embedded EOA pre-funded via direct send (EOA is new and empty by default)
- [ ] Google account chooser already signed in (so Scene 2 doesn't hang on password entry)

### Risks to mitigate
- [ ] LI.FI crosschain transfers take 20–90s — too long for live demo. Options:
  1. Pre-fund before recording, then in Scene 4 just show the dialog tabs and close it: *"I'd transfer in here, but I'm already funded — skipping ahead."*
  2. Record Scene 4 separately with a same-chain swap (~5s) and stitch in edit
- [ ] Privy email OTP may be slow — prefer Google OAuth for Scene 2
- [ ] Composer probe can take a few seconds on first catalog load — pre-warm `/earn` and `/strategy` before recording starts

---

## Timing Summary

| # | Scene | Length | Running |
|---|---|---|---|
| 1 | Landing | 0:18 | 0:18 |
| 2 | Registration options | 0:32 | 0:50 |
| 3 | Dashboard + tour | 0:25 | 1:15 |
| 4 | Fund wallet | 0:45 | 2:00 |
| 5 | Create pocket | 0:40 | 2:40 |
| 6 | Pocket detail | 0:20 | 3:00 |
| 7 | Earn | 0:20 | 3:20 |
| 8 | Strategies | 0:35 | 3:55 |
| 9 | Close | 0:15 | **4:10** |

---

## Scene 1 — Landing Page (0:00–0:18)

**Screen**: `auren.app/`

**Clicks**
1. Start on hero, slow scroll down through the "Three tabs" section
2. Scroll back up
3. Click **"Open the app"** in the hero

**Script**
> "Alright, so this is Auren. If you've ever tried earning yield on DeFi, you know the deal — bridges, swaps, ETH for gas, ten approvals. I built this to skip all of that. It looks like a savings app but under the hood it handles all the DeFi stuff for you. Let me just click Get Started and walk you through it."

---

## Scene 2 — Registration Options (0:18–0:50)

**Screen**: `/app` → `ConnectModal` opens with login methods

**Clicks**
1. Click **"Sign in"** on the gated hero
2. Connect modal opens — **pause here** and let the viewer see all the options
3. Slowly hover over each method so they register on camera:
   - Email
   - Google
   - Discord
   - Farcaster
   - WalletConnect
   - Coinbase Smart Wallet
   - Any detected browser wallet (MetaMask / Rabby / etc.)
4. Click **"Continue with Google"** (fastest for demo)
5. Google popup → pick account → modal closes

**Script**
> "First thing — you gotta register. But there's no seed phrase, no MetaMask required, nothing like that.
>
> Look at the options here. Email, Google, Discord, Farcaster. Or if you already have a real wallet, MetaMask, Rabby, Coinbase, WalletConnect — those work too. Whatever's easiest for you.
>
> I'll just use Google, it's the fastest. Pick my account, and that's it. Privy just created an embedded wallet for me, Pimlico wrapped it in a smart account, and I'm in. Didn't sign anything, didn't install anything."

---

## Scene 3 — Dashboard + Tour (0:50–1:15)

**Screen**: `/app` → driver.js tour auto-starts on first login

**Clicks**
1. Dashboard renders — driver.js overlay kicks in automatically
2. Click **Next** through the tour steps (welcome → create pocket → tabs → funding)
3. Click **"Got it!"** on the final step to dismiss

**Script**
> "Now we're in the dashboard. And because it's my first time, a quick tour pops up automatically — just a walkthrough of what each thing does. Welcome step, where to create a pocket, where to find the tabs, how to fund the account. Handy if you've never seen the app before. I'll just click through it... there, done.
>
> So up here I've got my portfolio value, yield earned, activity feed. Down here are the three tabs — Pockets, Earn, Strategies. That's the whole app."

---

## Scene 4 — Funding the Wallet (1:15–2:00)

**Screen**: `/app` → click **"Fund wallet"** → `FundWalletDialog` opens

**Clicks**
1. Click **"Fund wallet"** button (or top-up CTA in header)
2. Dialog opens with 4 tabs: **Transfer / Buy / Swap / Withdraw**
3. Start on **Transfer** tab:
   - Show the smart account address with copy button
   - Click the token picker — show cross-chain balance detection (Ethereum, Arbitrum, Polygon, Base, etc.)
   - Pick a token (e.g. USDC on Arbitrum)
   - Type amount `20`
   - Let the LI.FI quote render — point at swap path + estimated receive
4. Switch to **Buy** tab briefly:
   - Show Coinbase / MoonPay on-ramp option
5. (Don't actually execute the buy — switch back to Transfer and execute that one)
6. Back on Transfer, click **Transfer** → watch state transitions (approving → swapping → confirming → done)
7. Confetti, success, dialog closes, wallet balance updated in header

**Script**
> "Before I can deposit anywhere, I gotta fund the smart account. And there's a few ways to do this.
>
> Option one — Transfer. If I already have crypto on another chain, I just bring it over. Auren detects my balances across Ethereum, Arbitrum, Polygon, all of them. I pick USDC on Arbitrum, enter twenty, and LI.FI gives me a live quote showing the swap path and what actually lands in my smart account on Base.
>
> Option two — Buy. If I don't have any crypto yet, I can go straight from fiat through Coinbase or MoonPay. Card, Apple Pay, whatever.
>
> There's also Swap if I want to convert between tokens I already have, and Withdraw to send stuff back out.
>
> I'll just run the transfer. Approve, swap, confirm, done. Balance updates up top."

---

## Scene 5 — Create a Pocket (2:00–2:40)

**Screen**: `/app` → click "Create pocket" → `CreatePocketDialog`

**Clicks (Step 1 — metadata)**
1. Click **"Create pocket"**
2. Name: `Japan Trip 2027`
3. Target: `$2000`
4. Timeline: `12 months`
5. Category: `Travel`
6. Click **Next**

**Clicks (Step 2 — strategy picker, 3 modes)**
7. Point at the three modes: **Quick pick** / **My strategies** / **All vaults**
8. Stay on Quick pick → click **Conservative** card
9. Click **Next**

**Clicks (Step 3 — deposit)**
10. Token defaults to USDC (just funded)
11. Amount: `20`
12. Let LI.FI preview render
13. Click **Deposit**
14. Success → dialog closes → new pocket visible in grid

**Script**
> "Okay, now the fun part. First tab — Pockets. A pocket is basically a savings goal with a vault underneath it.
>
> Name it 'Japan Trip 2027', target two grand, twelve months, Travel category.
>
> Step two — I can pick a preset, one of my saved strategies, or pick any vault from the catalog. I'll keep it simple and go with Conservative — that's USDC in a top-rated Morpho vault.
>
> Step three, deposit twenty bucks from my funded balance. Preview shows exactly what goes where. Click deposit — one transaction, gas paid in USDC from the smart account, no ETH involved. And there's my new pocket."

---

## Scene 6 — Pocket Detail (2:40–3:00)

**Screen**: Click on existing "Vacation Fund" pocket → `/pocket/[id]`

**Clicks**
1. Click **"Vacation Fund"** (an existing pocket with data)
2. Slow scroll through:
   - Live USD value hero → yield ticker
   - Performance chart (cost basis vs current value)
   - Goal projection line
   - KPIs (yield earned, days saving, pace to goal)
   - Vault health badge + risk score
   - Tax export, share card, transaction history buttons

**Script**
> "If I click into an existing pocket — this is where it gets serious. Live USD value up top with a yield ticker. Chart showing cost basis versus current value. Dashed line is the projection — if I keep depositing at this pace, I hit the goal right there. KPIs, APY trend, vault health rating. Tax export. Share card. Full on-chain transaction history. Everything you'd want in a savings app."

---

## Scene 7 — Earn Tab (3:00–3:20)

**Screen**: `/earn`

**Clicks**
1. Click **Earn** tab
2. Let catalog grid load
3. Filters:
   - Asset → `USDC`
   - Protocol → `Morpho`
   - Sort → `Highest APY`
4. Hover the top card — point at base APY / reward APY split + mini trend
5. Scroll to "Your positions" section if populated

**Script**
> "Second tab, Earn. This is every vault on Base we can route to, in one grid. Filter by asset, protocol, category, TVL. Each card shows the APY broken into base yield and reward tokens, a little trend chart, TVL, how fresh the data is. And any position you already hold shows up right at the top — pulled live from LI.FI's Portfolio API. No more hunting through five apps."

---

## Scene 8 — Strategies: Fork + Builder (3:20–3:55)

**Screen**: `/strategy`

**Clicks (fork flow)**
1. Click **Strategy** tab
2. Marketplace default view — show 3 public strategies
3. Click **Aggressive** card
4. Detail page: stats row (APY/TVL/vaults/followers) + per-vault breakdown with logos
5. Click **"Copy to my strategies"** → toast → redirects to fork

**Clicks (builder flow)**
6. Go back → click **"Create your own"**
7. Step 1: name `cbBTC + WETH`, cover color, icon → Next
8. Step 2: search `cbBTC`, pick one vault; search `WETH`, pick one vault → Next
9. Step 3: drag weight slider to 60%, show auto-rebalance, point at live APY preview → Next
10. Step 4: visibility → **Public**, hover over **Publish** (don't click — keep the demo clean)

**Script**
> "Third tab — Strategies. This one I'm actually excited about.
>
> A strategy is a multi-vault recipe. People build them and publish them. I'll copy 'Aggressive' — one click, and now I have my own private copy. If the creator edits theirs later, mine doesn't change. It's independent.
>
> Or I build one from scratch. Name it, pick vaults from the catalog — any Composer-compatible vault on Base, not just USDC and ETH. Drag a weight, the others rebalance automatically. Live APY preview at the top updates as I move. Pick public, unlisted, or private. Publish. Done, it's in the marketplace."

---

## Scene 9 — Close (3:55–4:10)

**Screen**: Back to `/app` dashboard

**Clicks**
1. Click back to **Pocket** tab
2. Brief hover across the three tabs
3. Freeze on dashboard or cut to logo

**Script**
> "Yeah so that's Auren. Sign in with email, fund in one click from any chain, make pockets for goals, browse the Earn catalog, or build your own strategy. One smart account, gas in USDC, no ETH anywhere. It's at auren.app — go break it."

---

## 90-Second Version (if time is tight)

### Hook (0:00–0:10)
> "If you've tried earning yield on DeFi, you know it's a pain. Bridges, swaps, ETH for gas. I built Auren to just not do that. Here's how."

### Login + Dashboard (0:10–0:25)
> "Sign in with Google. Privy creates an embedded wallet, Pimlico wraps it in a smart account. No seed phrase, no install. I'm in the dashboard."

### Fund + Pocket (0:25–0:55)
> "Fund the account — either transfer from another chain or buy with fiat. Then Pockets tab. New pocket, Japan Trip, Conservative preset, deposit twenty USDC. LI.FI Composer routes it to the vault in one transaction. Gas paid in USDC. No ETH."

### Earn + Strategies (0:55–1:20)
> "Earn tab is every Composer-routable vault on Base in a grid. Filter, sort, see live APY and your existing positions. Strategies tab is a marketplace — fork someone's recipe, or build your own with weight sliders and any vault in the catalog."

### Close (1:20–1:30)
> "Auren. Three tabs, one smart account, no ETH. Auren.app."

---

## Delivery Tips

- **Pace**: ~150 words/minute. Don't rush the opener — it sets the energy.
- **Emphasis words** to hit hard: *mess, strictly, single transaction, gas in USDC, independent, done*.
- **Pauses**: half a beat after "That's it" / "Done" / "Auren.app" — lets the point land.
- **Avoid filler**: "so", "basically", "kind of", "like". If you catch yourself mid-filler, pause and restart the sentence — easy to edit out.
- **Tone**: confident, matter-of-fact. Not salesy. You're showing a thing you built, not pitching a condo.
- **Script isn't a teleprompter** — read through it 2x out loud, then riff. Natural beats polished.
- **Dry runs**: do 2 full walkthroughs without recording first. Your hand needs to know where the mouse is going so you're not fumbling on camera.
- **Cut in edit**: any dead air >1.5s, typing delays, loading spinners. Target zero awkward pauses in the final video.

---

## Recording Setup

- **Tool**: OBS or Loom
- **Audio**: record mic separately if possible — easier to retake audio than rerecord screen
- **Cursor highlight**: enable in Loom/OBS so viewers can follow clicks
- **Resolution**: export 1080p, 30fps, MP4 H.264 — standard for all platforms
- **Length target**: 3–4 minutes full version, or 90s short cut

---

## Common Mistakes to Avoid

1. **Narrating internal thoughts** — "Let me see if this loads... okay... now I'll click..." Just do the action and describe what's happening on screen.
2. **Explaining the code** — viewers don't care about implementation details, they care about the user experience.
3. **Reading jargon without context** — "ERC-4337", "Composer probe", "paymaster middleware" — only use these if you explain them in one sentence or drop them entirely.
4. **Flat delivery** — if you sound bored, viewers will be bored. Energy matters more than the exact wording.
5. **Apologizing for bugs** — if something glitches, pause, cut in edit, continue. Never say "oh sorry that's a bug, let me try again" on camera.
