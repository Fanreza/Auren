import { EnsoClient } from '@ensofinance/sdk'

const BASE_CHAIN_ID = 8453

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { fromAddress, amountIn, tokenIn, tokenOut, slippage } = body ?? {}

  if (!fromAddress || !amountIn || !tokenIn || !tokenOut)
    throw createError({ statusCode: 400, message: 'Missing required fields' })

  const { ensoApiKey } = useRuntimeConfig()
  const client = new EnsoClient({ apiKey: ensoApiKey })

  const routeData = await client.getRouteData({
    fromAddress,
    chainId: BASE_CHAIN_ID,
    amountIn: [amountIn],
    tokenIn: [tokenIn],
    tokenOut: [tokenOut],
    slippage: slippage ?? '300',
    routingStrategy: 'router',
  })

  return {
    amountOut: String(routeData.amountOut),
    gas: String(routeData.gas),
    tx: {
      to: routeData.tx.to,
      data: routeData.tx.data,
      from: routeData.tx.from,
      value: String(routeData.tx.value),
    },
    route: routeData.route,
    priceImpact: routeData.priceImpact ? String(routeData.priceImpact) : null,
  }
})
