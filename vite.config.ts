
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  // Prioritize VITE_GOOGLE_API_KEY (from Render/User) or fallback to API_KEY
  const apiKey = env.VITE_GOOGLE_API_KEY || env.API_KEY || '';

  return {
    plugins: [react()],
    define: {
      // Stringify the API key to inject it into the client code
      'process.env.API_KEY': JSON.stringify(apiKey),
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-markdown', 'remark-gfm'],
            'vendor-ui': ['lucide-react'],
            'vendor-ai': ['@google/genai'],
            'vendor-db': ['@supabase/supabase-js'],
          }
        }
      }
    }
  }
})
