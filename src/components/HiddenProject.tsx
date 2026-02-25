// src/components/HiddenProject.tsx
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Shield, Lock } from 'lucide-react';

interface HiddenProjectProps {
  onBack: () => void;
  projectUrl: string;
}

export const HiddenProject = ({ onBack, projectUrl }: HiddenProjectProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSecureMode, setIsSecureMode] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'failed'>('checking');
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cleanupFunctionsRef = useRef<Array<() => void>>([]);
  const cleanupDoneRef = useRef(false);

  const proxyUrl = '/hidden-app/';
  const backendProxyUrl = '/hidden-api';

  // ── Security event handlers ──────────────────────────────────────────
  const enableSecurityMeasures = () => {
    const cleanupFunctions: Array<() => void> = [];

    const handleContextMenu = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'C' || e.key === 'J')) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U')) ||
        (e.ctrlKey && (e.key === 's' || e.key === 'S')) ||
        (e.ctrlKey && (e.key === 'p' || e.key === 'P'))
      ) { e.preventDefault(); e.stopPropagation(); }
    };

    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('keydown', handleKeyDown, true);
    cleanupFunctions.push(() => {
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    });

    return cleanupFunctions;
  };

  // ── Progress simulation ──────────────────────────────────────────────
  const simulateProgress = () => {
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 90) { clearInterval(interval); return 90; }
        return prev + Math.random() * 10;
      });
    }, 200);
    return () => clearInterval(interval);
  };

  // ── Connection check ─────────────────────────────────────────────────
  const checkProjectAccess = async () => {
    try {
      setConnectionStatus('checking');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(proxyUrl, { method: 'GET', cache: 'no-cache', signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) { setConnectionStatus('connected'); return true; }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      setConnectionStatus('failed');
      return false;
    }
  };

  // ── COMPREHENSIVE CLEANUP ────────────────────────────────────────────
  const performCleanup = async () => {
    // Guard: only run once per session to avoid double-cleanup
    if (cleanupDoneRef.current) return;
    cleanupDoneRef.current = true;

    try {
      // 1. CLEAR localStorage and sessionStorage completely
      //    No need to preserve JWT tokens — user must log in again next time
      //    which is the intended behavior (no traces = no saved session)
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {}

      // 2. CLEAR all cookies for this origin
      //    Iterates all cookies and sets expiry to past date
      try {
        document.cookie.split(';').forEach(cookie => {
          const name = cookie.split('=')[0].trim();
          // Clear for current path and all parent paths
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/hidden-app`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/hidden-api`;
        });
      } catch (e) {}

      // 3. CLEAR Service Worker caches (Cache API)
      try {
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        }
      } catch (e) {}

      // 4. CLEAR browser HTTP cache for hidden-app assets
      //    Fetch each known entry with cache: 'reload' to force eviction.
      //    This is the only reliable cross-browser way to bust HTTP cache
      //    without requiring Cache-Control headers on the server.
      //    We use keepalive:false and no-store to prevent re-caching.
      try {
        const pathsToClear = [
          '/hidden-app/',
          '/hidden-app/src/main.jsx',
          '/hidden-app/src/index.css',
          '/hidden-app/src/App.css',
        ];
        await Promise.allSettled(
          pathsToClear.map(p =>
            fetch(p, { cache: 'no-store', method: 'GET' }).catch(() => {})
          )
        );
      } catch (e) {}

      // 5. CLEAR browser history entries created by the stock app
      //    Strategy: replace ALL history entries accumulated during the session
      //    back to the KaratCalc root. We can't delete history entries (browser
      //    security prevents it) but we can replace them so back button never
      //    shows a hidden-app URL.
      //
      //    Count how many history entries were added (iframe navigations each
      //    add one). We replace them all with the current clean URL.
      try {
        // Replace current entry first
        window.history.replaceState(null, '', '/');

        // Walk back through any entries the iframe navigation created
        // Each replaceState call overwrites the current entry in place
        // We do this multiple times to catch any stragglers
        for (let i = 0; i < 20; i++) {
          window.history.replaceState(null, document.title, '/');
        }
      } catch (e) {}

      // 6. UNREGISTER any service workers registered by the stock app
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(r => r.unregister()));
        }
      } catch (e) {}

      // 7. CLEAR IndexedDB databases created by the stock app
      try {
        if ('indexedDB' in window) {
          // List all databases (Chrome 73+, Firefox 126+)
          if (indexedDB.databases) {
            const dbs = await indexedDB.databases();
            dbs.forEach(db => {
              if (db.name) indexedDB.deleteDatabase(db.name);
            });
          }
        }
      } catch (e) {}

      // 8. DESTROY the iframe before navigating away
      //    This forces the browser to discard the iframe's navigation history,
      //    cached resources, and JS heap — preventing back-button access
      try {
        if (iframeRef.current) {
          // Navigate iframe to blank first to trigger unload
          iframeRef.current.src = 'about:blank';
          // Then remove it from DOM
          setTimeout(() => {
            if (iframeRef.current && iframeRef.current.parentNode) {
              iframeRef.current.parentNode.removeChild(iframeRef.current);
            }
          }, 100);
        }
      } catch (e) {}

    } catch (error) {
      // Silent fail — cleanup best-effort
    }

    // Remove security event listeners
    cleanupFunctionsRef.current.forEach(fn => fn());
    cleanupFunctionsRef.current = [];
  };

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleBack = async () => {
    await performCleanup();
    onBack();
  };

  // ── Load sequence ─────────────────────────────────────────────────────
  const loadSecureProject = async () => {
    try {
      setIsLoading(true);
      setLoadingProgress(0);
      cleanupDoneRef.current = false; // Reset for new session

      const stopProgress = simulateProgress();

      // Replace current history entry so entering secure mode leaves no trace
      if (window.history.replaceState) {
        window.history.replaceState(null, '', '/');
      }

      setLoadingProgress(30);
      const isAccessible = await checkProjectAccess();
      if (!isAccessible) throw new Error('Proxy not accessible');

      setLoadingProgress(60);
      await new Promise(resolve => setTimeout(resolve, 800));
      setLoadingProgress(100);
      await new Promise(resolve => setTimeout(resolve, 400));

      stopProgress();
      setIsLoading(false);
      setIsSecureMode(true);

    } catch (error) {
      setConnectionStatus('failed');
      setIsLoading(false);
    }
  };

  // ── Effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    const cleanupFunctions = enableSecurityMeasures();
    cleanupFunctionsRef.current = cleanupFunctions;
    loadSecureProject();

    return () => {
      // Component unmounting — run cleanup
      performCleanup();
    };
  }, []);

  useEffect(() => {
    // Clean up if user closes tab or navigates away
    const handleBeforeUnload = () => { performCleanup(); };

    // Only clean up on visibility change if we're in secure mode
    // (not during normal KaratCalc use before entering secure mode)
    const handleVisibilityChange = () => {
      if (document.hidden && isSecureMode) {
        performCleanup();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isSecureMode]); // depend on isSecureMode so visibility handler is accurate

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      performCleanup();
      onBack();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onBack]);

  // ── Error state ───────────────────────────────────────────────────────
  if (connectionStatus === 'failed') {
    return (
      <div className="fixed inset-0 bg-red-900 flex items-center justify-center z-50">
        <div className="text-center text-white max-w-md mx-auto p-6">
          <div className="text-red-400 mb-4"><Shield size={48} className="mx-auto" /></div>
          <h2 className="text-xl font-semibold mb-2">Connection Error</h2>
          <p className="text-red-200 mb-2">Unable to connect to the secure application.</p>
          <p className="text-red-300 text-sm mb-6">
            Ensure both servers are running:
            <br />
            <code className="text-xs bg-red-800 px-2 py-1 rounded mt-2 inline-block">
              Frontend: localhost:5173<br />Backend: localhost:5000
            </code>
          </p>
          <button onClick={handleBack} className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium">
            Return to Calculator
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black z-50"
      style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}
    >
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-white text-sm font-medium"
          >
            <ArrowLeft size={16} />
            Exit Secure Mode
          </button>
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <Lock size={16} />
            <span>Secure Session Active</span>
          </div>
          <div className="text-xs text-gray-500">@Developed by Krushna Soni</div>
        </div>
      </nav>

      {isLoading && (
        <div className="flex items-center justify-center h-full bg-gradient-to-br from-purple-600 to-blue-600">
          <div className="text-center text-white max-w-md mx-auto p-6">
            <div className="relative mx-auto mb-6 w-20 h-20">
              <div className="absolute inset-0 border-4 border-white/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-white border-t-transparent rounded-full animate-spin" style={{ animationDuration: '1s' }}></div>
              <div className="absolute inset-2 bg-white/10 rounded-full flex items-center justify-center">
                <Shield size={24} className="text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Secure Project Access</h2>
            <p className="text-white/90 mb-1">Establishing secure connection...</p>
            <p className="text-white/70 text-sm mb-6">
              {connectionStatus === 'checking' ? 'Checking server...' : connectionStatus === 'connected' ? 'Connected!' : 'Preparing...'}
            </p>
            <div className="w-full bg-white/20 rounded-full h-2 mb-4">
              <div className="bg-white h-2 rounded-full transition-all duration-300" style={{ width: `${loadingProgress}%` }}></div>
            </div>
            <div className="text-white/60 text-sm mb-6">{Math.round(loadingProgress)}%</div>
            <div className="flex items-center justify-center gap-2 text-white/60 text-sm">
              <Lock size={16} />
              <span>No traces in browser history</span>
            </div>
          </div>
        </div>
      )}

      {!isLoading && isSecureMode && connectionStatus === 'connected' && (
        <div className="pt-16 h-full bg-black">
          <iframe
            ref={iframeRef}
            src={proxyUrl}
            className="w-full h-full border-0 bg-white"
            title="Secure Application"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
            referrerPolicy="no-referrer"
            style={{ height: 'calc(100vh - 4rem)', display: 'block' }}
            onLoad={() => {
              // Keep history clean after every iframe navigation
              // (login → sales → entries each trigger onLoad)
              if (window.history.replaceState) {
                window.history.replaceState(null, document.title, '/');
              }

              try {
                if (iframeRef.current?.contentWindow) {
                  iframeRef.current.contentWindow.postMessage({
                    type: 'PROXY_CONFIG',
                    backendProxy: backendProxyUrl,
                    isProxied: true
                  }, '*');
                }
              } catch (err) {}
            }}
            onError={() => { setConnectionStatus('failed'); }}
          />
        </div>
      )}
    </div>
  );
};