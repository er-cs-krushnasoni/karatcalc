// src/config/security.ts
const _0x1a2b = ['MCswPQ=='];
const _0x3c4d = (str: string) => atob(str);
const _0x7g8h = () => _0x3c4d(_0x1a2b[0]);

const isElectron = () =>
  typeof window !== 'undefined' &&
  window.navigator.userAgent.toLowerCase().includes('electron');

const isElectronProd = () =>
  isElectron() && window.location.protocol === 'file:';

const isCapacitor = () =>
  typeof window !== 'undefined' &&
  typeof (window as any).Capacitor !== 'undefined' &&
  (window as any).Capacitor.isNativePlatform?.();

export const getSecureConfig = () => {

  // ── Electron dev (localhost:8080) ──────────────────────────────────────
  if (isElectron() && !isElectronProd()) {
    return {
      projectUrl: 'http://localhost:8080/hidden-app',
      backendUrl: '/hidden-api',
      checkUrl: 'http://localhost:8080',
      triggerSequence: _0x7g8h()
    };
  }

  // ── Electron production (.exe, file:// protocol) ───────────────────────
  // Calculator works offline. 0+0= checks internet via IPC then loads
  // Netlify URL in the iframe — no local servers needed.
  if (isElectronProd()) {
    const prodFrontend = import.meta.env.VITE_HIDDEN_PROJECT_URL
      || 'https://jewellery-stock-management.netlify.app';
    const prodBackend  = import.meta.env.VITE_HIDDEN_PROJECT_BACKEND_URL
      || 'https://jewellery-stock-management.up.railway.app';
    return {
      projectUrl: prodFrontend,
      backendUrl: prodBackend,
      checkUrl: 'http://localhost:8080',
      triggerSequence: _0x7g8h()
    };
  }

  // ── Capacitor (Android native app) ────────────────────────────────────
  if (isCapacitor()) {
    const useProduction = import.meta.env.VITE_CAPACITOR_USE_PRODUCTION === 'true';

    if (useProduction) {
      // Production APK — use Netlify + Railway URLs
      const prodFrontend = import.meta.env.VITE_HIDDEN_PROJECT_URL
        || 'https://jewellery-stock-management.netlify.app';
      const prodBackend  = import.meta.env.VITE_HIDDEN_PROJECT_BACKEND_URL
        || 'https://jewellery-stock-management.up.railway.app';
      return {
        projectUrl: prodFrontend,
        backendUrl: prodBackend,
        checkUrl: prodFrontend,
        triggerSequence: _0x7g8h()
      };
    }

    // Local dev APK — use local machine IP
    // backendUrl must be absolute (http://IP:port/hidden-api) because
    // relative paths resolve to http://localhost inside Android WebView
    const localIp = import.meta.env.VITE_CAPACITOR_LOCAL_IP || '192.168.31.32';
    const karatCalcUrl = `http://${localIp}:8080`;
    return {
      projectUrl: `${karatCalcUrl}/hidden-app`,
      backendUrl: `${karatCalcUrl}/hidden-api`,  // ← absolute, not relative
      checkUrl: karatCalcUrl,
      triggerSequence: _0x7g8h()
    };
  }

  // ── Web browser (Netlify production or local dev) ──────────────────────
  // In production: VITE_FRONTEND_PROXY = full Netlify Site B URL
  // In local dev:  VITE_FRONTEND_PROXY = /hidden-app (relative)
  const frontendProxy = import.meta.env.VITE_FRONTEND_PROXY || '/hidden-app';
  const backendProxy  = import.meta.env.VITE_BACKEND_PROXY  || '/hidden-api';
  return {
    projectUrl: frontendProxy,
    backendUrl: backendProxy,
    checkUrl: frontendProxy,
    triggerSequence: _0x7g8h()
  };

};

export const getProjectConfig = () => {
  const config = getSecureConfig();
  return { url: config.projectUrl, trigger: config.triggerSequence };
};