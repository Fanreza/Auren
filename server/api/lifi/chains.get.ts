const LIFI_API_BASE = 'https://li.quest'

export default defineEventHandler(async (event) => {
  const { lifiApiKey } = useRuntimeConfig()

  try {
    const raw: any = await $fetch(`${LIFI_API_BASE}/v1/chains`, {
      headers: lifiApiKey ? { 'x-lifi-api-key': lifiApiKey } : {},
    })
    // Response: { chains: [...] }
    return raw?.chains ?? raw ?? []
  } catch (e: any) {
    console.error('[lifi/chains] error:', e?.message ?? e)
    return []
  }
})
