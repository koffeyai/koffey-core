import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve';
  const isProd = mode === 'production';

  return {
    server: {
      host: "::",
      port: 5173,
      hmr: {
        overlay: true
      }
    },
    plugins: [
      react(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      // Let Vite/Rollup determine safe chunking to avoid circular vendor deps in production.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            react_core: ['react', 'react-dom', 'react-router-dom'],
            supabase_core: ['@supabase/supabase-js', '@tanstack/react-query'],
            ui_radix: [
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-tabs',
              '@radix-ui/react-toast',
            ],
            pptx_editor: ['pptxgenjs'],
            markdown: ['react-markdown', 'remark-gfm'],
          },
        },
      },
      // Enable source maps for better debugging
      sourcemap: !isProd,
      // Clear output directory
      emptyOutDir: true
    },
    optimizeDeps: {
      include: ['@supabase/supabase-js', 'react', 'react-dom'],
      exclude: ['@vite/client', '@vite/env'],
      // Keep Vite defaults for cache invalidation; forced re-bundling can
      // produce stale hashed dep requests (504 Outdated Optimize Dep).
    },

    define: {
      __DEV__: isDev,
      __PROD__: isProd
    }
  };
});
