import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import path from 'path'

import { resolve } from 'node:path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    {
      ...vue(), apply: 'serve'
    },
    {
      ...dts({
        rollupTypes: true
      }), apply: 'build'
    },
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/core/index.ts'),
      name: 'SuperEarth',
      fileName: formats => `earth.${formats}.js`
    },
    copyPublicDir: false,
    rollupOptions: {
      external: ['cesium'], // 不打包cesium
      output: {
        globals: {
          cesium: 'Cesium'
        }
      }
    }
  }
})