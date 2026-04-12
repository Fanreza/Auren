import { createSmartAccountClient } from 'permissionless'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { prepareUserOperationForErc20Paymaster } from 'permissionless/experimental/pimlico'
import { createPublicClient, http, encodeFunctionData, parseAbi, type Chain, type WalletClient } from 'viem'
import { entryPoint07Address } from 'viem/account-abstraction'
import { base, mainnet, arbitrum, optimism, polygon } from 'viem/chains'

// ── Supported chains ─────────────────────────────────────────────────────────
const CHAIN_MAP: Record<number, { chain: Chain; pimlicoSlug: string }> = {
  [base.id]:     { chain: base,     pimlicoSlug: 'base' },
  [mainnet.id]:  { chain: mainnet,  pimlicoSlug: 'ethereum' },
  [arbitrum.id]: { chain: arbitrum, pimlicoSlug: 'arbitrum' },
  [optimism.id]: { chain: optimism, pimlicoSlug: 'optimism' },
  [polygon.id]:  { chain: polygon,  pimlicoSlug: 'polygon' },
}

// ── Known gas tokens per chain (ERC-20 paymaster whitelisted) ────────────────
// User pays gas in one of these tokens instead of native ETH
const GAS_TOKENS: Record<number, Record<string, `0x${string}`>> = {
  [base.id]: {
    USDC:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    WETH:  '0x4200000000000000000000000000000000000006',
    cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  },
  [mainnet.id]: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  [arbitrum.id]: {
    USDC:   '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    'USDC.e': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    WETH:   '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    WBTC:   '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  },
  [optimism.id]: {
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    WETH: '0x4200000000000000000000000000000000000006',
    WBTC: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
  },
  [polygon.id]: {
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    WBTC: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
  },
}

export function getGasTokens(chainId: number) {
  return GAS_TOKENS[chainId] ?? {}
}

export function getSupportedChainIds() {
  return Object.keys(CHAIN_MAP).map(Number)
}

/**
 * Build an ERC-4337 smart account client for any supported chain.
 * Gas is paid in the specified ERC-20 token via Pimlico paymaster.
 *
 * @param signer      - EOA wallet client (from Privy)
 * @param chainId     - Target chain ID (8453, 1, 42161, 10, 137)
 * @param gasToken    - ERC-20 address to pay gas with (e.g. USDC on that chain)
 * @param rpcUrl      - Optional custom RPC URL
 * @param pimlicoApiKey - Pimlico API key
 */
export async function buildSmartAccountClient(
  signer: WalletClient,
  chainId: number,
  gasToken: `0x${string}`,
  rpcUrl: string,
  pimlicoApiKey: string,
) {
  const chainInfo = CHAIN_MAP[chainId]
  if (!chainInfo) throw new Error(`Chain ${chainId} not supported for smart account`)

  const publicClient = createPublicClient({
    chain: chainInfo.chain,
    transport: http(rpcUrl || undefined),
  })

  const pimlicoUrl = `https://api.pimlico.io/v2/${chainInfo.pimlicoSlug}/rpc?apikey=${pimlicoApiKey}`

  const pimlicoClient = createPimlicoClient({
    transport: http(pimlicoUrl),
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  })

  const account = await toSimpleSmartAccount({
    client: publicClient,
    owner: signer as any,
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
  })

  const PAYMASTER_V07 = '0x777777777777AeC03fd955926DbF81597e66834C' as `0x${string}`

  // Check if paymaster already has max approval
  let paymasterApproved = false
  try {
    const allowance = await publicClient.readContract({
      address: gasToken,
      abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
      functionName: 'allowance',
      args: [account.address, PAYMASTER_V07],
    })
    paymasterApproved = BigInt(allowance) > BigInt(1e12)
  } catch {}

  const smartAccountClient = createSmartAccountClient({
    account,
    chain: chainInfo.chain,
    bundlerTransport: http(pimlicoUrl),
    paymaster: pimlicoClient,
    paymasterContext: {
      token: gasToken,
    },
    userOperation: {
      estimateFeesPerGas: async () =>
        (await pimlicoClient.getUserOperationGasPrice()).fast,
      // Only use middleware if not yet approved — handles first-time approval
      ...(paymasterApproved ? {} : {
        prepareUserOperation: prepareUserOperationForErc20Paymaster(pimlicoClient, {
          balanceOverride: true,
        }),
      }),
    },
  })

  // Resolve gas token symbol for display
  const tokens = GAS_TOKENS[chainId] ?? {}
  const gasSymbol = Object.entries(tokens).find(([, addr]) => addr.toLowerCase() === gasToken.toLowerCase())?.[0] ?? 'ERC-20'

  return {
    smartAccountClient,
    smartAddress: account.address as `0x${string}`,
    gasCurrency: gasSymbol,
  }
}
