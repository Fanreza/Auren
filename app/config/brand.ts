export const BRAND = {
  name: 'Auren',
  shortName: 'Auren',
  domain: 'auren.app',
  siteUrl: 'https://auren.app',
  supportX: 'https://x.com/aurenapp',
  tagline: 'Smart pockets for modern onchain savers.',
  description:
    'Goal-based earning on Base with smart wallets, sponsored gas for first actions, and beginner-friendly funding.',
  heroTitle: 'Save toward what matters.',
  heroAccent: 'Let the rails disappear.',
  heroBody:
    'Auren turns onchain saving into a smooth habit with goal pockets, embedded smart wallets, and a first deposit experience designed to feel simple.',
  storagePrefix: 'auren',
} as const

export function brandAsset(path: string) {
  return `${BRAND.siteUrl}${path.startsWith('/') ? path : `/${path}`}`
}
