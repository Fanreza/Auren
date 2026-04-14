// LI.FI Earn single-vault detail proxy.
// Endpoint: GET https://earn.li.fi/v1/earn/vaults/{chainId}/{address}
// Undocumented but live — same shape as the list endpoint, scoped to one vault.

const BASE = 'https://earn.li.fi/v1/earn/vaults'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { lifiApiKey } = useRuntimeConfig()
  const headers: Record<string, string> = lifiApiKey ? { 'x-lifi-api-key': lifiApiKey } : {}

  const chainId = query.chainId
  const address = query.address
  if (!chainId || !address) {
    throw createError({ statusCode: 400, message: 'Missing chainId or address' })
  }

  try {
    return await $fetch(`${BASE}/${chainId}/${String(address).toLowerCase()}`, { headers })
  } catch (e: any) {
    console.error('[lifi/vault]', e?.message ?? e)
    return null
  }
})
