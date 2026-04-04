import { CapacitorConfig } from '@capacitor/cli';

// Set CAPACITOR_USE_PRODUCTION=true when building the production APK
// Leave unset for local dev (uses local IP)
const useProduction = process.env.CAPACITOR_USE_PRODUCTION === 'true';

const config: CapacitorConfig = {
  appId: 'com.jewellery.karatcalc',
  appName: 'KaratCalc',
  webDir: 'dist',
  server: useProduction
    ? {
        // Production APK: load from Netlify directly
        // This means the APK always has the latest version without rebuilding
        url: 'https://karatcalc.netlify.app',
        cleartext: false,
      }
    : {
        // Local dev APK: use local machine IP
        androidScheme: 'http',
      },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: '#d4af37',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    CapacitorHttp: {
      enabled: true,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#d4af37'
    }
  }
};

export default config;