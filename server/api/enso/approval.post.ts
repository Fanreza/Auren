import { EnsoClient } from '@ensofinance/sdk'

const BASE_CHAIN_ID = 8453

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { fromAddress, tokenAddress, amount } = body ?? {}

  if (!fromAddress || !tokenAddress || !amount)
    throw createError({ statusCode: 400, message: 'Missing required fields' })

  const { ensoApiKey } = useRuntimeConfig()
  const client = new EnsoClient({ apiKey: ensoApiKey })

  return await client.getApprovalData({
    fromAddress,
    chainId: BASE_CHAIN_ID,
    tokenAddress,
    amount,
  })
})
