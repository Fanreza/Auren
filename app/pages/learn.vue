<script setup lang="ts">
import { BRAND } from '~/config/brand'

useHead({ title: `Learn | ${BRAND.name}` })

const articles = [
  {
    id: 'what-is-yield',
    icon: 'lucide:sprout',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    title: 'What is yield?',
    subtitle: 'How your money grows without you doing anything',
    content: `<p>When you put money in a savings account, the bank pays you interest. Yield works the same way — but instead of a bank, your money is put to work in protocols that lend it out to borrowers.</p>
<p>The difference? Banks give you <strong>~2% per year</strong>. ${BRAND.name} is being rebuilt to make onchain yield feel more accessible, transparent, and worth exploring without the usual complexity.</p>
<p>Your money is never locked. You can withdraw anytime, and you keep earning yield every second your money is deposited.</p>`,
  },
  {
    id: 'why-usdc',
    icon: 'lucide:dollar-sign',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    title: 'What is USDC?',
    subtitle: 'A digital dollar that\'s always worth $1',
    content: `<p>USDC is a <strong>"stablecoin"</strong> — a digital currency that's always worth exactly <strong>$1 USD</strong>. It's issued by Circle, a regulated financial company, and every USDC is backed by real dollars held in reserve.</p>
<p>Think of it like having dollars in a digital wallet. The value doesn't go up or down like Bitcoin — <strong>1 USDC = $1, always</strong>.</p>
<p>When you deposit USDC into a conservative pocket, your dollars can earn yield while maintaining their stable value. It's one of the closest things crypto has to a familiar savings experience.</p>`,
  },
  {
    id: 'strategies',
    icon: 'lucide:layers',
    color: 'text-violet-400',
    bg: 'bg-violet-400/10',
    title: 'Choosing a strategy',
    subtitle: 'Low risk, medium risk, or high growth — pick what fits you',
    content: `<p>${BRAND.name} starts from three simple strategy styles:</p>
<p><strong>Savings (Low Risk)</strong> — Your money stays in USDC (dollars). Earns steady interest with almost no price risk. Best for: emergency funds, short-term goals.</p>
<p><strong>Growth (Medium Risk)</strong> — Your money goes into Bitcoin. You earn yield AND benefit from Bitcoin's price growth. But if Bitcoin drops, your savings value drops too. Best for: long-term savings, moderate risk tolerance.</p>
<p><strong>High Growth (High Risk)</strong> — Your money goes into Ethereum. Highest potential returns, but also the most volatility. Best for: experienced savers with a long time horizon.</p>
<p>Not sure? <strong>Start with Savings.</strong> You can always switch later as the migration stabilizes the new experience.</p>`,
  },
  {
    id: 'safety',
    icon: 'lucide:shield-check',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    title: 'Is my money safe?',
    subtitle: `How ${BRAND.name} protects your savings`,
    content: `<p><strong>Your money stays in your wallet.</strong> ${BRAND.name} never takes custody of your funds. When you deposit, your money goes directly into audited smart contracts (called "vaults") on the blockchain.</p>
<p><strong>No lock-ups.</strong> You can withdraw 100% of your money at any time. There are no penalties, no waiting periods, and no minimum deposit.</p>
<p><strong>Low fees.</strong> ${BRAND.name} does not add platform fees. You may still pay network fees on Base, and the product roadmap now includes sponsored first actions to make onboarding lighter.</p>
<p><strong>Built on Base.</strong> Base is a blockchain built by Coinbase, one of the most trusted names in crypto. It inherits the security of Ethereum while keeping fees extremely low.</p>
<p><strong>Risks to know about:</strong> While the vaults are audited, DeFi always carries some smart contract risk. Never deposit more than you can afford to lose.</p>`,
  },
  {
    id: 'pockets',
    icon: 'lucide:piggy-bank',
    color: 'text-pink-400',
    bg: 'bg-pink-400/10',
    title: 'What are pockets?',
    subtitle: 'Organize your savings by goal',
    content: `<p>Pockets are like <strong>digital envelopes</strong> for your money. Each pocket has a name, a goal, and a strategy.</p>
<p>For example, you could have:</p>
<ul><li><strong>"Emergency Fund"</strong> — $1,000 target, Savings strategy (safe)</li>
<li><strong>"New Laptop"</strong> — $2,000 target, Growth strategy (moderate)</li>
<li><strong>"Long-term Wealth"</strong> — no target, High Growth strategy (aggressive)</li></ul>
<p>Each pocket earns yield independently. You can deposit, withdraw, or switch strategies for each one — without affecting your other pockets.</p>
<p>Think of it like having multiple savings accounts, each with its own purpose.</p>`,
  },
  {
    id: 'how-to-deposit',
    icon: 'lucide:arrow-down-to-line',
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/10',
    title: 'How to deposit',
    subtitle: 'Your first deposit in 3 steps',
    content: `<p><strong>Step 1: Create a pocket.</strong> Tap "Create Pocket", give it a name (like "Vacation Fund"), and pick a strategy. That's it.</p>
<p><strong>Step 2: Tap "Add" on your pocket.</strong> Choose which token you want to deposit. If you have USDC and your pocket uses the Savings strategy, it goes straight in — no conversion needed.</p>
<p><strong>Step 3: Pick an amount and confirm.</strong> Use the percentage buttons (10%, 25%, 50%, MAX) or type a custom amount. Confirm in your wallet, and you're done.</p>
<p><strong>Don't have the right token?</strong> No problem. ${BRAND.name} is being migrated to keep the same simple "deposit what you have" feeling while upgrading the execution rails behind the scenes.</p>
<p>Your money starts earning yield <strong>immediately</strong> after deposit.</p>`,
  },
  {
    id: 'compound',
    icon: 'lucide:trending-up',
    color: 'text-green-400',
    bg: 'bg-green-400/10',
    title: 'How does yield grow?',
    subtitle: 'Your earnings earn earnings',
    content: `<p>When your money earns yield, that yield gets <strong>added back to your balance</strong>. Then your new, larger balance earns even more yield. This is called <strong>compounding</strong>.</p>
<p>Here's a simple example:</p>
<ul><li>You deposit <strong>$1,000</strong> at 5% APY</li>
<li>After 1 year: <strong>$1,050</strong> (you earned $50)</li>
<li>After 2 years: <strong>$1,102.50</strong> (you earned $52.50 — more than year 1!)</li>
<li>After 5 years: <strong>$1,276.28</strong></li></ul>
<p>The longer you keep your money in, the faster it grows. That's the magic of compounding — and it happens automatically once your pocket is active.</p>`,
  },
  {
    id: 'what-is-base',
    icon: 'lucide:hexagon',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    title: 'What is Base?',
    subtitle: 'The network your money runs on',
    content: `<p><strong>Base</strong> is a blockchain built by <strong>Coinbase</strong>, one of the largest and most trusted crypto companies in the world.</p>
<p>Think of it like this: if Ethereum is a highway, Base is an express lane on that highway. Same security, but <strong>much faster and cheaper</strong>.</p>
<p>Why does this matter for you?</p>
<ul><li><strong>Cheap fees:</strong> Depositing or withdrawing costs less than $0.01</li>
<li><strong>Fast transactions:</strong> Your deposits confirm in seconds, not minutes</li>
<li><strong>Secure:</strong> Base inherits Ethereum's security — the most battle-tested blockchain</li>
<li><strong>Backed by Coinbase:</strong> Built by a publicly traded, regulated company</li></ul>
<p>You don't need to think about Base while using ${BRAND.name} — it works in the background. Just know that your money is on a fast, cheap, and secure network.</p>`,
  },
]

