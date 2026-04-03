// src/hooks/useCalculator.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { getSecureConfig } from '../config/security';

interface CalculatorState {
  display: string;
  expression: string;
  previousValue: string;
  operation: string;
  waitingForNumber: boolean;
  isError: boolean;
  isHidden: boolean;
  triggerSequence: string;
}

const initialState: CalculatorState = {
  display: '0', expression: '', previousValue: '',
  operation: '', waitingForNumber: false,
  isError: false, isHidden: false, triggerSequence: ''
};

const isElectron = () =>
  typeof window !== 'undefined' &&
  window.navigator.userAgent.toLowerCase().includes('electron');

const isElectronProd = () =>
  isElectron() && window.location.protocol === 'file:';

const isCapacitor = () =>
  typeof window !== 'undefined' &&
  typeof (window as any).Capacitor !== 'undefined' &&
  (window as any).Capacitor.isNativePlatform?.();

export const useCalculator = () => {
  const [state, setState] = useState<CalculatorState>(initialState);
  const isHiddenRef = useRef(false);

  // ── Capacitor back button ─────────────────────────────────────────────
  useEffect(() => {
    let capacitorListener: any = null;
    const setupBackHandler = async () => {
      try {
        const { App } = await import('@capacitor/app');
        capacitorListener = await App.addListener('backButton', () => {
          if (!isHiddenRef.current) App.minimizeApp();
        });
      } catch { /* web/electron */ }
    };
    setupBackHandler();
    return () => { if (capacitorListener?.remove) capacitorListener.remove(); };
  }, []);

  const setError = useCallback((errorMessage: string) => {
    setState(prev => ({ ...prev, display: errorMessage, isError: true, expression: '' }));
  }, []);

  const openSecureWindow = useCallback(() => {
    isHiddenRef.current = true;
    setState(prev => ({ ...prev, isHidden: true, display: '0' }));
  }, []);

  const checkTriggerSequence = useCallback((newSequence: string) => {
    const config = getSecureConfig();
    if (newSequence !== config.triggerSequence) {
      if (newSequence.length >= config.triggerSequence.length) setError('ERROR');
      return;
    }

    // ── Electron production (.exe, file:// protocol) ───────────────────
    // Uses IPC to check local server is running — internet not required
    if (isElectronProd()) {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.checkServer) { setError('ERROR'); return; }
      electronAPI.checkServer('http://localhost:8080')
        .then((reachable: boolean) => {
          if (reachable) openSecureWindow();
          else setError('ERROR');
        })
        .catch(() => setError('ERROR'));
      return;
    }

    // ── Capacitor (Android) ───────────────────────────────────────────
    // Requires internet to reach the backend — show ERROR if offline
    if (isCapacitor()) {
      if (!navigator.onLine) { setError('ERROR'); return; }
      import('@capacitor/core').then(({ CapacitorHttp }) => {
        CapacitorHttp.request({
          method: 'GET',
          url: config.checkUrl,
          headers: { 'Accept': '*/*' },
        })
          .then((response) => {
            if (response.status >= 200 && response.status < 500) openSecureWindow();
            else setError('ERROR');
          })
          .catch(() => setError('ERROR'));
      }).catch(() => setError('ERROR'));
      return;
    }

    // ── Web browser production (Netlify) ──────────────────────────────
    // Cross-origin fetch to another Netlify site is CORS blocked, so we
    // rely on navigator.onLine — show ERROR if offline, open if online
    if (import.meta.env.PROD) {
      if (!navigator.onLine) { setError('ERROR'); return; }
      openSecureWindow();
      return;
    }

    // ── Web browser local dev ─────────────────────────────────────────
    // Check the local dev server is actually running via fetch
    fetch(config.checkUrl, { method: 'HEAD', cache: 'no-cache' })
      .then(() => openSecureWindow())
      .catch(() => setError('ERROR'));

  }, [setError, openSecureWindow]);

  const handleNumberClick = useCallback((number: string) => {
    setState(prev => {
      if (prev.isError) return prev;
      const newTrigger = prev.triggerSequence + number;
      if (prev.waitingForNumber) {
        return { ...prev, display: number, expression: prev.expression + number,
                 waitingForNumber: false, triggerSequence: newTrigger };
      }
      return { ...prev,
               display: prev.display === '0' ? number : prev.display + number,
               expression: prev.expression + number, triggerSequence: newTrigger };
    });
  }, []);

  const handleOperatorClick = useCallback((operator: string) => {
    setState(prev => {
      if (prev.isError) return prev;
      const newTrigger = prev.triggerSequence + operator;
      if (prev.operation && !prev.waitingForNumber) {
        try {
          const result = calculate(prev.previousValue, prev.display, prev.operation);
          return { ...prev, display: result.toString(),
                   expression: prev.expression + operator,
                   previousValue: result.toString(), operation: operator,
                   waitingForNumber: true, triggerSequence: newTrigger };
        } catch {
          return { ...prev, display: 'Error', expression: '', operation: '',
                   previousValue: '', waitingForNumber: false,
                   isError: true, triggerSequence: '' };
        }
      }
      return { ...prev, previousValue: prev.display, operation: operator,
               expression: prev.expression + operator,
               waitingForNumber: true, triggerSequence: newTrigger };
    });
  }, []);

  const handleEqualsClick = useCallback(() => {
    setState(prev => {
      if (prev.isError) return prev;
      const newTrigger = prev.triggerSequence + '=';
      if (prev.operation && prev.previousValue) {
        try {
          const result = calculate(prev.previousValue, prev.display, prev.operation);
          const config = getSecureConfig();
          if (newTrigger === config.triggerSequence) {
            setTimeout(() => checkTriggerSequence(newTrigger), 0);
          }
          return { ...prev, display: result.toString(),
                   expression: prev.expression + '=' + result.toString(),
                   operation: '', previousValue: '', waitingForNumber: false,
                   triggerSequence: '' };
        } catch {
          const config = getSecureConfig();
          if (newTrigger === config.triggerSequence) {
            setTimeout(() => checkTriggerSequence(newTrigger), 0);
            return { ...prev, display: 'Error',
                     expression: prev.expression + '=Error',
                     operation: '', previousValue: '', waitingForNumber: false,
                     triggerSequence: '' };
          }
          return { ...prev, display: 'Error', expression: '', operation: '',
                   previousValue: '', waitingForNumber: false,
                   isError: true, triggerSequence: '' };
        }
      }
      return { ...prev, triggerSequence: newTrigger };
    });
  }, [checkTriggerSequence]);

  const handleBackspaceClick = useCallback(() => {
    setState(prev => {
      if (prev.isError) return prev;
      return { ...prev,
               display: prev.display.length > 1 ? prev.display.slice(0, -1) : '0',
               expression: prev.expression.slice(0, -1),
               triggerSequence: prev.triggerSequence.slice(0, -1) };
    });
  }, []);

  const handleAllClearClick = useCallback(() => {
    isHiddenRef.current = false;
    setState(initialState);
  }, []);

  const handleDecimalClick = useCallback(() => {
    setState(prev => {
      if (prev.isError || prev.display.includes('.')) return prev;
      return { ...prev, display: prev.display + '.', expression: prev.expression + '.' };
    });
  }, []);

  const handleGoldConversion = useCallback((karat: string) => {
    setState(prev => {
      if (prev.isError) return prev;
      const value = parseFloat(prev.display);
      if (isNaN(value)) return prev;
      const purities: Record<string, number> = { '18K': 0.75, '20K': 0.8333, '22K': 0.916 };
      const purity = purities[karat];
      if (!purity) return prev;
      const result = parseFloat((value * purity).toFixed(4)).toString();
      return { ...prev, display: result,
               expression: `${prev.display}×${karat}=${result}`,
               operation: '', previousValue: '', waitingForNumber: false,
               triggerSequence: '' };
    });
  }, []);

  const handleBackClick = useCallback(() => {
    isHiddenRef.current = false;
    setState(initialState);
  }, []);

  const setIsHidden = useCallback((hidden: boolean) => {
    isHiddenRef.current = hidden;
    if (!hidden) setState(initialState);
    else setState(prev => ({ ...prev, isHidden: true }));
  }, []);

  return {
    display: state.display, expression: state.expression,
    isError: state.isError, isHidden: state.isHidden,
    handleNumberClick, handleOperatorClick, handleEqualsClick,
    handleBackspaceClick, handleAllClearClick, handleDecimalClick,
    handleGoldConversion, handleBackClick, setIsHidden
  };
};

const calculate = (a: string, b: string, operation: string): number => {
  const numA = parseFloat(a), numB = parseFloat(b);
  switch (operation) {
    case '+': return numA + numB;
    case '-': return numA - numB;
    case '×': return numA * numB;
    case '÷': if (numB === 0) throw new Error('Division by zero'); return numA / numB;
    default: return numB;
  }
};