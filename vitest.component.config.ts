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
      },
      conditions: ['browser']
    },
    define: {
      __MONITORING_SYSTEM_ID__: JSON.stringify(env.MONITORING_SYSTEM_ID ?? ''),
      __MONITORING_URL__: JSON.stringify(env.MONITORING_URL ?? 'http://homestation:8090')
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.component.test.ts'],
      setupFiles: ['src/lib/tests/support/component-dom-setup.ts']
    }
  }
})
