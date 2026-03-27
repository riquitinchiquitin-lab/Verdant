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
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'Verdant',
          short_name: 'Verdant',
          description: 'A modern botanical companion app.',
          theme_color: '#ffffff',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
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
