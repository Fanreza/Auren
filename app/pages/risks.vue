<script setup lang="ts">
import { BRAND } from '~/config/brand'

useHead({ title: `Risk Disclosure · ${BRAND.name}` })

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
        <h1 class="text-4xl font-bold tracking-tight mb-3">Risk Disclosure</h1>
        <p class="text-sm text-muted-foreground">Last updated: {{ lastUpdated }}</p>
      </div>

      <div class="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 mb-8">
        <div class="flex gap-3">
          <Icon name="lucide:triangle-alert" class="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p class="text-sm font-semibold text-amber-200 mb-1">DeFi is experimental. Only save what you can afford to lose.</p>
            <p class="text-xs text-amber-200/70">
              The risks below are real and have caused total loss of funds in other protocols. Read carefully before depositing.
            </p>
          </div>
        </div>
      </div>

      <div class="space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">1. Smart Contract Risk</h2>
          <p>
            Your funds are deposited into third-party vault smart contracts (e.g. Morpho, Aave). Bugs,
            exploits, or misconfigurations in those contracts can result in partial or total loss of your
            deposit. {{ BRAND.name }} does not audit, control, or insure these contracts.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">2. Oracle and Price Risk</h2>
          <p>
            Vault strategies and display prices rely on oracles. Oracle manipulation, outages, or stale data
            can cause incorrect valuations, liquidations, or failed transactions.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">3. Volatility Risk</h2>
          <p>
            Non-stablecoin pockets (cbBTC, WETH) track the price of the underlying asset. The USD value of
            your pocket can drop significantly even while the token yield stays positive. Past performance
            does not predict future results.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">4. Stablecoin Risk</h2>
          <p>
            USDC and other stablecoins depend on the solvency and operations of their issuers. Depegging
            events, reserve insolvency, or regulatory action can cause stablecoins to lose their peg.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">5. Yield Variability</h2>
          <p>
            APY rates shown in {{ BRAND.name }} are current estimates from LI.FI and vault sources and are
            <strong>variable</strong>. They can go up, down, or to zero at any time. No yield is guaranteed.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">6. Bridge and Routing Risk</h2>
          <p>
            Cross-chain deposits use bridges routed by LI.FI. Bridge exploits are one of the largest attack
            vectors in DeFi history. Funds can be lost in transit due to bridge bugs or failures.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">7. Wallet and Key Risk</h2>
          <p>
            You are solely responsible for the security of your wallet. Loss of your recovery phrase, phishing
            attacks, or malicious approvals can drain your funds permanently. {{ BRAND.name }} cannot recover
            lost keys.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">8. Smart Account / Paymaster Risk</h2>
          <p>
            Gas fees are paid in USDC via the Pimlico paymaster. If the paymaster becomes unavailable or
            misconfigured, transactions may fail. Smart account contracts are upgradeable by their respective
            owners; review the implementation before depositing significant amounts.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">9. Regulatory Risk</h2>
          <p>
            Cryptocurrency and DeFi are subject to evolving regulation. Changes in law, enforcement actions,
            or sanctions can restrict your ability to access or withdraw funds.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">10. No Insurance</h2>
          <p>
            Deposits into {{ BRAND.name }} are <strong>not</strong> insured by any government or private
            insurer. There is no FDIC, SIPC, or equivalent protection. If funds are lost, they are gone.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">11. Your Responsibility</h2>
          <p>
            By using {{ BRAND.name }} you acknowledge that you understand these risks and accept them. Never
            deposit more than you can afford to lose. Diversify. Do your own research on any vault or protocol
            before interacting with it.
          </p>
        </section>
      </div>
    </main>

    <LandingFooter />
  </div>
</template>
