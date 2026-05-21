import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    // Plotly and AG Grid are loaded only when chart/table UI is rendered. Keep
    // the warning budget above those intentional lazy chunks so new warnings
    // point to actual regressions instead of expected analysis tooling.
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('react') || id.includes('react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('@xyflow')) {
            return 'flow-vendor';
          }
          if (id.includes('@mui')) {
            return 'mui-vendor';
          }
          if (id.includes('ag-grid')) {
            return 'ag-grid';
          }
          if (id.includes('plotly.js') || id.includes('react-plotly')) {
            return 'plotly';
          }
          return undefined;
        }
      }
    }
  },
})
