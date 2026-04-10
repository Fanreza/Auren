import {
  getUserEmbeddedEthereumWallet,
  getEntropyDetailsFromUser,
  type EIP1193Provider,
} from '@privy-io/js-sdk-core'
import type { User } from '@privy-io/api-types'
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  getAddress,
  numberToHex,
  type WalletClient,
  type PublicClient,
} from 'viem'
import { base } from 'viem/chains'
import { BRAND } from '~/config/brand'
import { getPrivy } from '~/config/privy'

// ---- Module-level shared state (singleton across all consumers) ----
const isReady = ref(false)
const isAuthenticated = ref(false)
const isConnecting = ref(false)
const address = ref<`0x${string}` | undefined>()
const privyUser = ref<User | null>(null)
const loginMethod = ref<string | null>(null)
const isMiniApp = ref(false)
// Auto-persist loginMethod to localStorage
watch(loginMethod, (val) => {
  if (val) localStorage.setItem(`${BRAND.storagePrefix}_login_method`, val)
  else localStorage.removeItem(`${BRAND.storagePrefix}_login_method`)
})

// Builder Code (ERC-8021) — appended to all transactions for attribution
const BUILDER_CODE_SUFFIX: `0x${string}` = '0x62635f676c3577666872690b0080218021802180218021802180218021'

// Cached clients
let _walletClient: WalletClient | null = null
let _publicClient: PublicClient | null = null
let _embeddedProvider: EIP1193Provider | null = null
let _externalProvider: any = null

