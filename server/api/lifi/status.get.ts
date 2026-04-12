const LIFI_API_BASE = 'https://li.quest/v1'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { lifiApiKey } = useRuntimeConfig()

  const { txHash, fromChain, toChain } = query
  if (!txHash) throw createError({ statusCode: 400, message: 'txHash required' })

  const params = new URLSearchParams({ txHash: String(txHash) })
  if (fromChain) params.set('fromChain', String(fromChain))
  if (toChain) params.set('toChain', String(toChain))

  return await $fetch(`${LIFI_API_BASE}/status?${params.toString()}`, {
    headers: { 'x-lifi-api-key': lifiApiKey },
  })
})
