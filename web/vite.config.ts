import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const webRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(webRoot, '..')

export default defineConfig(({ mode }) => {
  const port = Number(process.env.VITE_PORT ?? 5173)
  const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:4000'
  const input: Record<string, string> = { main: path.resolve(webRoot, 'index.html') }
  if (mode === 'development') input.kitchen = path.resolve(webRoot, 'kitchen.html')

  return {
    root: webRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@shared': path.resolve(repoRoot, 'shared/src'),
        '@': path.resolve(webRoot, 'src'),
      },
    },
    server: {
      port,
      strictPort: false,
      host: '127.0.0.1',
      fs: { allow: [repoRoot] },
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
        '/uploads': { target: apiTarget, changeOrigin: false },
        '/ws': { target: apiTarget.replace(/^http/, 'ws'), ws: true, changeOrigin: false },
      },
    },
    build: {
      outDir: path.resolve(webRoot, 'dist'),
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: { input },
    },
  }
})
