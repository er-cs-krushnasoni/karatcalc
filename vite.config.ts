// KARAT-GEM-VALUE-FINDER/vite.config.ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      host: "::",
      port: 8080,
      proxy: {

        // ── Backend API proxy ────────────────────────────────────────────
        '/hidden-api': {
          target: env.VITE_HIDDEN_PROJECT_BACKEND_URL || 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/hidden-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (env.VITE_SECRET_API_KEY) {
                proxyReq.setHeader('x-api-secret-key', env.VITE_SECRET_API_KEY);
              }
            });
            proxy.on('error', (err) => {
              console.error('❌ API proxy error:', err.message);
            });
          },
        },

        // ── Frontend proxy ───────────────────────────────────────────────
        '/hidden-app': {
          target: env.VITE_HIDDEN_PROJECT_URL || 'http://localhost:5173',
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (p) => p.replace(/^\/hidden-app/, '') || '/',
          configure: (proxy) => {

            proxy.on('proxyReq', (proxyReq) => {
              // Force fresh responses — prevent 304s bypassing our rewriter
              proxyReq.removeHeader('if-none-match');
              proxyReq.removeHeader('if-modified-since');
              proxyReq.removeHeader('cache-control');
              proxyReq.setHeader('cache-control', 'no-cache');
              proxyReq.setHeader('pragma', 'no-cache');
            });

            proxy.on('proxyRes', (proxyRes, req, res) => {
              const contentType = proxyRes.headers['content-type'] || '';
              const url = req.url || '';

              // Strip ETags so browser never sends If-None-Match
              delete proxyRes.headers['etag'];
              delete proxyRes.headers['last-modified'];

              // ── Classify response ──────────────────────────────────────
              const isBinary = /\.(woff2?|ttf|eot|otf|png|jpe?g|gif|ico|webp|mp4|wasm)(\?.*)?$/.test(url);
              if (isBinary) return;

              const isHtml = contentType.includes('text/html');

              // Standalone CSS served as text/css (e.g. <link rel="stylesheet">)
              const isStandaloneCss = contentType.includes('text/css');

              // Vite CSS-in-JS module: Vite transforms CSS imports into JS modules
              // served as application/javascript. The URL ends in .css but content
              // is JavaScript that injects a <style> tag at runtime.
              // We MUST rewrite the path AND keep the javascript content-type.
              const isCssModule = contentType.includes('javascript') &&
                                  url.includes('.css');

              // Regular JavaScript (no CSS in URL)
              const isJs = contentType.includes('javascript') &&
                           !url.includes('.css') &&
                           !isHtml;

              if (!isHtml && !isStandaloneCss && !isCssModule && !isJs) return;

              // ── Collect full response body ─────────────────────────────
              let body = Buffer.alloc(0);
              const originalEnd = res.end.bind(res);

              res.write = (chunk: any) => {
                if (chunk) body = Buffer.concat([body, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
                return true;
              };

              res.end = (chunk?: any) => {
                if (chunk) body = Buffer.concat([body, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);

                let text = body.toString('utf8');

                // ── HTML rewrites ──────────────────────────────────────
                if (isHtml) {
                  text = text.replace(
                    /(src|href)=(["'])\/(?!\/)([^"']*)\2/g,
                    (_, attr, q, p) => `${attr}=${q}/hidden-app/${p}${q}`
                  );
                  text = text.replace(/<meta[^>]+http-equiv=["']X-Frame-Options["'][^>]*>/gi, '');
                }

                // ── Standalone CSS rewrites (url() font/image paths) ───
                if (isStandaloneCss) {
                  text = text.replace(
                    /url\(\s*(["']?)\/(?!\/)([^"')]+)\1\s*\)/g,
                    (_, q, p) => `url(${q}/hidden-app/${p}${q})`
                  );
                }

                // ── CSS-in-JS module rewrites ──────────────────────────
                // These are JS files that contain CSS content injected via
                // __vite__updateStyle() or similar. They may contain string
                // literals with absolute paths for url() references.
                if (isCssModule) {
                  // Rewrite url("/...") string literals inside JS
                  text = text.replace(
                    /url\(\s*(["']?)\/(?!\/)([^"')]+)\1\s*\)/g,
                    (_, q, p) => `url(${q}/hidden-app/${p}${q})`
                  );
                  // Rewrite any other absolute path strings in CSS-in-JS
                  text = text.replace(
                    /"\/(?!\/|hidden-app\/)([^"]+\.(?:css|woff2?|ttf|png|jpg|svg)[^"]*)"/g,
                    (_, p) => `"/hidden-app/${p}"`
                  );
                }

                // ── Regular JavaScript rewrites ────────────────────────
                if (isJs) {
                  // Dynamic import() — NOW includes .css paths because
                  // we handle them correctly as JS modules above
                  text = text.replace(
                    /\bimport\(\s*(["'])\/(?!\/|hidden-app\/)([^"']+)\1\s*\)/g,
                    (_, q, p) => `import(${q}/hidden-app/${p}${q})`
                  );

                  // Static: from "/..."
                  text = text.replace(
                    /\bfrom\s+(["'])\/(?!\/|hidden-app\/)([^"']+)\1/g,
                    (_, q, p) => `from ${q}/hidden-app/${p}${q}`
                  );

                  // Side-effect: import "/..."
                  text = text.replace(
                    /\bimport\s+(["'])\/(?!\/|hidden-app\/)([^"']+)\1/g,
                    (_, q, p) => `import ${q}/hidden-app/${p}${q}`
                  );

                  // Vite internal __vite__mapDeps asset arrays
                  text = text.replace(
                    /(__vite__mapDeps\(\[)([\s\S]*?)(\]\))/g,
                    (_match: string, open: string, inner: string, close: string) => {
                      const rewritten = inner.replace(
                        /(["'])\/(?!\/|hidden-app\/)([^"']+)\1/g,
                        (_, q, p) => `${q}/hidden-app/${p}${q}`
                      );
                      return open + rewritten + close;
                    }
                  );
                }

                // ── Send rewritten response ──────────────────────────
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
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.setHeader('Content-Security-Policy', "frame-ancestors 'self' http://localhost:8080");

                originalEnd(encoded);
                return res;
              };
            });

            proxy.on('error', (err) => {
              console.error('❌ Frontend proxy error:', err.message);
            });
          },
        },
      },
    },

    plugins: [
      react(),
      mode === 'development' && componentTagger(),
    ].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});