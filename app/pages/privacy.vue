<script setup lang="ts">
import { BRAND } from '~/config/brand'

useHead({ title: `Privacy Policy · ${BRAND.name}` })

const lastUpdated = 'April 12, 2026'
</script>

<template>
  <div class="min-h-dvh bg-background">
    <LandingNav />

    <main class="max-w-3xl mx-auto px-5 sm:px-6 lg:px-8 py-12 lg:py-16">
      <div class="mb-10">
        <NuxtLink to="/" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6">
          <Icon name="lucide:arrow-left" class="w-3.5 h-3.5" /> Back to home
        </NuxtLink>
        <h1 class="text-4xl font-bold tracking-tight mb-3">Privacy Policy</h1>
        <p class="text-sm text-muted-foreground">Last updated: {{ lastUpdated }}</p>
      </div>

      <div class="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">1. Overview</h2>
          <p>
            {{ BRAND.name }} ("we", "our") is a non-custodial interface. We collect the minimum data required to
            provide and improve the Service. This Privacy Policy explains what we collect, how we use it, and
            what choices you have.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">2. What We Collect</h2>
          <p class="mb-2">We store only what is necessary for the app to function:</p>
          <ul class="list-disc ml-5 space-y-1">
            <li><strong class="text-foreground">Wallet addresses</strong> (EOA + smart account) — used as your account identifier.</li>
            <li><strong class="text-foreground">Display name</strong> — optional, set by you.</li>
            <li><strong class="text-foreground">Pockets and transaction records</strong> — pocket metadata (name, strategy, target, timeline) and transaction hashes you create in the app.</li>
            <li><strong class="text-foreground">Referral code + referrer relationship</strong> — only if you use a referral link.</li>
          </ul>
          <p class="mt-2">
            We do <strong>not</strong> collect emails (unless you provide one to Privy for social login), phone
            numbers, government IDs, or KYC information.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">3. Onchain Data</h2>
          <p>
            All transactions that interact with DeFi vaults are public on the Base blockchain. {{ BRAND.name }}
            does not control what is written to the chain; blockchain data is inherently public and permanent.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">4. Third-Party Services</h2>
          <p class="mb-2">We integrate with the following services. Your interactions with them are governed by their respective privacy policies:</p>
          <ul class="list-disc ml-5 space-y-1">
            <li><strong class="text-foreground">Privy</strong> — wallet authentication + embedded wallet</li>
            <li><strong class="text-foreground">Pimlico</strong> — ERC-4337 smart account bundler + paymaster</li>
            <li><strong class="text-foreground">LI.FI</strong> — crosschain routing and vault discovery</li>
            <li><strong class="text-foreground">CoinGecko</strong> — asset price feeds</li>
            <li><strong class="text-foreground">Supabase</strong> — database for pocket + transaction records</li>
          </ul>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">5. How We Use Data</h2>
          <ul class="list-disc ml-5 space-y-1">
            <li>To display your pockets, positions, and transaction history back to you.</li>
            <li>To compute dashboard metrics like PnL and allocation.</li>
            <li>To detect and prevent abuse of the Service.</li>
            <li>To improve product quality based on anonymized usage patterns.</li>
          </ul>
          <p class="mt-2">
            We do not sell, rent, or share your personal data with advertisers.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">6. Data Retention</h2>
          <p>
            We retain your pocket and transaction records for as long as your account is active. You can request
            deletion at any time by contacting us. Note that onchain transactions cannot be deleted from the
            blockchain.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">7. Cookies and Local Storage</h2>
          <p>
            We use browser local storage to remember your session, wallet connection state, onboarding progress,
            and referral code. We do not use third-party tracking cookies for advertising.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">8. Your Rights</h2>
          <p>
            Subject to your jurisdiction, you may have rights to access, correct, or delete your data.
            Contact us on <a :href="BRAND.supportX" target="_blank" rel="noopener" class="text-primary hover:underline">X / Twitter</a>
            to exercise any such rights.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">9. Changes</h2>
          <p>
            We may update this Privacy Policy. Material changes will be reflected by updating the "Last updated"
            date above.
          </p>
        </section>
      </div>
    </main>

    <LandingFooter />
  </div>
</template>
