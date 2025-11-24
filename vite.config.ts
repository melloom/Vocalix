import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 8080,
    },
    watch: {
      usePolling: false,
    },
    // Ensure proper module serving
    fs: {
      strict: false,
    },
    // Disable HTTP/2 if causing issues
    http2: false,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Optimize chunks for better caching and code splitting
    rollupOptions: {
      output: {
        // CRITICAL: Disable code splitting entirely to prevent React chunking issues
        // This puts everything in the main bundle, ensuring React is always available
        // This fixes "createContext is undefined" errors on mobile browsers
        manualChunks: undefined,
        // Optimize chunk file names for better caching
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
            ? chunkInfo.facadeModuleId.split("/").pop()?.replace(/\.[^/.]+$/, "")
            : "chunk";
          return `assets/js/${facadeModuleId}-[hash].js`;
        },
        entryFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split(".");
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/img/[name]-[hash][extname]`;
          }
          if (/woff2?|eot|ttf|otf/i.test(ext)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }
          return `assets/[ext]/[name]-[hash][extname]`;
        },
      },
    },
    // Enable source maps for production debugging (optional)
    sourcemap: false,
    // Optimize asset sizes
    chunkSizeWarningLimit: 1000,
    // Minify with terser for better compression
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      },
    },
    // Target modern browsers for smaller bundles
    target: "esnext",
    // Ensure React is bundled together to prevent loading order issues on mobile
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-dom/client",
      "react-router-dom",
      "@supabase/supabase-js",
      "@radix-ui/react-tooltip",
    ],
    // Force React deduplication to prevent multiple instances
    dedupe: ["react", "react-dom"],
    // Force re-optimization
    force: false,
    // Ensure React is pre-bundled and available immediately
    esbuildOptions: {
      target: "es2020",
    },
  },
  // Vitest configuration
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/test/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/mockData/**",
      ],
    },
  },
}));
