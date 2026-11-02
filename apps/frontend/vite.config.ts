import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En desarrollo el portal llama a su mismo origen y Vite reenvía la API a
// Nest, igual que nginx en producción.
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/restaurants': API_TARGET,
      '/pedido': API_TARGET,
    },
  },
})
