<script setup lang="ts">
import { usePrivyAuth } from '~/composables/usePrivy'

const open = defineModel<boolean>('open', { required: true })

const {
  sendEmailCode, loginWithEmail,
  loginWithOAuth, loginWithFarcaster, loginWithProvider, loginWithWalletConnect, loginWithCoinbaseSmartWallet,
  isConnecting,
} = usePrivyAuth()

// ---- EIP-6963 wallet discovery ----
interface DetectedWallet {
  uuid: string
  name: string
  icon: string
  rdns: string
  provider: any
}

const detectedWallets = ref<DetectedWallet[]>([])

onMounted(() => {
  const handler = (event: any) => {
    const detail = event.detail
    if (!detail?.info || !detail?.provider) return
    // Avoid duplicates
    if (detectedWallets.value.some(w => w.uuid === detail.info.uuid)) return
    detectedWallets.value.push({
      uuid: detail.info.uuid,
      name: detail.info.name,
      icon: detail.info.icon,
      rdns: detail.info.rdns,
      provider: detail.provider,
    })
  }
  window.addEventListener('eip6963:announceProvider', handler)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
})

// ---- View state ----
type View = 'methods' | 'wallet-picker' | 'email-input' | 'email-otp'

const view = ref<View>('methods')
const email = ref('')
const otpCode = ref('')
const error = ref('')
const sending = ref(false)
const connectingWallet = ref<string | null>(null)

function resetState() {
  view.value = 'methods'
  email.value = ''
  otpCode.value = ''
  error.value = ''
  sending.value = false
  connectingWallet.value = null
}

watch(open, (val) => {
  if (!val) resetState()
})

// ---- Email ----
async function handleSendEmailCode() {
  if (!email.value.trim()) return
  sending.value = true
  error.value = ''
  try {
    await sendEmailCode(email.value.trim())
    view.value = 'email-otp'
  } catch (e: any) {
    error.value = e.message || 'Failed to send code'
  } finally {
    sending.value = false
  }
}

async function handleVerifyEmail() {
  if (otpCode.value.length < 6) return
  error.value = ''
  try {
    await loginWithEmail(email.value.trim(), otpCode.value)
    open.value = false
  } catch (e: any) {
    error.value = e.message || 'Invalid code'
  }
}

// ---- OAuth ----
async function handleOAuth(provider: 'google' | 'twitter' | 'discord') {
  error.value = ''
  try {
    await loginWithOAuth(provider)
    open.value = false
  } catch (e: any) {
    error.value = e.message || 'OAuth failed'
  }
}

async function handleFarcaster() {
  error.value = ''
  try {
    await loginWithFarcaster()
    open.value = false
  } catch (e: any) {
    error.value = e.message || 'Farcaster sign-in failed'
  }
}

// ---- Wallet picker handlers ----
async function handleDetectedWallet(wallet: DetectedWallet) {
  error.value = ''
  connectingWallet.value = wallet.uuid
  try {
    await loginWithProvider(wallet.provider, wallet.name.toLowerCase(), wallet.rdns)
    open.value = false
  } catch (e: any) {
    error.value = e.message || 'Wallet connection failed'
  } finally {
    connectingWallet.value = null
  }
}

async function handleWalletConnect() {
  error.value = ''
  connectingWallet.value = 'walletconnect'
  try {
    await loginWithWalletConnect()
    open.value = false
  } catch (e: any) {
    error.value = e.message || 'WalletConnect failed'
  } finally {
    connectingWallet.value = null
  }
}

