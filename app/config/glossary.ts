/**
 * DeFi glossary — short, plain-language explanations.
 * Used by AppHelpTip component (hover/tap ⓘ icon to see).
 */
export const GLOSSARY: Record<string, { title: string; body: string }> = {
  apy: {
    title: 'APY (Annual Percentage Yield)',
    body: 'The yearly return rate including compounding. A 5% APY means $100 grows to $105 after one year if the rate stays constant. Rates are variable and can change anytime.',
  },
  tvl: {
    title: 'TVL (Total Value Locked)',
    body: 'How much money is currently deposited in a vault. Higher TVL usually means the vault is more battle-tested and has deeper liquidity.',
  },
  vault: {
    title: 'Vault',
    body: 'A smart contract that pools deposits from many users and earns yield on their behalf — by lending, providing liquidity, or other DeFi strategies.',
  },
  composer: {
    title: 'LI.FI Composer',
    body: 'A routing engine that lets you deposit any token from any chain into a vault in a single transaction. It handles swaps, bridging, and the deposit automatically.',
  },
  smart_account: {
    title: 'Smart Account',
    body: 'A programmable wallet (ERC-4337) controlled by your regular wallet. It lets you pay gas fees in USDC instead of ETH and batch multiple actions into one transaction.',
  },
  paymaster: {
    title: 'Paymaster',
    body: 'A service that sponsors gas fees for your smart account, then deducts the equivalent in USDC. You never need to hold ETH.',
  },
  cost_basis: {
    title: 'Cost Basis',
    body: 'The total amount you have actually deposited (minus withdrawals). Subtract this from your current value to see how much yield you have earned.',
  },
  unrealized_pnl: {
    title: 'Unrealized PnL',
    body: 'The profit (or loss) you would have if you withdrew everything right now. It is "unrealized" because nothing happens until you actually withdraw.',
  },
  morpho: {
    title: 'Morpho',
    body: 'A peer-to-peer lending protocol on Ethereum and Base. Vaults curated by Morpho aggregate deposits across multiple lending markets to maximize yield.',
  },
  aave: {
    title: 'Aave',
    body: 'One of the largest decentralized lending protocols. Suppliers earn interest from borrowers paying to use their deposited assets.',
  },
  slippage: {
    title: 'Slippage',
    body: 'The difference between the expected price of a trade and the actual price. For swaps, slippage tolerance limits how much price drift you accept.',
  },
  cross_chain: {
    title: 'Cross-chain',
    body: 'Moving tokens between different blockchains (e.g. Ethereum → Base) using a bridge. Takes a few seconds to a few minutes depending on the bridge.',
  },
  erc4626: {
    title: 'ERC-4626',
    body: 'A standard interface for tokenized yield vaults. When you deposit, you receive "share tokens" representing your stake in the vault. Withdrawing burns the shares.',
  },
  pocket: {
    title: 'Pocket',
    body: 'A savings goal you create in Auren — a name, a target amount, and a strategy. Each pocket maps to one yield-earning vault.',
  },
  strategy: {
    title: 'Strategy',
    body: 'A risk profile that maps to a specific underlying asset. Conservative = USDC (stable), Balanced = cbBTC (Bitcoin exposure + yield), Aggressive = WETH (Ethereum exposure + yield).',
  },
}

export type GlossaryKey = keyof typeof GLOSSARY
