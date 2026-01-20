import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Get backend port from env var, default to 8080
const API_PORT = process.env.VITE_API_PORT || process.env.API_PORT || 8080;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/analytics': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    }
  }
});
