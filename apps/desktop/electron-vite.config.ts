import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync } from 'fs'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      {
        name: 'copy-overlay',
        closeBundle() {
          try {
            mkdirSync(resolve('out/main'), { recursive: true })
            copyFileSync(
              resolve('src/main/overlay.html'),
              resolve('out/main/overlay.html')
            )
          } catch { }
        }
      }
    ]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    server: {
      port: 3002
    }
  }
})
