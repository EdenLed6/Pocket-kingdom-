import type { CapacitorConfig } from '@capacitor/cli';

// Phase 7: Capacitor wraps the Vite dist/ bundle in an Android WebView.
// Build & install workflow lives in npm scripts (`android:sync`, `:open`,
// `:run`). The native android/ directory is committed; its build outputs
// (.gradle, build/, *.apk) are gitignored.
const config: CapacitorConfig = {
  appId: 'com.eden.pocketkingdom',
  appName: 'Pocket Kingdom',
  webDir: 'dist',
  // Matches GameScene's grass background so the WebView paints green
  // before the canvas mounts — no white flash on launch.
  backgroundColor: '#7AC74F',
  android: {
    allowMixedContent: false,
    // Hide the built-in WebView scrollbar; we never scroll the page.
    webContentsDebuggingEnabled: true,
  },
};

export default config;
