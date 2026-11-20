import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = mode === 'production';
  const allowedHosts = env.VITE_ALLOWED_HOSTS ? env.VITE_ALLOWED_HOSTS.split(',') : [];

  return {
    plugins: [
      react(),
      isProd && VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
        },
        includeAssets: ['logo.svg', 'apple-touch-icon.png', 'masked-icon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          name: 'Verdant Botanical Systems',
          short_name: 'Verdant',
          description: 'Multilingual plant care management system.',
          theme_color: '#020617',
          background_color: '#020617',
          icons: [
            {
              src: 'logo.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: 'logo.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: 'logo.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'maskable'
            }
          ],
        },
      }),
    ].filter(Boolean),
    base: './',
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        external: ['server.ts', 'cleanup.js'],
        input: {
          main: './index.html',
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('leaflet')) return 'vendor-leaflet';
              if (id.includes('recharts')) return 'vendor-recharts';
              if (id.includes('framer-motion') || id.includes('motion')) return 'vendor-motion';
              if (id.includes('lucide-react')) return 'vendor-lucide';
              if (id.includes('@zxing') || id.includes('write-excel-file') || id.includes('@mmote/niimbluelib')) return 'vendor-tools';
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor-react';
            }
          }
        }
      },
    },
    server: {
      host: true,
      allowedHosts: allowedHosts,
      warmup: {
        clientFiles: [
          './index.tsx',
          './App.tsx',
          './context/AuthContext.tsx',
          './pages/Dashboard.tsx'
        ]
      }
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'framer-motion',
        'lucide-react',
        'recharts',
        'clsx',
        'tailwind-merge'
      ]
    }
  };
});
