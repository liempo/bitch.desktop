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
      __MONITORING_SYSTEM_ID__: JSON.stringify(env.MONITORING_SYSTEM_ID ?? ''),
      __MONITORING_URL__: JSON.stringify(env.MONITORING_URL ?? 'http://homestation:8090')
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'three',
                test: /node_modules\/three\//,
                maxSize: 480_000
              }
            ]
          }
        }
      }
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
