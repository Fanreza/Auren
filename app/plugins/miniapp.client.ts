import { sdk } from '@farcaster/miniapp-sdk'
import { connect, getAccount } from '@wagmi/core'
import { miniAppWagmiConfig } from '~/config/wagmi-miniapp'
import { usePrivyAuth } from '~/composables/usePrivy'

export default defineNuxtPlugin(() => {
  // Not in a mini app context → skip
  // In web: mini app runs in an iframe (window.parent !== window)
  // In mobile: mini app runs in a React Native WebView (window.ReactNativeWebView exists)
  if (typeof window === 'undefined') return
  if (!(window as any).ReactNativeWebView && window === window.parent) return

  // Set mini app flag synchronously so privy plugin skips.
  // isReady stays false → app shows loading spinner until wallet connects.
  const auth = usePrivyAuth()
  auth.markAsMiniApp()

  // Signal ready to host immediately so splash screen dismisses
  sdk.actions.ready().catch(() => {})

  // Auto-connect wallet in background — MUST be non-blocking
  const connector = miniAppWagmiConfig.connectors[0]
  if (!connector) return

  connect(miniAppWagmiConfig, { connector })
    .then(async () => {
      const account = getAccount(miniAppWagmiConfig)
      if (account.address) {
        const provider = await connector.getProvider()
        auth.connectWithFarcasterProvider(provider, account.address)
      }
    })
    .catch((e) => {
      console.warn('[miniapp] auto-connect failed:', e)
      // Still mark ready so app doesn't stay on loading forever
      auth.markAsReady()
    })
})
