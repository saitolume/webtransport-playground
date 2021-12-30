import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  root: path.resolve('client'),
  build: {
    target: 'esnext',
    outDir: path.resolve('dist'),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '~': path.resolve('client'),
    },
  },
})
