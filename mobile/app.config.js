/**
 * Dynamic Expo config.
 *
 * `app.json` holds everything static; this file merges the native Google Maps
 * keys in from the local environment so no key material is ever committed.
 * Expo loads `.env` before evaluating this file, and `app.config.js` values
 * take precedence over `app.json` when both are present.
 */
const base = require('./app.json');

const iosMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const androidMapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY || iosMapsKey;

const expo = { ...base.expo };

if (iosMapsKey) {
  expo.ios = {
    ...expo.ios,
    config: { ...expo.ios.config, googleMapsApiKey: iosMapsKey },
  };
}

if (androidMapsKey) {
  expo.android = {
    ...expo.android,
    config: { ...expo.android.config, googleMaps: { apiKey: androidMapsKey } },
  };
}

// Push goes through Expo's push service (server/src/services/push.js), so no
// native FCM/APNs credential files are required here.

module.exports = () => ({ expo });
