const LIFI_EARN_BASE = 'https://earn.li.fi'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { lifiApiKey } = useRuntimeConfig()

  const { wallet } = query
  if (!wallet || typeof wallet !== 'string') {
    throw createError({ statusCode: 400, message: 'wallet address required' })
  }

  const headers: Record<string, string> = lifiApiKey ? { 'x-lifi-api-key': lifiApiKey } : {}
  return await $fetch(`${LIFI_EARN_BASE}/v1/earn/portfolio/${wallet}/positions`, { headers })
})
