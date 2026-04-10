import tailwindcss from '@tailwindcss/vite'
import { BRAND, brandAsset } from './app/config/brand'

export default defineNuxtConfig({
  ssr: false,

  runtimeConfig: {
    ensoApiKey: '',
    supabaseUrl: '',
    supabaseKey: '',
    public: {
      privyAppId: '',
      privyClientId: '',
      walletConnectProjectId: '',
      moonpayApiKey: '',
      baseRpcUrl: '',
    },
  },

  modules: ['@pinia/nuxt', 'shadcn-nuxt', '@nuxt/icon', '@nuxt/fonts', '@vite-pwa/nuxt'],

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: `${BRAND.name} - Smart pockets on Base`,
      short_name: BRAND.shortName,
      description: BRAND.description,
      theme_color: '#55967B',
      background_color: '#0B0E0D',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      icons: [
        { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/api\.yo\.xyz\/.*/i,
          handler: 'NetworkFirst',
          options: { cacheName: 'yo-api', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
        },
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: 'CacheFirst',
          options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
        },
      ],
    },
    client: {
      installPrompt: true,
    },
    devOptions: {
      enabled: false,
    },
  },

  shadcn: {
    prefix: '',
    componentDir: './app/components/ui',
  },

  fonts: {
    families: [
      { name: 'Plus Jakarta Sans', provider: 'google', weights: [400, 500, 600, 700, 800] },
    ],
  },

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['@coinbase/wallet-sdk', '@privy-io/js-sdk-core', '@farcaster/miniapp-sdk', 'comlink'],
    },
  },

  app: {
    head: {
      htmlAttrs: { class: 'dark' },
      title: BRAND.name,
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
        { name: 'description', content: BRAND.description },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: BRAND.siteUrl },
        { property: 'og:title', content: `${BRAND.name} - Smart pockets on Base` },
        { property: 'og:description', content: BRAND.description },
        { property: 'og:image', content: brandAsset('/logo.png') },
        { property: 'og:site_name', content: BRAND.name },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: `${BRAND.name} - Smart pockets on Base` },
        { name: 'twitter:description', content: BRAND.description },
        { name: 'twitter:image', content: brandAsset('/logo.png') },
        { name: 'base:app_id', content: '69a8116ef1a340127fafeb96' },
        {
          name: 'fc:miniapp',
          content: JSON.stringify({
            version: '1',
            imageUrl: brandAsset('/hero.png'),
            button: {
              title: `Open ${BRAND.name}`,
              action: {
                type: 'launch_frame',
                name: BRAND.name,
                url: BRAND.siteUrl,
                splashImageUrl: brandAsset('/splash.png'),
                splashBackgroundColor: '#0B1314',
              },
            },
          }),
        },
        { name: 'theme-color', content: '#55967B' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/logo.png' },
        { rel: 'apple-touch-icon', href: '/logo.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'canonical', href: BRAND.siteUrl },
      ],
      script: [
        {
          innerHTML: "import('https://esm.sh/@farcaster/miniapp-sdk').then(function(m){return m.sdk.actions.ready()}).catch(function(){})",
          type: 'module',
          tagPosition: 'head',
        },
      ],
    },
  },

  nitro: {
    externals: {
      inline: ['jspdf', 'jspdf-autotable'],
    },
    routeRules: {
      '/**': {
        headers: {
          'Content-Security-Policy': "frame-ancestors *",
        },
      },
    },
  },

  compatibilityDate: '2025-01-01',
})
