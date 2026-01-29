import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isElectron = process.env.ELECTRON === 'true';

export default defineConfig({
  // Use relative base for Electron file:// protocol
  base: isElectron ? './' : '/',
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('[Vite Proxy] Error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[Vite Proxy] Request:', req.method, req.url);
          });
        }
      }
    },
    watch: {
      // Ignore temp_scans directory to prevent Vite from watching cloned repos
      ignored: ['**/temp_scans/**', '**/node_modules/**', '**/.git/**']
    }
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  build: {
    // Electron needs relative paths for assets
    assetsDir: 'assets',
    // Reduce memory usage during build
    minify: 'esbuild',
    sourcemap: false,
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Ensure consistent naming for production
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // Manual chunks to reduce bundle size
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'chart-vendor': ['recharts'],
          'icons': ['lucide-react']
        }
      }
    }
  }
});
