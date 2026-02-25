// src/config/security.ts
// Secure configuration - URLs accessed through proxy only

// Obfuscated trigger sequence (0+0=)
const _0x1a2b = ['MCswPQ=='];
const _0x3c4d = (str: string) => atob(str);
const _0x7g8h = () => _0x3c4d(_0x1a2b[0]);

export const getSecureConfig = () => {
  const frontendProxy = import.meta.env.VITE_FRONTEND_PROXY || '/hidden-app';
  const backendProxy = import.meta.env.VITE_BACKEND_PROXY || '/hidden-api';

  return {
    projectUrl: frontendProxy,
    backendUrl: backendProxy,
    triggerSequence: _0x7g8h()
  };
};

export const getProjectConfig = () => {
  const config = getSecureConfig();
  return {
    url: config.projectUrl,
    trigger: config.triggerSequence
  };
};