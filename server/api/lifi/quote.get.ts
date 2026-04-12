const LIFI_API_BASE = 'https://li.quest/v1'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { lifiApiKey } = useRuntimeConfig()

  const required = ['fromChain', 'toChain', 'fromToken', 'toToken', 'fromAmount', 'fromAddress']
  for (const key of required) {
    if (!query[key]) throw createError({ statusCode: 400, message: `Missing required parameter: ${key}` })
  }

  const params = new URLSearchParams()
  for (const key of required) params.set(key, String(query[key]))

  // Optional pass-through params
  const optional = ['toAddress', 'slippage', 'order', 'fee', 'allowBridges', 'denyBridges']
  for (const key of optional) {
    if (query[key]) params.set(key, String(query[key]))
  }

  // Always tag as Auren
  params.set('integrator', 'auren')

  return await $fetch(`${LIFI_API_BASE}/quote?${params.toString()}`, {
    headers: { 'x-lifi-api-key': lifiApiKey },
  })
})
