import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.eden.pocketkingdom',
  appName: 'Pocket Kingdom',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;
