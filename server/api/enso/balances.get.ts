import { EnsoClient } from '@ensofinance/sdk'

const BASE_CHAIN_ID = 8453

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
  })

  const { address } = getQuery(event) as { address: string }
  if (!address) throw createError({ statusCode: 400, message: 'Missing address' })

  const { ensoApiKey } = useRuntimeConfig()
  const client = new EnsoClient({ apiKey: ensoApiKey })

  const result = await client.getBalances({
    chainId: BASE_CHAIN_ID,
    eoaAddress: address as `0x${string}`,
    useEoa: true,
  })

  return (result as any[]).map((b: any) => ({
    amount: String(b.amount),
    decimals: b.decimals,
    token: b.token,
    price: String(b.price ?? '0'),
    name: b.name ?? '',
    symbol: b.symbol ?? '',
    logoUri: b.logoUri ?? '',
  }))
})
