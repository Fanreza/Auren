// LI.FI Earn Vaults API proxy
// Docs: https://docs.li.fi/api-reference/vaults/list-vaults-with-optional-filtering
// Endpoint: GET https://earn.li.fi/v1/earn/vaults

const BASE = 'https://earn.li.fi/v1/earn/vaults'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { lifiApiKey } = useRuntimeConfig()
  const headers: Record<string, string> = lifiApiKey ? { 'x-lifi-api-key': lifiApiKey } : {}

  // Build query params — pass through to LI.FI API as documented
  const params = new URLSearchParams()
  if (query.chainId) params.set('chainId', String(query.chainId))
  if (query.asset) params.set('asset', String(query.asset))
  if (query.protocol) params.set('protocol', String(query.protocol))
  params.set('minTvlUsd', String(query.minTvlUsd ?? 100000))
  if (query.sortBy) params.set('sortBy', String(query.sortBy))
  if (query.cursor) params.set('cursor', String(query.cursor))
  params.set('limit', String(Math.min(Number(query.limit ?? 50), 100)))

  try {
    const raw: any = await $fetch(`${BASE}?${params}`, { headers })
    // Response shape: { data: Vault[], total: number, nextCursor: string|null }
    return raw
  } catch (e: any) {
    console.error('[lifi/vaults]', e?.message ?? e)
    return { data: [], total: 0, nextCursor: null }
  }
})
