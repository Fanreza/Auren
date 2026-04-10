export type StrategyType = 'erc20' | 'native'
export type StrategyKey = 'conservative' | 'balanced' | 'aggressive'

export type RiskLevel = 'low' | 'medium' | 'high'

export interface Strategy {
  key: StrategyKey
  name: string
  label: string         // consumer-friendly name
  description: string
  subtitle: string      // consumer-friendly description
  risk: RiskLevel
  vaultAddress: `0x${string}`
  assetAddress: `0x${string}`
  assetSymbol: string
  assetLabel: string    // consumer-friendly asset name
  vaultSymbol: string
  vaultLogo: string     // Yo vault logo URL
  type: StrategyType
  decimals: number
  icon: string       // iconify icon name
  color: string      // tailwind color token
  bestFor: string
  notIdealFor: string
  historicalContext: string
  downturnImpact: number  // estimated % drop in -20% market crash
}

// ---------- Token addresses on Base (8453) ----------
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
const CBBTC_BASE = '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as const
const WETH_BASE = '0x4200000000000000000000000000000000000006' as const

// ---------- Yo Protocol vault addresses (same across chains) ----------
const YO_USD_VAULT = '0x0000000f2eb9f69274678c76222b35eec7588a65' as const
const YO_BTC_VAULT = '0xbcbc8cb4d1e8ed048a6276a5e94a3e952660bcbc' as const
const YO_ETH_VAULT = '0x3a43aec53490cb9fa922847385d82fe25d0e9de7' as const

// ---------- Strategy definitions ----------
export const STRATEGIES: Record<StrategyKey, Strategy> = {
  conservative: {
    key: 'conservative',
    name: 'Conservative',
    label: 'Savings',
    description: 'Steady interest on dollars',
    subtitle: 'Your dollars earn interest daily',
    risk: 'low',
    vaultAddress: YO_USD_VAULT,
    assetAddress: USDC_BASE,
    assetSymbol: 'USDC',
    assetLabel: 'US Dollar',
    vaultSymbol: 'yoUSD',
    vaultLogo: 'https://assets.coingecko.com/coins/images/55386/standard/yoUSD.png',
    type: 'erc20',
    decimals: 6,
    icon: 'lucide:shield',
    color: 'emerald',
    bestFor: 'Short-term savings, emergency funds, risk-averse savers',
    notIdealFor: 'Those seeking high returns or long-term growth',
    historicalContext: 'Dollar-pegged stablecoins maintain value with steady yield',
    downturnImpact: -2,
  },
  balanced: {
    key: 'balanced',
    name: 'Balanced',
    label: 'Growth',
    description: 'Grow with Bitcoin',
    subtitle: 'Bitcoin-backed growth for your savings',
    risk: 'medium',
    vaultAddress: YO_BTC_VAULT,
    assetAddress: CBBTC_BASE,
    assetSymbol: 'cbBTC',
    assetLabel: 'Bitcoin',
    vaultSymbol: 'yoBTC',
    vaultLogo: 'https://assets.coingecko.com/coins/images/55189/standard/yoBTC.png',
    type: 'erc20',
    decimals: 8,
    icon: 'lucide:scale',
    color: 'blue',
    bestFor: 'Long-term believers in Bitcoin, moderate risk tolerance',
    notIdealFor: 'Short-term goals or those uncomfortable with price swings',
    historicalContext: 'Bitcoin has shown strong long-term appreciation despite short-term volatility',
    downturnImpact: -20,
  },
  aggressive: {
    key: 'aggressive',
    name: 'Aggressive',
    label: 'High Growth',
    description: 'Maximum growth potential',
    subtitle: 'Go for the highest returns with Ethereum',
    risk: 'high',
    vaultAddress: YO_ETH_VAULT,
    assetAddress: WETH_BASE,
    assetSymbol: 'WETH',
    assetLabel: 'Ethereum',
    vaultSymbol: 'yoETH',
    vaultLogo: 'https://assets.coingecko.com/coins/images/54932/standard/yoETH.png',
    type: 'erc20',
    decimals: 18,
    icon: 'lucide:zap',
    color: 'violet',
    bestFor: 'Experienced investors, long time horizons, high risk tolerance',
    notIdealFor: 'Emergency funds or goals within 1-2 years',
    historicalContext: 'Ethereum powers DeFi with significant growth potential and higher volatility',
    downturnImpact: -30,
  },
}

export const STRATEGY_LIST = Object.values(STRATEGIES)
