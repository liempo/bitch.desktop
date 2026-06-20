/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [svelte(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        $lib: path.resolve(__dirname, './src/lib')
      }
    },
    define: {
      __HOST_MONITOR_URL__: JSON.stringify(env.HOST_MONITOR_URL ?? 'http://127.0.0.1'),
      __HOST_MONITOR_PORT__: JSON.stringify(env.HOST_MONITOR_PORT ?? '9129')
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
