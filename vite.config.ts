// vite.config.ts — updated for Electron + Capacitor compatibility
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Prevent ECONNRESET from crashing Vite dev server
process.on('uncaughtException', (err: any) => {
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
  console.error('Uncaught exception:', err);
  process.exit(1);
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const HIDDEN_PROJECT_URL  = env.VITE_HIDDEN_PROJECT_URL         || 'http://localhost:5173';
  const HIDDEN_BACKEND_URL  = env.VITE_HIDDEN_PROJECT_BACKEND_URL || 'http://localhost:5000';
  const KARATCALC_ORIGIN    = env.VITE_KARATCALC_ORIGIN           || 'http://localhost:8080';
  const SECRET_API_KEY      = env.VITE_SECRET_API_KEY;

  return {
    server: {
      host: "0.0.0.0",
      port: 8080,

      allowedHosts: [
        'localhost',
        '127.0.0.1',
        '192.168.31.32',
        '192.168.238.1',
        '192.168.163.1',
        '.devtunnels.ms',
        '.ngrok.io',
        '.ngrok-free.app',
      ],

      proxy: {
        '/hidden-api': {
          target: HIDDEN_BACKEND_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/hidden-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (SECRET_API_KEY) proxyReq.setHeader('x-api-secret-key', SECRET_API_KEY);
              proxyReq.setHeader('origin', KARATCALC_ORIGIN);
            });
            proxy.on('error', (err: any) => {
              if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
              console.error('❌ API proxy error:', err.message);
            });
          },
        },

        '/hidden-app': {
          target: HIDDEN_PROJECT_URL,
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (p) => p.replace(/^\/hidden-app/, '') || '/',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('if-none-match');
              proxyReq.removeHeader('if-modified-since');
              proxyReq.setHeader('cache-control', 'no-cache');
              proxyReq.setHeader('origin', KARATCALC_ORIGIN);
            });

            proxy.on('proxyRes', (proxyRes, req, res) => {
              const contentType = proxyRes.headers['content-type'] || '';
              const url = req.url || '';

              delete proxyRes.headers['etag'];
              delete proxyRes.headers['last-modified'];

              const isBinary = /\.(woff2?|ttf|eot|otf|png|jpe?g|gif|ico|webp|mp4|wasm)(\?.*)?$/.test(url);
              if (isBinary) return;

              const isHtml          = contentType.includes('text/html');
              const isStandaloneCss = contentType.includes('text/css');
              const isCssModule     = contentType.includes('javascript') && url.includes('.css');
              const isJs            = contentType.includes('javascript') && !url.includes('.css') && !isHtml;

              if (!isHtml && !isStandaloneCss && !isCssModule && !isJs) return;

              let body = Buffer.alloc(0);
              const originalEnd = res.end.bind(res);

              res.write = (chunk: any) => {
                if (chunk) body = Buffer.concat([body, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
                return true;
              };

              res.end = (chunk?: any) => {
                if (chunk) body = Buffer.concat([body, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
                let text = body.toString('utf8');

                if (isHtml) {
                  text = text.replace(
                    /(src|href)=(["'])\/(?!\/)([^"']*)\2/g,
                    (_, attr, q, p) => `${attr}=${q}/hidden-app/${p}${q}`
                  );
                  text = text.replace(/<meta[^>]+http-equiv=["']X-Frame-Options["'][^>]*>/gi, '');
                }

                if (isStandaloneCss) {
                  text = text.replace(
                    /url\(\s*(["']?)\/(?!\/)([^"')]+)\1\s*\)/g,
                    (_, q, p) => `url(${q}/hidden-app/${p}${q})`
                  );
                }

                if (isCssModule) {
                  text = text.replace(
                    /url\(\s*(["']?)\/(?!\/)([^"')]+)\1\s*\)/g,
                    (_, q, p) => `url(${q}/hidden-app/${p}${q})`
                  );
                  text = text.replace(
                    /"\/(?!\/|hidden-app\/)([^"]+\.(?:css|woff2?|ttf|png|jpg|svg)[^"]*)"/g,
                    (_, p) => `"/hidden-app/${p}"`
                  );
                }

                if (isJs) {
                  text = text.replace(
                    /\bimport\(\s*(["'])\/(?!\/|hidden-app\/)([^"']+)\1\s*\)/g,
                    (_, q, p) => `import(${q}/hidden-app/${p}${q})`
                  );
                  text = text.replace(
                    /\bfrom\s+(["'])\/(?!\/|hidden-app\/)([^"']+)\1/g,
                    (_, q, p) => `from ${q}/hidden-app/${p}${q}`
                  );
                  text = text.replace(
                    /\bimport\s+(["'])\/(?!\/|hidden-app\/)([^"']+)\1/g,
                    (_, q, p) => `import ${q}/hidden-app/${p}${q}`
                  );
                  text = text.replace(
                    /(__vite__mapDeps\(\[)([\s\S]*?)(\]\))/g,
                    (_match: string, open: string, inner: string, close: string) => {
                      const rewritten = inner.replace(
                        /(["'])\/(?!\/|hidden-app\/)([^"']+)\1/g,
                        (_: string, q: string, p: string) => `${q}/hidden-app/${p}${q}`
                      );
                      return open + rewritten + close;
                    }
                  );
                }

                const finalContentType =
                  isHtml          ? 'text/html; charset=utf-8' :
                  isStandaloneCss ? 'text/css; charset=utf-8' :
                                    (contentType || 'application/javascript; charset=utf-8');

                const encoded = Buffer.from(text, 'utf8');
                res.removeHeader('X-Frame-Options');
                res.removeHeader('content-length');
                res.removeHeader('etag');
                res.removeHeader('last-modified');
                res.setHeader('Content-Type', finalContentType);
                res.setHeader('Content-Length', encoded.length);
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Content-Security-Policy',
                  `frame-ancestors 'self' ${KARATCALC_ORIGIN} http://localhost http://localhost:8080 http://127.0.0.1 http://192.168.31.32:8080 http://192.168.238.1:8080 http://192.168.163.1:8080`
                );
                originalEnd(encoded);
                return res;
              };
            });

            proxy.on('error', (err: any) => {
              if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
              console.error('❌ Frontend proxy error:', err.message);
            });
          },
        },
      },
    },

    // ── IMPORTANT for Electron production build ─────────────────────────
    base: mode === 'production' ? './' : '/',

    plugins: [
      react(),
      mode === 'development' && componentTagger(),
      {
        name: 'handle-econnreset',
        configureServer(server: import('vite').ViteDevServer) {
          server.httpServer?.on('error', (err: any) => {
            if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
            console.error('Vite server error:', err);
          });
          server.middlewares.use((_req: any, res: any, next: any) => {
            res.on('error', (err: any) => {
              if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return;
              console.error('Response error:', err);
            });
            next();
          });
        }
      }
    ].filter(Boolean),

    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
  };
});