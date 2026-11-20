/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const apiTarget = process.env.VITE_DEV_API_PROXY ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
  preview: { port: 4173, proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
  build: { chunkSizeWarningLimit: 700 },
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
})
