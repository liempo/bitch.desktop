/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [svelte(), tailwindcss()],
    build: {
      // Schedule-X and the Temporal/CalDAV stack make minification exceed the
      // memory budget in the Hermes Linux worker; Tauri does not need a tiny web
      // bundle badly enough to turn validation into a chrome-fired centrifuge.
      minify: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('@schedule-x/') ||
              id.includes('ical.js') ||
              id.includes('temporal-polyfill') ||
              id.includes('tsdav')
            ) {
              return 'calendar-vendor'
            }
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        $lib: path.resolve(__dirname, './src/lib')
      }
    },
    define: {
      __HOST_MONITOR_URL__: JSON.stringify(env.HOST_MONITOR_URL ?? 'http://homestation:61208')
    },
    clearScreen: false,
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true
    },
    test: {
      include: ['src/**/*.{test,spec}.ts'],
      environment: 'node'
    }
  }
})
