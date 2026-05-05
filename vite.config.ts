import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/webhook': {
          target: 'https://n8n-automation.sycapt.com:9443',
          changeOrigin: true,
          secure: false, // Accept self-signed certificates if necessary
        },
        '/api': {
          target: 'http://127.0.0.1:3005',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL': JSON.stringify(env.NEXT_PUBLIC_N8N_WEBHOOK_URL)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      }
    }
  };
});