const openArticle = ref<string | null>(null)

function toggle(id: string) {
  openArticle.value = openArticle.value === id ? null : id
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <!-- Back -->
      <NuxtLink to="/app" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <Icon name="lucide:arrow-left" class="w-4 h-4" />
        Back to app
      </NuxtLink>

      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold tracking-tight mb-2">Learn</h1>
        <p class="text-muted-foreground">
          Simple answers to common questions. No jargon, no fluff.
        </p>
      </div>

      <!-- Articles -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="article in articles"
          :key="article.id"
          class="rounded-xl border border-border/50 overflow-hidden transition-all"
          :class="openArticle === article.id ? 'bg-card' : 'hover:border-border'"
        >
          <!-- Header (clickable) -->
          <button
            class="w-full flex items-center gap-4 p-4 sm:p-5 text-left min-h-16"
            @click="toggle(article.id)"
          >
            <div
              class="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              :class="article.bg"
            >
              <Icon
                :name="article.icon"
                class="w-5 h-5"
                :class="article.color"
              />
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="font-semibold text-sm sm:text-base">{{ article.title }}</h2>
              <p class="text-xs sm:text-sm text-muted-foreground mt-0.5">{{ article.subtitle }}</p>
            </div>
            <Icon
              name="lucide:chevron-down"
              class="w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-200"
              :class="openArticle === article.id ? 'rotate-180' : ''"
            />
          </button>

          <!-- Content -->
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-150 ease-in"
            enter-from-class="opacity-0 max-h-0"
            enter-to-class="opacity-100 max-h-[600px]"
            leave-from-class="opacity-100 max-h-[600px]"
            leave-to-class="opacity-0 max-h-0"
          >
            <div v-if="openArticle === article.id" class="overflow-hidden">
              <div class="px-4 sm:px-5 pb-5 pt-0 pl-19">
                <div class="text-sm text-muted-foreground leading-relaxed space-y-3 [&_strong]:text-foreground [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_li]:leading-relaxed" v-html="article.content">
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <!-- CTA -->
      <div class="mt-10 text-center">
        <p class="text-sm text-muted-foreground mb-4">Ready to start saving?</p>
        <NuxtLink to="/app">
          <Button class="bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-6">
            Open App
            <Icon name="lucide:arrow-right" class="w-4 h-4 ml-2" />
          </Button>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
