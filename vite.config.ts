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
      rollupOptions: {
        external: ['server.ts', 'cleanup.js'],
        input: {
          main: './index.html',
        },
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
