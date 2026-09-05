import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Root by default; GitHub Pages project sites live under /piecebook/ (see .github/workflows/pages.yml).
  base: process.env.PIECEBOOK_BASE ?? '/',
  server: { host: true, port: 5173 },
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
