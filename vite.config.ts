import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app under /<repo-name>/
// PREVIEW builds a single-page preview without the service worker (see scripts/build_preview.mjs)
const preview = !!process.env.PREVIEW
const base = preview ? './' : process.env.GITHUB_PAGES ? '/004.pension_mgmt/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: preview,
      // a new version waits until the user taps "지금 적용" (see UpdateBanner)
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: '개인연금 관리',
        short_name: '개인연금',
        description: '개인연금 ETF의 매월 불입 배분과 수익률·비중을 관리하는 개인용 앱',
        lang: 'ko',
        theme_color: '#4338ca',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
