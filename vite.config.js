import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  // Relative asset paths support both https://cuktech.vn/ and github.io/cuk/.
  base: './',
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
  build: { outDir: 'dist' },
})
