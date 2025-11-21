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
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes("node_modules")) {
            // React core
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router")) {
              return "vendor-react";
            }
            // UI libraries
            if (id.includes("@radix-ui")) {
              return "vendor-ui";
            }
            // Supabase
            if (id.includes("@supabase")) {
              return "vendor-supabase";
            }
            // TanStack (React Query, Virtual)
            if (id.includes("@tanstack")) {
              return "vendor-tanstack";
            }
            // Other large vendor libraries
            if (id.includes("lucide-react") || id.includes("date-fns") || id.includes("recharts")) {
              return "vendor-utils";
            }
            // Everything else in node_modules
            return "vendor";
          }
          // Page chunks - split by route
          if (id.includes("/pages/")) {
            const pageName = id.split("/pages/")[1]?.split("/")[0];
            if (pageName) {
              return `page-${pageName}`;
            }
          }
          // Component chunks - group large components
          if (id.includes("/components/")) {
            if (id.includes("VirtualizedFeed") || id.includes("AudioPlayer")) {
              return "component-audio";
            }
            if (id.includes("Admin") || id.includes("Analytics")) {
              return "component-admin";
            }
          }
        },
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
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@supabase/supabase-js",
      "@radix-ui/react-tooltip",
    ],
    // Force React deduplication to prevent multiple instances
    dedupe: ["react", "react-dom"],
    // Force re-optimization
    force: false,
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
