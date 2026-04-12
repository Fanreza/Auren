export const BRAND = {
  name: 'Auren',
  shortName: 'Auren',
  domain: 'auren.app',
  siteUrl: 'https://auren.app',
  supportX: 'https://x.com/aurenapp',
  tagline: 'Goal-based savings that work from any chain.',
  description:
    'Auren lets you save toward real goals with smart pockets, embedded wallets, and crosschain deposits — no crypto experience needed.',
  heroTitle: 'Save toward what matters.',
  heroAccent: 'From any chain.',
  heroBody:
    'Auren turns onchain saving into a smooth habit. Create goal pockets, deposit from any chain or token, and earn real yield — without touching a single DeFi interface.',
  storagePrefix: 'auren',
} as const

export function brandAsset(path: string) {
  return `${BRAND.siteUrl}${path.startsWith('/') ? path : `/${path}`}`
}
