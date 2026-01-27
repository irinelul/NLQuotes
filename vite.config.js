import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import { getTenantById } from './tenants/tenant-manager.js';

// Load environment variables (Vite doesn't auto-load dotenv)
dotenv.config();

// Get backend port from env var, or detect from tenant config
let API_PORT = process.env.VITE_API_PORT || process.env.API_PORT;

if (!API_PORT) {
  // Try to get port from tenant config if TENANT_ID is set
  const forcedTenantId = process.env.TENANT_ID;
  console.log(`[Vite] TENANT_ID from env:`, forcedTenantId);
  if (forcedTenantId) {
    try {
      const tenant = getTenantById(forcedTenantId);
      API_PORT = tenant?.port || 8080;
      console.log(`[Vite] ✓ Using port ${API_PORT} from tenant config for ${forcedTenantId}`);
    } catch (e) {
      console.error(`[Vite] ✗ Error getting tenant config:`, e.message);
      API_PORT = 8080;
    }
  } else {
    console.log(`[Vite] No TENANT_ID set, using default port 8080`);
    API_PORT = 8080;
  }
}

API_PORT = parseInt(API_PORT) || 8080;
console.log(`[Vite] Proxy target: http://localhost:${API_PORT}`);

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
    emptyOutDir: true, // Ensure dist folder is cleaned before each build
    rollupOptions: {
      output: {
        manualChunks: undefined,
        assetFileNames: 'assets/[name].[hash].[ext]'
      }
    }
  }
});
