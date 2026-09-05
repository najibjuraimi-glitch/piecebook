import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: {
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
