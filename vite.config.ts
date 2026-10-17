import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

/** Seven-character sha shown on a pregrade result, so a phone test names the bundle it ran. */
function buildSha(): string {
  const fromEnv = process.env.VITE_BUILD_SHA?.trim()
  if (fromEnv) return fromEnv.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

/**
 * The Worker imports data/tcgplayer-products.csv as text (wrangler's Text rule);
 * this lets vitest load the same import. The app's own CSVs use `?raw` globs and
 * carry a query, so they never reach this hook.
 */
function csvAsText(): Plugin {
  return {
    name: 'piecebook-csv-as-text',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith('.csv')) return null
      return `export default ${JSON.stringify(readFileSync(id, 'utf8'))}`
    },
  }
}

export default defineConfig({
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha()),
  },
  plugins: [csvAsText(), react()],
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    environment: 'node',
  },
  // Root by default; GitHub Pages project sites live under /piecebook/ (see .github/workflows/pages.yml).
  base: process.env.PIECEBOOK_BASE ?? '/',
  server: {
    host: true,
    port: 5173,
    // `/api` is the Worker in every build (see src/config/api.ts). In dev it is
    // `npm run worker:dev` on :8787, with ACCESS_DEV_IDENTITY in worker/.dev.vars.
    proxy: {
      '/api': { target: process.env.PIECEBOOK_WORKER ?? 'http://127.0.0.1:8787', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  build: {
    // The seed chunk is 23 checklist CSVs (~550 kB raw, ~55 kB gzipped) by design.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Keep the 22 checklist CSVs in their own chunk so app code and seed data cache separately.
        manualChunks(id) {
          if (id.includes('-en-seed.csv')) return 'seed'
        },
      },
    },
  },
})