async function handleCoinbaseSmartWallet() {
  error.value = ''
  connectingWallet.value = 'coinbase'
  try {
    await loginWithCoinbaseSmartWallet()
    open.value = false
  } catch (e: any) {
    error.value = e.message || 'Coinbase connection failed'
  } finally {
    connectingWallet.value = null
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-90 p-0 gap-0 overflow-hidden">
      <div class="px-6 pt-6 pb-4 text-center">
        <div class="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3">
          <Icon name="lucide:lock-keyhole" class="w-6 h-6 text-white" />
        </div>
        <DialogHeader class="space-y-1">
          <DialogTitle class="text-center">
            {{ view === 'wallet-picker' ? 'Connect Wallet' : 'Sign In' }}
          </DialogTitle>
          <DialogDescription class="text-center">
            {{ view === 'methods' ? "Choose how you'd like to sign in" :
               view === 'wallet-picker' ? 'Select a wallet to connect' :
               view === 'email-input' ? 'Enter your email address' :
               `We sent a code to ${email}` }}
          </DialogDescription>
        </DialogHeader>
      </div>

      <!-- Error -->
      <div v-if="error" class="px-6 pb-2">
        <p class="text-xs text-destructive text-center">{{ error }}</p>
      </div>

      <!-- ========== Methods view ========== -->
      <div v-if="view === 'methods'" class="px-6 pb-6 space-y-2">
        <!-- Email -->
        <button
          class="w-full flex items-center gap-3 p-3.5 rounded-xl bg-muted/50 border border-border
                 hover:bg-muted hover:border-primary/30 transition-all active:scale-[0.98] group"
          :disabled="isConnecting"
          @click="view = 'email-input'"
        >
          <div class="w-9 h-9 rounded-lg bg-background border border-border flex items-center justify-center group-hover:border-primary/30">
            <Icon name="lucide:mail" class="w-4.5 h-4.5 text-foreground" />
          </div>
          <div class="text-left flex-1">
            <p class="font-medium text-sm">Email</p>
            <p class="text-[11px] text-muted-foreground">Sign in with a verification code</p>
          </div>
          <Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>

        <!-- Social divider -->
        <div class="flex items-center gap-3 px-2 pt-1">
          <div class="flex-1 h-px bg-border" />
          <span class="text-[11px] text-muted-foreground">or continue with</span>
          <div class="flex-1 h-px bg-border" />
        </div>

        <!-- Social row -->
        <div class="flex items-center justify-center gap-3 py-1">
          <button
            v-for="provider in (['google', 'twitter', 'discord'] as const)"
            :key="provider"
            class="w-11 h-11 rounded-xl bg-muted/50 border border-border flex items-center justify-center
                   hover:bg-muted hover:border-primary/30 transition-all active:scale-95"
            :disabled="isConnecting"
            @click="handleOAuth(provider)"
          >
            <Icon
              :name="provider === 'google' ? 'logos:google-icon' :
                     provider === 'twitter' ? 'simple-icons:x' :
                     'logos:discord-icon'"
              class="w-5 h-5"
            />
          </button>
          <button
            class="w-11 h-11 rounded-xl bg-muted/50 border border-border flex items-center justify-center
                   hover:bg-muted hover:border-[#8A63D2]/30 transition-all active:scale-95"
            :disabled="isConnecting"
            @click="handleFarcaster"
          >
            <Icon name="simple-icons:farcaster" class="w-5 h-5 text-[#8A63D2]" />
          </button>
        </div>

        <!-- Wallet divider -->
        <div class="flex items-center gap-3 px-2 pt-1">
          <div class="flex-1 h-px bg-border" />
          <span class="text-[11px] text-muted-foreground">or</span>
          <div class="flex-1 h-px bg-border" />
        </div>

        <!-- I have a wallet → wallet picker -->
        <button
          class="w-full flex items-center gap-3 p-3.5 rounded-xl bg-muted/50 border border-border
                 hover:bg-muted hover:border-primary/30 transition-all active:scale-[0.98] group"
          :disabled="isConnecting"
          @click="view = 'wallet-picker'"
        >
          <div class="w-9 h-9 rounded-lg bg-background border border-border flex items-center justify-center group-hover:border-primary/30">
            <Icon name="lucide:wallet" class="w-4.5 h-4.5 text-foreground" />
          </div>
          <div class="text-left flex-1">
            <p class="font-medium text-sm">I have a wallet</p>
            <p class="text-[11px] text-muted-foreground">MetaMask, Rainbow, Trust & more</p>
          </div>
          <Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>

        <!-- Coinbase -->
        <button
          class="w-full flex items-center gap-3 p-3.5 rounded-xl bg-muted/50 border border-border
                 hover:bg-muted hover:border-blue-500/30 transition-all active:scale-[0.98] group"
          :disabled="isConnecting"
          @click="handleCoinbaseSmartWallet"
        >
          <div class="w-9 h-9 rounded-lg bg-background border border-border flex items-center justify-center group-hover:border-blue-500/30">
            <Icon name="simple-icons:coinbase" class="w-4.5 h-4.5 text-[#0052FF]" />
          </div>
          <div class="text-left flex-1">
            <p class="font-medium text-sm">Coinbase</p>
            <p class="text-[11px] text-muted-foreground">Smart wallet powered by Coinbase</p>
          </div>
          <Icon v-if="isConnecting" name="lucide:loader-2" class="w-4 h-4 animate-spin text-muted-foreground" />
          <Icon v-else name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </div>

      <!-- ========== Wallet picker view ========== -->
      <div v-else-if="view === 'wallet-picker'" class="px-6 pb-6 space-y-2">
        <!-- Detected wallets via EIP-6963 -->
        <button
          v-for="wallet in detectedWallets"
          :key="wallet.uuid"
          class="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border
                 hover:bg-muted hover:border-primary/30 transition-all active:scale-[0.98] group"
          :disabled="!!connectingWallet"
          @click="handleDetectedWallet(wallet)"
        >
          <img
            :src="wallet.icon"
            :alt="wallet.name"
            class="w-9 h-9 rounded-lg"
          >
          <p class="font-medium text-sm flex-1 text-left">{{ wallet.name }}</p>
          <Icon v-if="connectingWallet === wallet.uuid" name="lucide:loader-2" class="w-4 h-4 animate-spin text-muted-foreground" />
          <span v-else class="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">Detected</span>
        </button>

        <!-- WalletConnect -->
        <button
          class="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border
                 hover:bg-muted hover:border-[#3B99FC]/30 transition-all active:scale-[0.98] group"
          :disabled="!!connectingWallet"
          @click="handleWalletConnect"
        >
          <div class="w-9 h-9 rounded-lg bg-[#3B99FC] flex items-center justify-center">
            <Icon name="simple-icons:walletconnect" class="w-5 h-5 text-white" />
          </div>
          <div class="text-left flex-1">
            <p class="font-medium text-sm">WalletConnect</p>
            <p class="text-[11px] text-muted-foreground">Scan QR with any mobile wallet</p>
          </div>
          <Icon v-if="connectingWallet === 'walletconnect'" name="lucide:loader-2" class="w-4 h-4 animate-spin text-muted-foreground" />
          <Icon v-else name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>

        <!-- Back button -->
        <Button variant="ghost" class="w-full mt-1" @click="view = 'methods'">
          <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1.5" />
          Back
        </Button>
      </div>

      <!-- ========== Email input view ========== -->
      <div v-else-if="view === 'email-input'" class="px-6 pb-6 space-y-3">
        <Input
          v-model="email"
          type="email"
          placeholder="you@example.com"
          autofocus
          @keyup.enter="handleSendEmailCode"
        />
        <div class="flex gap-2">
          <Button variant="ghost" class="flex-1" @click="view = 'methods'">Back</Button>
          <Button
            class="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            :disabled="!email.trim() || sending"
            @click="handleSendEmailCode"
          >
            <Icon v-if="sending" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
            Send Code
          </Button>
        </div>
      </div>

      <!-- ========== Email OTP view ========== -->
      <div v-else-if="view === 'email-otp'" class="px-6 pb-6 space-y-3">
        <Input
          v-model="otpCode"
          type="text"
          inputmode="numeric"
          placeholder="Enter 6-digit code"
          maxlength="6"
          autofocus
          @keyup.enter="handleVerifyEmail"
        />
        <div class="flex gap-2">
          <Button variant="ghost" class="flex-1" @click="view = 'email-input'; otpCode = ''">Back</Button>
          <Button
            class="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            :disabled="otpCode.length < 6 || isConnecting"
            @click="handleVerifyEmail"
          >
            <Icon v-if="isConnecting" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
            Verify
          </Button>
        </div>
      </div>

    </DialogContent>
  </Dialog>
</template>
