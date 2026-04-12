export type StrategyKey = 'conservative' | 'balanced' | 'aggressive'
export type RiskLevel = 'low' | 'medium' | 'high'

export interface Strategy {
  key: StrategyKey
  name: string
  label: string
  description: string
  subtitle: string
  risk: RiskLevel
  // ── Single asset per strategy ─────────────────────────────────────────────
  assetSymbol: string           // e.g. 'USDC', 'cbBTC', 'WETH'
  assetLabel: string            // e.g. 'US Dollar', 'Bitcoin', 'Ethereum'
  assetAddress: `0x${string}`   // token address on Base
  decimals: number
  lifiAssetSymbol: string       // primary symbol for LI.FI Earn API
  lifiAssetSymbols: string[]    // fallback symbols
  // ── Display ───────────────────────────────────────────────────────────────
  icon: string
  color: string
  assetColor: string            // hex for allocation bars
  vaultLogo: string
  // ── Info ───────────────────────────────────────────────────────────────────
  bestFor: string
  notIdealFor: string
  historicalContext: string
  downturnImpact: number
  // ── Fallback vault (direct ERC-4626 if LI.FI unavailable) ─────────────────
  vaultAddress: `0x${string}`
  vaultSymbol: string
  type: 'erc20' | 'native'
  lifiDefaultChainId: number
}

// ── Token addresses on Base (8453) ───────────────────────────────────────────
const USDC_BASE  = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
const CBBTC_BASE = '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as const
const WETH_BASE  = '0x4200000000000000000000000000000000000006' as const

// ── Fallback vault addresses on Base ─────────────────────────────────────────
const BASE_USD_VAULT = '0xbeef010f9cb27031ad51e3333f9af9c6b1228183' as const
const BASE_BTC_VAULT = '0xbdb9300b7cde636d9cd4aff00f6f009ffbbc8ee6' as const
const BASE_ETH_VAULT = '0xd4a0e0b9149bcee3c920d2e00b5de09138fd8bb7' as const

export const STRATEGIES: Record<StrategyKey, Strategy> = {
  conservative: {
    key: 'conservative',
    name: 'Conservative',
    label: 'Savings',
    description: 'Steady interest on dollars',
    subtitle: 'Stable yield on USDC',
    risk: 'low',
    assetSymbol: 'USDC',
    assetLabel: 'US Dollar',
    assetAddress: USDC_BASE,
    decimals: 6,
    lifiAssetSymbol: 'USDC',
    lifiAssetSymbols: ['USDC'],
    icon: 'lucide:shield',
    color: 'sage',
    assetColor: '#2775CA',
    vaultLogo: 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png',
    bestFor: 'Short-term savings, emergency funds, risk-averse savers',
    notIdealFor: 'Those seeking high returns or long-term growth',
    historicalContext: 'Dollar-pegged stablecoins maintain value with steady yield',
    downturnImpact: -2,
    vaultAddress: BASE_USD_VAULT,
    vaultSymbol: 'USDC Vault',
    type: 'erc20',
    lifiDefaultChainId: 8453,
  },

  balanced: {
    key: 'balanced',
    name: 'Balanced',
    label: 'Growth',
    description: 'Grow with Bitcoin',
    subtitle: 'BTC price growth + vault yield',
    risk: 'medium',
    assetSymbol: 'cbBTC',
    assetLabel: 'Bitcoin',
    assetAddress: CBBTC_BASE,
    decimals: 8,
    lifiAssetSymbol: 'cbBTC',
    lifiAssetSymbols: ['cbBTC', 'tBTC', 'LBTC'],
    icon: 'lucide:scale',
    color: 'teal',
    assetColor: '#F7931A',
    vaultLogo: 'https://assets.coingecko.com/coins/images/1/standard/bitcoin.png',
    bestFor: 'Long-term believers in Bitcoin, moderate risk tolerance',
    notIdealFor: 'Short-term goals or those uncomfortable with price swings',
    historicalContext: 'Bitcoin has shown strong long-term appreciation despite short-term volatility',
    downturnImpact: -20,
    vaultAddress: BASE_BTC_VAULT,
    vaultSymbol: 'BTC Vault',
    type: 'erc20',
    lifiDefaultChainId: 8453,
  },

  aggressive: {
    key: 'aggressive',
    name: 'Aggressive',
    label: 'High Growth',
    description: 'Maximum growth potential',
    subtitle: 'ETH price growth + vault yield',
    risk: 'high',
    assetSymbol: 'WETH',
    assetLabel: 'Ethereum',
    assetAddress: WETH_BASE,
    decimals: 18,
    lifiAssetSymbol: 'WETH',
    lifiAssetSymbols: ['WETH', 'weETH', 'wstETH'],
    icon: 'lucide:zap',
    color: 'gold',
    assetColor: '#627EEA',
    vaultLogo: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png',
    bestFor: 'Experienced investors, long time horizons, high risk tolerance',
    notIdealFor: 'Emergency funds or goals within 1-2 years',
    historicalContext: 'Ethereum powers DeFi with significant growth potential and higher volatility',
    downturnImpact: -30,
    vaultAddress: BASE_ETH_VAULT,
    vaultSymbol: 'ETH Vault',
    type: 'erc20',
    lifiDefaultChainId: 8453,
  },
}

export const STRATEGY_LIST = Object.values(STRATEGIES)

// ── Legacy vaults ────────────────────────────────────────────────────────────
// Vaults that were active in older app versions — we no longer deposit here,
// but users may still have balances. The withdraw dialog and position reader
// include these so funds aren't stranded when vault selection changes.
export interface LegacyVault {
  address: `0x${string}`
  protocol: string
  name: string
}

export const LEGACY_VAULTS: Record<StrategyKey, LegacyVault[]> = {
  conservative: [
    // RE7USDC — previous top pick before filter update
    { address: '0x618495ccc4e751178c4914b1e939c0fe0fb07b9b', protocol: 'morpho-v1', name: 'RE7USDC' },
    { address: '0x12afdefb2237a5963e7bab3e2d46ad0eee70406e', protocol: 'morpho-v1', name: 'RE7USDC' },
    // BBQUSDC #2 — was in active list when VAULTS_PER_TOKEN=2, now dropped
    { address: '0xbeeff7ae5e00aae3db302e4b0d8c883810a58100', protocol: 'morpho-v1', name: 'BBQUSDC' },
  ],
  balanced: [],
  aggressive: [],
}
