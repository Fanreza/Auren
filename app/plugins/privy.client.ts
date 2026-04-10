import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { getPrivy } from '~/config/privy'
import { usePrivyAuth } from '~/composables/usePrivy'

export default defineNuxtPlugin(async (nuxtApp) => {
  // Keep VueQuery for data fetching
  const queryClient = new QueryClient()
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })

  // Skip Privy entirely when running inside a Farcaster mini app —
  // the miniapp plugin already connected via sdk.wallet
  const { isMiniApp } = usePrivyAuth()
  if (isMiniApp.value) {
    return { provide: { privy: null } }
  }

  // Initialize Privy singleton — wrapped in try/catch so the app still
  // renders when loaded inside an iframe that restricts third-party resources
  let privy: ReturnType<typeof getPrivy> | null = null
  try {
    privy = getPrivy()

    // Mount hidden iframe for embedded wallet
    const iframeUrl = privy.embeddedWallet.getURL()
    const iframeOrigin = new URL(iframeUrl).origin

    const iframe = document.createElement('iframe')
    iframe.src = iframeUrl
    iframe.style.display = 'none'
    iframe.id = 'privy-iframe'
    iframe.allow = 'clipboard-read; clipboard-write'
    document.body.appendChild(iframe)

    let iframeReady = false

    // Wire up postMessage communication
    const privyRef = privy
    iframe.addEventListener('load', () => {
      if (iframe.contentWindow) {
        privyRef.setMessagePoster(iframe.contentWindow)
      }
      iframeReady = true

      // Restore session after iframe is ready
      const { restoreSession } = usePrivyAuth()
      restoreSession()
    })

    window.addEventListener('message', (e: MessageEvent) => {
      // Only handle messages from the Privy iframe after it's ready
      if (!iframeReady || e.origin !== iframeOrigin) return
      try {
        privyRef.embeddedWallet.onMessage(e.data)
      } catch {
        // Ignore malformed messages
      }
    })
  } catch (e) {
    console.warn('[privy] Failed to initialize:', e)
  }

  return {
    provide: { privy },
  }
})
