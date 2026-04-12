/**
 * Protocol logo URLs (DeFi protocols commonly referenced by LI.FI Earn API).
 * Keys are lowercased protocol names. Values are stable public logo URLs.
 *
 * Fallback: colored letter badge when no logo is found.
 */
export const PROTOCOL_LOGOS: Record<string, string> = {
  // Lending / money markets
  'morpho-v1':   'https://icons.llamao.fi/icons/protocols/morpho?w=48&h=48',
  'morpho':      'https://icons.llamao.fi/icons/protocols/morpho?w=48&h=48',
  'morpho-blue': 'https://icons.llamao.fi/icons/protocols/morpho?w=48&h=48',
  'aave':        'https://icons.llamao.fi/icons/protocols/aave?w=48&h=48',
  'aave-v2':     'https://icons.llamao.fi/icons/protocols/aave?w=48&h=48',
  'aave-v3':     'https://icons.llamao.fi/icons/protocols/aave?w=48&h=48',
  'compound':    'https://icons.llamao.fi/icons/protocols/compound?w=48&h=48',
  'compound-v3': 'https://icons.llamao.fi/icons/protocols/compound?w=48&h=48',
  'spark':       'https://icons.llamao.fi/icons/protocols/spark?w=48&h=48',

  // Yield aggregators
  'yearn':       'https://icons.llamao.fi/icons/protocols/yearn-finance?w=48&h=48',
  'yearn-v2':    'https://icons.llamao.fi/icons/protocols/yearn-finance?w=48&h=48',
  'yearn-v3':    'https://icons.llamao.fi/icons/protocols/yearn-finance?w=48&h=48',
  'beefy':       'https://icons.llamao.fi/icons/protocols/beefy?w=48&h=48',
  'harvest':     'https://icons.llamao.fi/icons/protocols/harvest-finance?w=48&h=48',

  // LST / staking
  'lido':        'https://icons.llamao.fi/icons/protocols/lido?w=48&h=48',
  'rocket-pool': 'https://icons.llamao.fi/icons/protocols/rocket-pool?w=48&h=48',
  'etherfi':     'https://icons.llamao.fi/icons/protocols/ether-fi?w=48&h=48',
  'renzo':       'https://icons.llamao.fi/icons/protocols/renzo?w=48&h=48',
  'kelp-dao':    'https://icons.llamao.fi/icons/protocols/kelp-dao?w=48&h=48',

  // Stablecoin / RWA
  'ondo':        'https://icons.llamao.fi/icons/protocols/ondo-finance?w=48&h=48',
  'maple':       'https://icons.llamao.fi/icons/protocols/maple?w=48&h=48',
  'syrup':       'https://icons.llamao.fi/icons/protocols/syrup?w=48&h=48',
  'sky':         'https://icons.llamao.fi/icons/protocols/sky?w=48&h=48',
  'angle':       'https://icons.llamao.fi/icons/protocols/angle?w=48&h=48',

  // DEX / LP
  'curve':       'https://icons.llamao.fi/icons/protocols/curve-dex?w=48&h=48',
  'balancer':    'https://icons.llamao.fi/icons/protocols/balancer-v3?w=48&h=48',
  'uniswap':     'https://icons.llamao.fi/icons/protocols/uniswap?w=48&h=48',
  'aerodrome':   'https://icons.llamao.fi/icons/protocols/aerodrome-v1?w=48&h=48',

  // Niche
  'yo-protocol': 'https://icons.llamao.fi/icons/protocols/yo?w=48&h=48',
  'pendle':      'https://icons.llamao.fi/icons/protocols/pendle?w=48&h=48',
  'euler':       'https://icons.llamao.fi/icons/protocols/euler-v2?w=48&h=48',
  'fluid':       'https://icons.llamao.fi/icons/protocols/fluid-lending?w=48&h=48',
}

/** Lookup logo URL for a protocol name. Case-insensitive. Returns null if not found. */
export function protocolLogo(name: string | null | undefined): string | null {
  if (!name) return null
  return PROTOCOL_LOGOS[name.toLowerCase()] ?? null
}
