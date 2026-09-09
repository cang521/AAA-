/// <reference types="@capawesome/capacitor-nodejs" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aistudio.aiphone',
  appName: 'AI Phone Simulator',

  webDir: 'dist',

  server: {
    androidScheme: 'https',
    cleartext: true,
  },

  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#18181b',
      showSpinner: false,
    },

    Nodejs: {
      nodeDir: 'nodejs',
      startMode: 'auto',
    },
  },
};

export default config;
