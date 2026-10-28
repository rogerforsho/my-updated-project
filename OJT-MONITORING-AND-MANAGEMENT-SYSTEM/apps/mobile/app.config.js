// Cleartext HTTP (LAN web portal) is allowed only in preview builds; production stays HTTPS-only.
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ...(process.env.EXPO_PUBLIC_APP_ENV === 'preview'
      ? [['expo-build-properties', { android: { usesCleartextTraffic: true } }]]
      : []),
  ],
});
