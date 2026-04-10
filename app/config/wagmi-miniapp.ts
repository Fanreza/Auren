import { createConfig, http } from '@wagmi/core'
import { base } from 'viem/chains'
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector'

export const miniAppWagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: [
    farcasterMiniApp(),
  ],
})
