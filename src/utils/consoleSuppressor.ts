// src/utils/consoleSuppressor.ts
// Suppress sensitive information in console and network tab

const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  };
  
  const sensitivePatterns = [
    /localhost:\d+/gi,
    /127\.0\.0\.1:\d+/gi,
    /devtunnels/gi,
    /http:\/\//gi,
    /https:\/\//gi,
    /\.local/gi,
    /backend/gi,
    /api\/auth/gi,
    /api\/users/gi,
    /api\/entries/gi
  ];
  
  const shouldSuppress = (arg: any): boolean => {
    if (typeof arg === 'string') {
      return sensitivePatterns.some(pattern => pattern.test(arg));
    }
    if (typeof arg === 'object' && arg !== null) {
      return JSON.stringify(arg).match(sensitivePatterns.join('|')) !== null;
    }
    return false;
  };
  
  export const initializeConsoleSuppressor = () => {
    // Override console methods
    (['log', 'info', 'warn', 'error', 'debug'] as const).forEach(method => {
      console[method] = (...args: any[]) => {
        // Filter sensitive information
        const filteredArgs = args.map(arg => {
          if (shouldSuppress(arg)) {
            return '[REDACTED]';
          }
          return arg;
        });
        
        // Only log if not everything was redacted
        if (!filteredArgs.every(arg => arg === '[REDACTED]')) {
          originalConsole[method](...filteredArgs);
        }
      };
    });
  
    // Override network monitoring
    if (window.performance && window.performance.getEntriesByType) {
      const originalGetEntries = window.performance.getEntriesByType;
      window.performance.getEntriesByType = function(type: string) {
        const entries = originalGetEntries.call(this, type);
        if (type === 'resource') {
          return entries.filter((entry: any) => {
            return !sensitivePatterns.some(pattern => pattern.test(entry.name));
          });
        }
        return entries;
      };
    }
  };
  
  export const restoreConsole = () => {
    Object.assign(console, originalConsole);
  };