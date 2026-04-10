import Privy, { LocalStorage } from '@privy-io/js-sdk-core'
import { base } from 'viem/chains'

let privyInstance: Privy | null = null

export function getPrivy(): Privy {
  if (privyInstance) return privyInstance

  const config = useRuntimeConfig()
  privyInstance = new Privy({
    appId: config.public.privyAppId,
    clientId: config.public.privyClientId,
    supportedChains: [base],
    storage: new LocalStorage(),
  })

  return privyInstance
}
