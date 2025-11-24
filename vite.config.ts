import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Target ES2018 to support older iOS/Safari browsers that struggle with esnext bundles
const legacyTarget = "es2018";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Ensure dev builds also respect the legacy target for best compatibility
  esbuild: {
    target: legacyTarget,
  },
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
          // CRITICAL: React and ALL React-dependent code MUST be in the main bundle
          // This prevents "createContext/forwardRef is undefined" errors on mobile browsers
          
          // Keep ALL React code in main bundle - be very aggressive
          if (id.includes("react") && !id.includes("react-router") && !id.includes("@tanstack/react-query")) {
            return undefined; // undefined = main bundle
          }
          
          // Keep ALL context files in main bundle (they use React.createContext)
          if (id.includes("/context/")) {
            return undefined;
          }
          
          // Keep ALL component files in main bundle - they all use React
          // UI components use React.forwardRef, ErrorBoundary uses React, etc.
          if (id.includes("/components/")) {
            return undefined; // Keep ALL components with React
          }
          
          // Keep main.tsx and App.tsx in main bundle
          if (id.includes("/main.tsx") || id.includes("/App.tsx")) {
            return undefined;
          }
          
          // Keep hooks that use React in main bundle
          if (id.includes("/hooks/")) {
            return undefined;
          }
          
          // Vendor chunks - but NOT React
          if (id.includes("node_modules")) {
            // React Router can be separate (it doesn't need to load before contexts)
            if (id.includes("react-router")) {
              return "vendor-router";
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
          // Page chunks - split by route (but keep initial pages in main bundle)
          // Only chunk pages that are lazy-loaded
          if (id.includes("/pages/")) {
            // Keep the Index page in main bundle since it's the entry point
            if (id.includes("/pages/Index")) {
              return undefined;
            }
            const pageName = id.split("/pages/")[1]?.split("/")[0];
            if (pageName) {
              return `page-${pageName}`;
            }
          }
          // All components are kept in main bundle (see above)
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
    // Target slightly older browsers (iOS 13+/Safari 13+) to prevent script parse errors
    target: legacyTarget,
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
      target: legacyTarget,
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
