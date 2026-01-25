import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { createLogger } from 'vite'

const logger = createLogger()
const originalWarnOnce = logger.warnOnce

logger.warnOnce = (msg) => {
  if (msg.includes('.woff') && msg.includes('it will remain unchanged to be resolved at runtime')) return;
  originalWarnOnce(msg);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useNewUI = env.USE_NEW_UI === 'true';
  const useNewAdminUI = env.USE_NEW_ADMIN_UI === 'true';
  const adminEntry = useNewAdminUI ? resolve(__dirname, 'src/new-admin/index.html') : resolve(__dirname, 'src/admin/index.html');

  return {
    // logLevel: 'silent',
    customLogger: logger,

    plugins: [
      react(),
      // Custom plugin to handle MPA rewrites for development
      {
        name: 'mpa-rewrites',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => { // Changed _res to res as per snippet, but keeping _res for consistency with original
            const url = new URL(req.url, 'http://localhost');
            const { pathname } = url;

            // Allow Vite's own internal endpoints to pass through untouched
            if (
              pathname.startsWith('/@vite/') ||
              pathname === '/@vite/client' ||
              pathname.startsWith('/@id/') ||
              pathname.startsWith('/__vite_')
            ) {
              return next();
            }

            if (pathname === '/' || pathname === '/index.html') {
              if (useNewUI) {
                req.url = '/src/new-ui/index.html';
              } else {
                req.url = '/src/bot/index.html';
              }
              return next();
            }

            if (pathname === '/admin' || pathname === '/admin/') {
              if (useNewAdminUI) {
                req.url = '/src/new-admin/index.html';
              } else {
                req.url = '/src/admin/index.html';
              }
              return next();
            }

            if (pathname === '/dash' || pathname === '/dash/') {
              req.url = '/src/dash/index.html';
              return next();
            }

            if (pathname === '/view' || pathname === '/view/') {
              req.url = '/src/view/index.html';
              return next();
            }

            if (pathname === '/login' || pathname === '/login/') {
              req.url = '/src/login/index.html';
              return next();
            }

            next();
          });
        },
      },
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      compress: true,
      allowedHosts: ['aski.htw-dresden.de', 'localhost', '127.0.0.1'],
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:3000',
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    css: {
      postcss: './postcss.config.js',
    },
    build: {
      rollupOptions: {
        input: {
          bot: resolve(__dirname, 'src/bot/index.html'),
          newui: resolve(__dirname, 'src/new-ui/index.html'),
          admin: adminEntry, // Use the dynamically determined admin entry point
          dash: resolve(__dirname, 'src/dash/index.html'),
          login: resolve(__dirname, 'src/login/index.html'),
        },
        output: {
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash].[ext]',
        },
      },
    },
  };
});
