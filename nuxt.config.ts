import tailwindcss from '@tailwindcss/vite'
import { BRAND, brandAsset } from './app/config/brand'

export default defineNuxtConfig({
  ssr: false,

  runtimeConfig: {
    ensoApiKey: '',
    lifiApiKey: '',
    supabaseUrl: '',
    supabaseKey: '',
    public: {
      privyAppId: '',
      privyClientId: '',
      walletConnectProjectId: '',
      moonpayApiKey: '',
      baseRpcUrl: '',
      pimlicoApiKey: '',
    },
  },

  modules: ['@pinia/nuxt', 'shadcn-nuxt', '@nuxt/icon', '@nuxt/fonts', '@vite-pwa/nuxt'],

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: `${BRAND.name} - Goal-based savings, any chain`,
      short_name: BRAND.shortName,
      description: BRAND.description,
      theme_color: '#86B238',
      background_color: '#0B0E0D',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      icons: [
        { src: '/icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' },
        { src: '/icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'maskable' },
        { src: '/new.jpeg', sizes: '1024x1024', type: 'image/jpeg', purpose: 'any' },
      ],
    },
    workbox: {
      // SPA-mode fallback. Use the precached index.html (which IS in
      // globPatterns via *.html) so workbox doesn't throw `non-precached-url`
      // when it tries to resolve `/`.
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api\//, /^\/_nuxt\//, /^\/sw\.js$/],
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/earn\.li\.fi\/.*/i,
          handler: 'NetworkFirst',
          options: { cacheName: 'lifi-earn', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
        },
        {
          urlPattern: /^https:\/\/li\.quest\/.*/i,
          handler: 'NetworkFirst',
          options: { cacheName: 'lifi-composer', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
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
    define: {
      // node globals needed by wallet libs (bn.js, etc.)
      global: 'globalThis',
    },
    resolve: {
      alias: {
        buffer: 'buffer/',
      },
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
        { property: 'og:title', content: `${BRAND.name} - Goal-based savings, any chain` },
        { property: 'og:description', content: BRAND.description },
        { property: 'og:image', content: brandAsset('/new.jpeg') },
        { property: 'og:site_name', content: BRAND.name },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: `${BRAND.name} - Goal-based savings, any chain` },
        { name: 'twitter:description', content: BRAND.description },
        { name: 'twitter:image', content: brandAsset('/new.jpeg') },
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
                splashBackgroundColor: '#060F19',
              },
            },
          }),
        },
        { name: 'theme-color', content: '#86B238' },
      ],
      link: [
        { rel: 'icon', type: 'image/jpeg', href: '/new.jpeg' },
        { rel: 'apple-touch-icon', href: '/new.jpeg' },
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
