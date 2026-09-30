import { loadScriptOnce } from './utils-dom';
import { config } from './config';

/**
 * Singleton loader for the Google Maps JS API so multiple MapView instances
 * share one <script> tag and one `loading` promise.
 */
let loaderPromise: Promise<void> | null = null;

class GoogleMapsLoaderImpl {
  load(): Promise<void> {
    if (typeof window === 'undefined') return Promise.reject(new Error('server-side'));
    if ((window as any).google?.maps) return Promise.resolve();
    if (!loaderPromise) {
      if (!config.googleMapsKey) return Promise.reject(new Error('missing api key'));
      loaderPromise = loadScriptOnce(
        `https://maps.googleapis.com/maps/api/js?key=${config.googleMapsKey}&libraries=geometry,drawing`,
        'qb-gmaps',
      ).then(() => undefined);
    }
    return loaderPromise;
  }
}

export const GoogleMapsLoader = new GoogleMapsLoaderImpl();