export function usePrivyAuth() {
  const privy = getPrivy()

  // ---- Derived state ----
  const isConnected = computed(() => isAuthenticated.value && !!address.value)
  const chainId = computed(() => base.id)
  const isBase = computed(() => true) // Single chain app

  // ---- Public client (read-only, no wallet needed) ----
  function getPublicClient(): PublicClient {
    const rpcUrl = (useRuntimeConfig().public.baseRpcUrl as string)?.trim() || null
    const cacheKey = rpcUrl || 'default'
    if (!_publicClient || (_publicClient as any)._rpcUrl !== cacheKey) {
      _publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl ?? undefined),
        batch: {
          multicall: true,
        },
      }) as any
      ;(_publicClient as any)._rpcUrl = cacheKey
    }
    return _publicClient
  }

  // Wrap Privy's embedded wallet provider to fix a gas bug:
  // Privy's handleSendTransaction → handlePopulateTransaction uses Viem's prepareTransactionRequest
  // which returns 'gas', but Privy's toWalletApiUnsignedEthTransaction reads 'gasLimit' → gas=0.
  // Fix: intercept send calls, sign via eth_signTransaction (which skips handlePopulateTransaction),
  // and broadcast via public RPC.
  let _lastNonce = -1
  let _lastNonceTime = 0

  function wrapProvider(provider: EIP1193Provider): EIP1193Provider {
    return {
      ...provider,
      request: async (args: any) => {
        if (args.method === 'wallet_sendTransaction' || args.method === 'eth_sendTransaction') {
          const params = args.params?.[0]
          const pc = getPublicClient()
          const from = params.from || address.value

          // Get nonce — track locally to avoid stale pending nonce after rapid txs
          let nonce: number
          if (params.nonce) {
            nonce = Number(typeof params.nonce === 'string' ? parseInt(params.nonce, 16) : params.nonce)
          } else {
            const pendingNonce = await pc.getTransactionCount({ address: from, blockTag: 'pending' })
            // If we recently sent a tx and pending nonce hasn't caught up, increment
            if (_lastNonce >= 0 && Date.now() - _lastNonceTime < 15000 && pendingNonce <= _lastNonce) {
              nonce = _lastNonce + 1
            } else {
              nonce = pendingNonce
            }
          }
          _lastNonce = nonce
          _lastNonceTime = Date.now()

          // Parse or estimate gas
          let gasLimit: bigint
          const rawGas = params.gas || params.gasLimit
          if (rawGas) {
            gasLimit = BigInt(rawGas)
          } else {
            const estimated = await pc.estimateGas({
              account: from,
              to: params.to,
              data: params.data,
              value: params.value ? BigInt(params.value) : 0n,
            })
            gasLimit = estimated + (estimated / 5n) // 20% buffer
          }

          // Parse or calculate fee params
          let maxFeePerGas: bigint
          let maxPriorityFeePerGas: bigint
          if (params.maxFeePerGas) {
            maxFeePerGas = BigInt(params.maxFeePerGas)
            maxPriorityFeePerGas = params.maxPriorityFeePerGas ? BigInt(params.maxPriorityFeePerGas) : 1n
          } else {
            const block = await pc.getBlock({ blockTag: 'latest' })
            const baseFee = block.baseFeePerGas ?? 0n
            maxFeePerGas = baseFee * 2n + 1n
            maxPriorityFeePerGas = 1000000n // 0.001 gwei
          }

          // Sign via eth_signTransaction — bypasses handlePopulateTransaction (gas bug)
          // Uses 'gasLimit' field which Privy's toWalletApiUnsignedEthTransaction reads correctly
          const signedTx = await provider.request({
            method: 'eth_signTransaction',
            params: [{
              from,
              to: params.to,
              data: params.data,
              value: params.value ? (typeof params.value === 'bigint' ? numberToHex(params.value) : params.value) : '0x0',
              nonce: numberToHex(nonce),
              chainId: numberToHex(8453),
              type: 2,
              gasLimit: numberToHex(gasLimit),
              maxFeePerGas: numberToHex(maxFeePerGas),
              maxPriorityFeePerGas: numberToHex(maxPriorityFeePerGas),
            }],
          })

          // Broadcast via public RPC (not Privy's RPC)
          return await pc.sendRawTransaction({ serializedTransaction: signedTx as `0x${string}` })
        }
        return provider.request(args)
      },
    } as EIP1193Provider
  }

  // ---- Wallet client (write operations) ----
  async function getWalletClient(): Promise<WalletClient> {
    if (!address.value) throw new Error('Not authenticated')

    // External providers can be cached safely
    if (_walletClient && _externalProvider) return _walletClient

    // For embedded wallets, always get fresh provider to avoid stale session errors
    _walletClient = null

    // External provider first: Farcaster mini app, MetaMask, Coinbase, etc.
    if (_externalProvider) {
      await ensureBaseChain()
      _walletClient = createWalletClient({
        account: address.value,
        chain: base,
        transport: custom(_externalProvider),
        dataSuffix: BUILDER_CODE_SUFFIX,
      })
      return _walletClient
    }

    // Privy embedded wallet — always get fresh provider to avoid stale "from" mismatch
    if (!privyUser.value) throw new Error('Not authenticated')
    const embeddedWallet = getUserEmbeddedEthereumWallet(privyUser.value)
    if (embeddedWallet) {
      const entropy = getEntropyDetailsFromUser(privyUser.value)
      if (!entropy) throw new Error('Cannot derive entropy for embedded wallet')

      const provider = await privy.embeddedWallet.getEthereumProvider({
        wallet: embeddedWallet,
        entropyId: entropy.entropyId,
        entropyIdVerifier: entropy.entropyIdVerifier,
      })
      _embeddedProvider = provider

      _walletClient = createWalletClient({
        account: address.value,
        chain: base,
        transport: custom(wrapProvider(provider)),
        // dataSuffix: BUILDER_CODE_SUFFIX, // disabled: causes Enso router reverts with embedded wallet
      })
    } else {
      throw new Error('No wallet provider available')
    }

    return _walletClient
  }

  // ---- Auto-switch to Base chain ----
  async function ensureBaseChain() {
    if (!_externalProvider) return // Embedded wallets are always on Base

    try {
      const currentChainId = await _externalProvider.request({ method: 'eth_chainId' })
      if (parseInt(currentChainId, 16) === 8453) return // Already on Base

      try {
        await _externalProvider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x2105' }], // 8453 in hex
        })
      } catch (switchError: any) {
        // Chain not added — add it first
        if (switchError?.code === 4902) {
          await _externalProvider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x2105',
              chainName: 'Base',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://mainnet.base.org'],
              blockExplorerUrls: ['https://basescan.org'],
            }],
          })
        } else {
          throw switchError
        }
      }
    } catch (e) {
      console.warn('[usePrivy] ensureBaseChain failed:', e)
    }
  }

  // ---- Farcaster mini app ----
  function markAsMiniApp() {
    isMiniApp.value = true
    // Don't set isReady yet — wait for wallet to connect
    // so the app shows loading spinner instead of sign-in screen
  }

  function markAsReady() {
    isReady.value = true
  }

  function connectWithFarcasterProvider(provider: any, addr: string) {
    _externalProvider = provider
    address.value = getAddress(addr) as `0x${string}`
    isAuthenticated.value = true
    isReady.value = true
    isMiniApp.value = true
    loginMethod.value = 'farcaster_miniapp'
  }

  // ---- Session restoration ----
  async function restoreSession() {
    try {
      const accessToken = await privy.getAccessToken()
      if (accessToken) {
        const { user } = await privy.user.get()
        setUserState(user)

        // Restore login method from localStorage
        loginMethod.value = localStorage.getItem(`${BRAND.storagePrefix}_login_method`)

        // Re-establish external provider for wallet users (SIWE login)
        if (!getUserEmbeddedEthereumWallet(user) && address.value) {
          reconnectExternalProvider()
        }
      }
    } catch {
      resetState()
    } finally {
      isReady.value = true
    }
  }

  // Re-discover the wallet provider via EIP-6963 after page refresh
  function reconnectExternalProvider() {
    const savedRdns = localStorage.getItem(`${BRAND.storagePrefix}_wallet_rdns`)

    const handler = (event: any) => {
      const detail = event.detail
      if (!detail?.info || !detail?.provider) return

      // Match by saved RDNS, or use first available
      if (savedRdns && detail.info.rdns === savedRdns) {
        setExternalProvider(detail.provider)
        window.removeEventListener('eip6963:announceProvider', handler)
      } else if (!savedRdns && !_externalProvider) {
        setExternalProvider(detail.provider)
      }
    }

    window.addEventListener('eip6963:announceProvider', handler)
    window.dispatchEvent(new Event('eip6963:requestProvider'))

    // Cleanup listener after 2s, fallback to window.ethereum
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', handler)
      if (!_externalProvider && (window as any).ethereum) {
        setExternalProvider((window as any).ethereum)
      }
    }, 2000)
  }

  function setUserState(user: User) {
    privyUser.value = user
    isAuthenticated.value = true

    // Check if user previously switched to a different address in their wallet
    const savedActive = localStorage.getItem(`${BRAND.storagePrefix}_active_address`)

    // Get address from embedded wallet first
    const embeddedWallet = getUserEmbeddedEthereumWallet(user)
    if (embeddedWallet) {
      address.value = embeddedWallet.address as `0x${string}`
      return
    }

    // For external wallets: use persisted active address if available,
    // otherwise fall back to the address from Privy's linked accounts
    if (savedActive) {
      address.value = getAddress(savedActive) as `0x${string}`
      return
    }

    const externalWallet = user.linked_accounts?.find(
      (a: any) => a.type === 'wallet' && a.chain_type === 'ethereum' && a.address,
    )
    if (externalWallet && 'address' in externalWallet) {
      address.value = getAddress(externalWallet.address) as `0x${string}`
    }
  }

  // ---- Auth: Email OTP ----
  async function sendEmailCode(email: string) {
    await privy.auth.email.sendCode(email)
  }

  async function loginWithEmail(email: string, code: string) {
    isConnecting.value = true
    try {
      const session = await privy.auth.email.loginWithCode(email, code)
      loginMethod.value = 'email'
      await handlePostLogin(session)
    } finally {
      isConnecting.value = false
    }
  }

  // ---- Auth: Phone OTP ----
  async function sendPhoneCode(phone: string) {
    await privy.auth.phone.sendCode(phone)
  }

  async function loginWithPhone(phone: string, code: string) {
    isConnecting.value = true
    try {
      const session = await privy.auth.phone.loginWithCode(phone, code)
      loginMethod.value = 'phone'
      await handlePostLogin(session)
    } finally {
      isConnecting.value = false
    }
  }

  // ---- Auth: OAuth (Google, Twitter, Discord) ----
  async function loginWithOAuth(provider: 'google' | 'twitter' | 'discord') {
    isConnecting.value = true
    try {
      const redirectURI = `${window.location.origin}/auth/callback`
      const result = await privy.auth.oauth.generateURL(provider, redirectURI)
      localStorage.setItem('privy_oauth_provider', provider)
      window.location.assign(result.url)
    } catch (e) {
      console.error('[usePrivy] loginWithOAuth error:', e)
      isConnecting.value = false
    }
  }

  async function completeOAuthLogin(code: string, state: string) {
    isConnecting.value = true
    try {
      const provider = localStorage.getItem('privy_oauth_provider') || 'google'
      localStorage.removeItem('privy_oauth_provider')
      loginMethod.value = provider
      const session = await privy.auth.oauth.loginWithCode(code, state)
      await handlePostLogin(session)
    } finally {
      isConnecting.value = false
    }
  }

  // ---- Auth: Farcaster (Sign-In With Farcaster) ----
  async function loginWithFarcaster() {
    isConnecting.value = true
    try {
      const { channel_token, connect_uri } = await privy.auth.farcaster.initializeAuth({
        relyingParty: window.location.origin,
      })

      // Open Warpcast sign-in
      window.open(connect_uri, '_blank')

      // Poll for completion
      const maxAttempts = 60 // 2 minutes
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const status = await privy.auth.farcaster.getFarcasterStatus({ channel_token })

        if ('message' in status && 'signature' in status && 'fid' in status) {
          const session = await privy.auth.farcaster.authenticate({
            channel_token,
            message: status.message as string,
            signature: status.signature as string,
            fid: status.fid as number,
          })
          loginMethod.value = 'farcaster'
          await handlePostLogin(session)
          return
        }
      }
      throw new Error('Farcaster sign-in timed out')
    } finally {
      isConnecting.value = false
    }
  }

  // ---- Auth: External wallet via SIWE (shared helper) ----
  async function siweLogin(provider: any, method: string, rdns?: string) {
    const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' })
    const walletAddress = getAddress(accounts[0]) as `0x${string}`

    const { message } = await privy.auth.siwe.init(
      { address: walletAddress, chainId: `eip155:${base.id}` },
      window.location.host,
      window.location.origin,
    )

    const signature: string = await provider.request({
      method: 'personal_sign',
      params: [message, walletAddress],
    })

    const session = await privy.auth.siwe.loginWithSiwe(signature)
    loginMethod.value = method
    setExternalProvider(provider)
    address.value = walletAddress
    privyUser.value = session.user
    isAuthenticated.value = true

    // Persist wallet info for session restore
    if (rdns) localStorage.setItem(`${BRAND.storagePrefix}_wallet_rdns`, rdns)
    else localStorage.removeItem(`${BRAND.storagePrefix}_wallet_rdns`)
  }

  // ---- External provider with account change listener ----
  function setExternalProvider(provider: any) {
    // Remove old listener
    if (_externalProvider?.removeListener) {
      _externalProvider.removeListener('accountsChanged', onAccountsChanged)
    }
    _externalProvider = provider
    // Listen for account switches in the wallet
    if (provider?.on) {
      provider.on('accountsChanged', onAccountsChanged)
    }
  }

  function onAccountsChanged(accounts: string[]) {
    if (!accounts.length) {
      logout()
      return
    }
    const newAddress = getAddress(accounts[0]) as `0x${string}`
    if (newAddress === address.value) return

    // Update address and clear cached wallet client so it's recreated with new account
    address.value = newAddress
    _walletClient = null

    // Persist active address so session restore uses the switched address
    localStorage.setItem(`${BRAND.storagePrefix}_active_address`, newAddress)
  }

  // ---- Auth: Connect any EIP-1193 provider (used by wallet picker) ----
  async function loginWithProvider(provider: any, method: string, rdns?: string) {
    isConnecting.value = true
    try {
      await siweLogin(provider, method, rdns)
    } catch (e: any) {
      console.error(`[usePrivy] ${method} login failed:`, e.message)
      throw e
    } finally {
      isConnecting.value = false
    }
  }

  // ---- Auth: WalletConnect (works on mobile + desktop) ----
  async function loginWithWalletConnect() {
    isConnecting.value = true
    try {
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider')
      const config = useRuntimeConfig()

      const wcProvider = await EthereumProvider.init({
        projectId: config.public.walletConnectProjectId as string,
        chains: [base.id],
        showQrModal: true,
      })

      await wcProvider.connect()
      await siweLogin(wcProvider, 'walletconnect')
    } catch (e: any) {
      console.error('[usePrivy] WalletConnect login failed:', e.message)
      throw e
    } finally {
      isConnecting.value = false
    }
  }

  // ---- Auth: Coinbase Smart Wallet ----
  async function loginWithCoinbaseSmartWallet() {
    isConnecting.value = true
    try {
      const { CoinbaseWalletSDK } = await import('@coinbase/wallet-sdk')
      const sdk = new CoinbaseWalletSDK({
        appName: BRAND.name,
        appChainIds: [base.id],
      })
      const provider = sdk.makeWeb3Provider({ options: 'smartWalletOnly' })
      const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' }) as string[]
      const walletAddress = getAddress(accounts[0]) as `0x${string}`

      // Generate SIWE message
      const { message } = await privy.auth.siwe.init(
        { address: walletAddress, chainId: `eip155:${base.id}` },
        window.location.host,
        window.location.origin,
      )

      const signature: string = await provider.request({
        method: 'personal_sign',
        params: [message, walletAddress],
      }) as string

      const session = await privy.auth.siwe.loginWithSiwe(signature)
      loginMethod.value = 'coinbase'
      setExternalProvider(provider)
      address.value = walletAddress
      privyUser.value = session.user
      isAuthenticated.value = true
    } catch (e: any) {
      console.error('[usePrivy] Coinbase smart wallet login failed:', e.message)
      throw e
    } finally {
      isConnecting.value = false
    }
  }

  // ---- Post-login: create/retrieve embedded wallet ----
  async function handlePostLogin(session: { user: User }) {
    privyUser.value = session.user
    isAuthenticated.value = true

    let embeddedWallet = getUserEmbeddedEthereumWallet(session.user)

    if (!embeddedWallet) {
      // Create embedded wallet for new users (email/phone/social)
      const result = await privy.embeddedWallet.create({})
      privyUser.value = result.user
      embeddedWallet = getUserEmbeddedEthereumWallet(result.user)
    }

    if (embeddedWallet) {
      address.value = embeddedWallet.address as `0x${string}`
    }
  }

  // ---- Logout ----
  async function logout() {
    try {
      await privy.auth.logout()
    } catch {
      // Ignore logout errors
    }
    resetState()
  }

  function resetState() {
    isAuthenticated.value = false
    address.value = undefined
    privyUser.value = null
    loginMethod.value = null
    _walletClient = null
    _embeddedProvider = null
    if (_externalProvider?.removeListener) {
      _externalProvider.removeListener('accountsChanged', onAccountsChanged)
    }
    _externalProvider = null
    localStorage.removeItem(`${BRAND.storagePrefix}_wallet_rdns`)
    localStorage.removeItem(`${BRAND.storagePrefix}_active_address`)
  }

  return {
    // State
    isReady: readonly(isReady),
    isConnected,
    isConnecting: readonly(isConnecting),
    isAuthenticated: readonly(isAuthenticated),
    address: readonly(address),
    user: readonly(privyUser),
    loginMethod: readonly(loginMethod),
    isMiniApp: readonly(isMiniApp),
    chainId,
    isBase,

    // Clients
    getPublicClient,
    getWalletClient,

    // Auth
    sendEmailCode,
    loginWithEmail,
    sendPhoneCode,
    loginWithPhone,
    loginWithOAuth,
    completeOAuthLogin,
    loginWithFarcaster,
    loginWithProvider,
    loginWithWalletConnect,
    loginWithCoinbaseSmartWallet,
    markAsMiniApp,
    markAsReady,
    connectWithFarcasterProvider,
    logout,

    // Session
    restoreSession,
  }
}
