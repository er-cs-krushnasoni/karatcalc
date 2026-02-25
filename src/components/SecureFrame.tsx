// src/components/SecureFrame.tsx
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface SecureFrameProps {
  title?: string;
}

export const SecureFrame = ({ title = "Secure Application" }: SecureFrameProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const proxyEndpoint = import.meta.env.VITE_FRONTEND_PROXY || '/hidden-app';
    const backendProxy = import.meta.env.VITE_BACKEND_PROXY || '/hidden-api';

    console.log('🔄 Loading iframe from:', proxyEndpoint);
    iframe.src = proxyEndpoint;

    const handleLoad = () => {
      console.log('✅ Iframe loaded successfully');
      setLoading(false);
      setError(null);

      setTimeout(() => {
        try {
          if (iframe.contentWindow) {
            console.log('📤 Sending PROXY_CONFIG to iframe');
            iframe.contentWindow.postMessage({
              type: 'PROXY_CONFIG',
              backendProxy: backendProxy,
              isProxied: true
            }, '*');
            console.log('✅ PROXY_CONFIG sent');
          }
        } catch (err) {
          console.error('❌ Failed to configure iframe:', err);
        }
      }, 500);
    };

    const handleError = (e: Event) => {
      console.error('❌ Iframe error:', e);
      setLoading(false);
      setError('Failed to load secure application.');
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);

    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('⏱️ Iframe load timeout');
        setLoading(false);
        setError('Connection timeout.');
      }
    }, 15000);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
      clearTimeout(timeout);
    };
  }, [retryCount]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setRetryCount(prev => prev + 1);
  };

  return (
    <div className="relative w-full h-full bg-gray-100">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">Loading secure application...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-4 z-10 bg-white">
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={handleRetry} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      )}

<iframe
  ref={iframeRef}
  title={title}
  className="w-full h-full border-0"
  // sandbox removed for testing
  allow="clipboard-read; clipboard-write"
  style={{ display: loading || error ? 'none' : 'block' }}
/>
    </div>
  );
};