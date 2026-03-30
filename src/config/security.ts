// src/config/security.ts
const _0x1a2b = ['MCswPQ=='];
const _0x3c4d = (str: string) => atob(str);
const _0x7g8h = () => _0x3c4d(_0x1a2b[0]);

const isElectron = () =>
  typeof window !== 'undefined' &&
  window.navigator.userAgent.toLowerCase().includes('electron');

const isCapacitor = () =>
  typeof window !== 'undefined' &&
  typeof (window as any).Capacitor !== 'undefined';

export const getSecureConfig = () => {
  if (isElectron()) {
    const prodFrontend = import.meta.env.VITE_HIDDEN_PROJECT_URL;
    if (prodFrontend && !prodFrontend.includes('localhost')) {
      // Deployed version
      return {
        projectUrl: prodFrontend,
        backendUrl: import.meta.env.VITE_HIDDEN_PROJECT_BACKEND_URL || '',
        checkUrl: prodFrontend,
        triggerSequence: _0x7g8h()
      };
    }
    // Both dev and prod local Electron — always localhost:8080/hidden-app
    return {
      projectUrl: 'http://localhost:8080/hidden-app',
      backendUrl: '/hidden-api',
      checkUrl: 'http://localhost:8080/hidden-app',
      triggerSequence: _0x7g8h()
    };
  }

  // if (isCapacitor()) {
  //   // Capacitor (Android) — use LOCAL_IP from env baked at build time
  //   const localIp = import.meta.env.VITE_CAPACITOR_LOCAL_IP ||
  //                   import.meta.env.CAPACITOR_LOCAL_IP ||
  //                   '192.168.31.32';
  //   const karatCalcUrl = `http://${localIp}:8080`;
  //   return {
  //     projectUrl: `${karatCalcUrl}/hidden-app`,
  //     backendUrl: '/hidden-api',
  //     checkUrl: `${karatCalcUrl}/hidden-app`,
  //     triggerSequence: _0x7g8h()
  //   };
  // }

  if (isCapacitor()) {
    const localIp = import.meta.env.VITE_CAPACITOR_LOCAL_IP ||
                    '192.168.31.32';
    const karatCalcUrl = `http://${localIp}:8080`;
    return {
      projectUrl: `${karatCalcUrl}/hidden-app`,
      backendUrl: '/hidden-api',
      checkUrl: karatCalcUrl,     // ← root only, simpler
      triggerSequence: _0x7g8h()
    };
  }

  // Web browser
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