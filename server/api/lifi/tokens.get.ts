const LIFI_API_BASE = 'https://li.quest'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { lifiApiKey } = useRuntimeConfig()
  const chainId = query.chainId ? String(query.chainId) : null
  const headers: Record<string, string> = lifiApiKey ? { 'x-lifi-api-key': lifiApiKey } : {}

  try {
    if (!chainId || chainId === 'all') {
      // Fetch popular tokens across ALL chains
      const raw: any = await $fetch(`${LIFI_API_BASE}/v1/tokens`, { headers })
      const tokenMap: Record<string, any[]> = raw?.tokens ?? {}
      // Flatten + deduplicate (keep highest-volume per symbol across chains)
      const flat: any[] = []
      for (const tokens of Object.values(tokenMap)) {
        flat.push(...(tokens as any[]))
      }
      return flat.slice(0, 150)
    }

    const raw: any = await $fetch(`${LIFI_API_BASE}/v1/tokens?chains=${chainId}`, { headers })
    return raw?.tokens?.[chainId] ?? []
  } catch (e: any) {
    console.error('[lifi/tokens] error:', e?.message ?? e)
    return []
  }
})
