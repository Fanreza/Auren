<script setup lang="ts">
import { BRAND } from '~/config/brand'

useHead({ title: `Terms of Service · ${BRAND.name}` })

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
        <h1 class="text-4xl font-bold tracking-tight mb-3">Terms of Service</h1>
        <p class="text-sm text-muted-foreground">Last updated: {{ lastUpdated }}</p>
      </div>

      <div class="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">1. Acceptance of Terms</h2>
          <p>
            By accessing or using {{ BRAND.name }} (the "Service"), you agree to be bound by these Terms of Service.
            If you do not agree to these terms, do not use the Service. We may update these terms at any time, and
            your continued use constitutes acceptance of any changes.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">2. Nature of the Service</h2>
          <p>
            {{ BRAND.name }} is a non-custodial interface that lets you deposit crypto assets into third-party
            decentralized finance (DeFi) vaults on the Base blockchain. We do not hold your funds. Your assets
            remain at all times under your control, secured by your self-custodial wallet or smart account.
          </p>
          <p>
            {{ BRAND.name }} is <strong>not a bank</strong>, broker-dealer, financial advisor, or licensed money
            transmitter. We do not offer investment advice. The yield rates shown are sourced from third-party
            protocols and may change without notice.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">3. Eligibility</h2>
          <p>
            You must be at least 18 years old and legally permitted to use cryptocurrency services in your
            jurisdiction. It is your responsibility to comply with all applicable local laws. The Service is not
            available to residents of jurisdictions where its use would be prohibited.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">4. Wallet and Security</h2>
          <p>
            You are solely responsible for maintaining the security of your wallet, private keys, and any
            credentials used to access the Service. {{ BRAND.name }} cannot recover lost keys, reverse transactions,
            or refund funds sent in error.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">5. No Warranty</h2>
          <p>
            The Service is provided "as is" and "as available" without warranties of any kind, express or implied.
            We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components,
            nor that yields, prices, or protocol data displayed will be accurate at all times.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">6. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, {{ BRAND.name }} and its contributors shall not be liable for
            any indirect, incidental, consequential, or punitive damages, including loss of funds, profits, or
            data, arising from your use of the Service or any third-party protocol accessed through it.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">7. Third-Party Protocols</h2>
          <p>
            {{ BRAND.name }} routes deposits to external DeFi vaults (e.g. Morpho, Aave) and bridges via LI.FI.
            These protocols are independently operated and governed by their own smart contracts. We do not
            control them, have not audited them, and make no representations about their safety. You interact
            with them at your own risk.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">8. Prohibited Use</h2>
          <p>
            You agree not to use the Service for money laundering, fraud, sanctions evasion, market manipulation,
            or any other unlawful activity. We reserve the right to restrict access to any address that appears
            to be engaged in such activity.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">9. Intellectual Property</h2>
          <p>
            The {{ BRAND.name }} name, logo, and interface code are the property of their respective owners.
            Open-source components are licensed under their respective licenses.
          </p>
        </section>

        <section>
          <h2 class="text-lg font-semibold text-foreground mb-2">10. Contact</h2>
          <p>
            For questions about these terms, reach us on
            <a :href="BRAND.supportX" target="_blank" rel="noopener" class="text-primary hover:underline">X / Twitter</a>.
          </p>
        </section>
      </div>
    </main>

    <LandingFooter />
  </div>
</template>
