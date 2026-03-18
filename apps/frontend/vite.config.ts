import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Vite 配置：仅负责渲染进程（React SPA）的构建
// Electron 主进程由独立的 tsconfig.electron.json 编译
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @ 指向 src 目录，方便绝对路径导入
      '@': path.resolve(__dirname, './src'),
    },
  },
  // 开发服务器配置
  server: {
    port: 5173,
    strictPort: true,
    // 代理 /api 请求到后端，彻底避免 CORS 和 CSP 问题
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:57891',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:57891',
        changeOrigin: true,
      },
    },
    headers: {
      // 允许连接本地后端，解除 CSP 对 127.0.0.1 的限制
      'Content-Security-Policy':
        "default-src 'self'; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; media-src 'self' blob: https: http:",
    },
  },
  // 生产构建输出到 dist/
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  // 让 Vite 知道 electron 和 node 模块不需要打包
  optimizeDeps: {
    exclude: ['electron'],
  },
})
