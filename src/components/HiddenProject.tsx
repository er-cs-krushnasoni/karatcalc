// src/components/HiddenProject.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Shield, Lock } from 'lucide-react';
import { getSecureConfig } from '../config/security';

interface HiddenProjectProps {
  onBack: () => void;
  projectUrl: string;
}

const isElectron = () =>
  typeof window !== 'undefined' &&
  window.navigator.userAgent.toLowerCase().includes('electron');

export const HiddenProject = ({ onBack, projectUrl }: HiddenProjectProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSecureMode, setIsSecureMode] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'failed'>('checking');
  const [iframeLoading, setIframeLoading] = useState(true);
  const [navHeight, setNavHeight] = useState(56);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const isMountedRef = useRef(true);
  const hasExitedRef = useRef(false);

  const config = getSecureConfig();
  const proxyUrl = config.projectUrl;
  const backendProxyUrl = config.backendUrl;

  // ── Track mount ───────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // ── Measure nav height ────────────────────────────────────────────────
  useEffect(() => {
    if (!navRef.current) return;
    const observer = new ResizeObserver(() => {
      if (navRef.current) setNavHeight(navRef.current.getBoundingClientRect().height);
    });
    observer.observe(navRef.current);
    setNavHeight(navRef.current.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, []);

  // ── Security: block devtools shortcuts ───────────────────────────────
  useEffect(() => {
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
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  // ── Back button handler (Capacitor + browser) ─────────────────────────
  useEffect(() => {
    let capacitorListener: any = null;
    const setupBackHandler = async () => {
      try {
        const { App } = await import('@capacitor/app');
        capacitorListener = await App.addListener('backButton', () => exitSecureMode());
      } catch {
        window.history.replaceState({ secureMode: true }, '', window.location.pathname);
        const handlePopState = () => exitSecureMode();
        window.addEventListener('popstate', handlePopState);
        capacitorListener = { remove: () => window.removeEventListener('popstate', handlePopState) };
      }
    };
    setupBackHandler();
    return () => { if (capacitorListener?.remove) capacitorListener.remove(); };
  }, []);

  // ── Handle file download postMessage from iframe ──────────────────────
  // The Jewellery app iframe sends DOWNLOAD_FILE messages when the user
  // taps a download button — we handle the share sheet here in the parent
  // because navigator.share works in the parent but not in a sandboxed iframe
  useEffect(() => {
    const handleDownloadMessage = async (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'DOWNLOAD_FILE') return;

      console.log('📥 DOWNLOAD_FILE received from iframe:', event.data.filename);

      try {
        const { filename, mimeType, data } = event.data;
        const uint8Array = new Uint8Array(data);
        const blob = new Blob([uint8Array], { type: mimeType });
        const file = new File([blob], filename, { type: mimeType });

        console.log('📁 File created:', filename, 'size:', blob.size, 'bytes');

        // Check if Web Share API supports files on this device
        const canShareFiles = navigator.share && navigator.canShare && navigator.canShare({ files: [file] });
        console.log('📤 canShare files:', canShareFiles);

        if (canShareFiles) {
          console.log('✅ Opening share sheet...');
          await navigator.share({ files: [file], title: filename });
          console.log('✅ Share completed');
        } else {
          // Fallback: open blob URL in new tab — user can long-press to save
          console.log('⚠️ Share API not available, using fallback blob URL');
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('ℹ️ User cancelled share');
          return;
        }
        console.error('❌ Download handler error:', err);
      }
    };

    window.addEventListener('message', handleDownloadMessage);
    return () => window.removeEventListener('message', handleDownloadMessage);
  }, []);

  // ── Exit Secure Mode ──────────────────────────────────────────────────
  const exitSecureMode = useCallback(async () => {
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;
    try { if (iframeRef.current) iframeRef.current.src = 'about:blank'; } catch {}
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    try {
      document.cookie.split(';').forEach(cookie => {
        const name = cookie.split('=')[0].trim();
        ['/', '/hidden-app', '/hidden-api'].forEach(p => {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${p}`;
        });
      });
    } catch {}
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
    } catch {}
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch {}
    try {
      if ('indexedDB' in window && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        dbs.forEach(db => { if (db.name) indexedDB.deleteDatabase(db.name); });
      }
    } catch {}
    try { window.history.replaceState(null, '', window.location.pathname); } catch {}
    if (isMountedRef.current) onBack();
  }, [onBack]);

  // ── Progress simulation ───────────────────────────────────────────────
  const simulateProgress = () => {
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 90) { clearInterval(interval); return 90; }
        return prev + Math.random() * 10;
      });
    }, 200);
    return () => clearInterval(interval);
  };

  // ── Load sequence ─────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setLoadingProgress(0);
      const stopProgress = simulateProgress();
      setLoadingProgress(30);
      await new Promise(resolve => setTimeout(resolve, 400));
      setLoadingProgress(70);
      await new Promise(resolve => setTimeout(resolve, 400));
      setLoadingProgress(100);
      await new Promise(resolve => setTimeout(resolve, 200));
      stopProgress();
      if (isMountedRef.current) {
        setConnectionStatus('connected');
        setIsLoading(false);
        setIsSecureMode(true);
        setIframeLoading(true);
      }
    };
    load();
  }, []);

  // ── Main render ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black z-50"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}>

      {/* Navbar */}
      <nav ref={navRef}
        className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur border-b border-gray-800"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={exitSecureMode}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-white text-sm font-medium">
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

      {/* Initial loader */}
      {isLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600">
          <div className="text-center text-white max-w-md mx-auto p-6">
            <div className="relative mx-auto mb-6 w-20 h-20">
              <div className="absolute inset-0 border-4 border-white/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-white border-t-transparent rounded-full animate-spin"
                style={{ animationDuration: '1s' }}></div>
              <div className="absolute inset-2 bg-white/10 rounded-full flex items-center justify-center">
                <Shield size={24} className="text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Secure Project Access</h2>
            <p className="text-white/90 mb-1">Establishing secure connection...</p>
            <p className="text-white/70 text-sm mb-6">
              {connectionStatus === 'checking' ? 'Checking server...' : 'Connected!'}
            </p>
            <div className="w-full bg-white/20 rounded-full h-2 mb-4">
              <div className="bg-white h-2 rounded-full transition-all duration-300"
                style={{ width: `${loadingProgress}%` }}></div>
            </div>
            <div className="text-white/60 text-sm mb-6">{Math.round(loadingProgress)}%</div>
            <div className="flex items-center justify-center gap-2 text-white/60 text-sm">
              <Lock size={16} />
              <span>No traces in browser history</span>
            </div>
          </div>
        </div>
      )}

      {/* Iframe container */}
      {!isLoading && isSecureMode && connectionStatus === 'connected' && (
        <div className="fixed left-0 right-0 bottom-0 bg-black overflow-hidden"
          style={{
            top: `${navHeight}px`,
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
          }}>
          {iframeLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
              <div className="relative w-16 h-16 mb-4">
                <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"
                  style={{ animationDuration: '0.9s' }}></div>
                <div className="absolute inset-2 bg-white/5 rounded-full flex items-center justify-center">
                  <Lock size={18} className="text-blue-400" />
                </div>
              </div>
              <p className="text-white/80 text-sm font-medium">Loading application...</p>
              <p className="text-white/40 text-xs mt-1">Please wait</p>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={proxyUrl}
            className="w-full border-0 bg-white"
            title="Secure Application"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
            referrerPolicy="no-referrer"
            style={{ display: 'block', width: '100%', height: '100%' }}
            onLoad={() => {
              setIframeLoading(false);
              try {
                if (iframeRef.current?.contentWindow) {
                  iframeRef.current.contentWindow.postMessage({
                    type: 'PROXY_CONFIG',
                    backendProxy: backendProxyUrl,
                    isProxied: true
                  }, '*');
                }
              } catch {}
            }}
            onError={() => setConnectionStatus('failed')}
          />
        </div>
      )}
    </div>
  );
};