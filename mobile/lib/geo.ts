import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

/**
 * Geolocation helpers + geometry utilities shared by the customer, driver and
 * tracking screens. All calls degrade gracefully: a denied permission simply
 * yields `null` coordinates so screens fall back to their cached/default view
 * instead of crashing.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const POSITION_OPTIONS = { accuracy: Location.Accuracy.Balanced };
const WATCH_OPTIONS = { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 50 };

/** Ask for (or re-check) foreground location permission. */
export async function ensureLocationPermission(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return true;
    const requested = await Location.requestForegroundPermissionsAsync();
    return !!requested.granted;
  } catch {
    return false;
  }
}

/** One-shot current position, or null when unavailable/denied. */
export async function getCurrentCoords(): Promise<LatLng | null> {
  try {
    if (!(await ensureLocationPermission())) return null;
    const pos = await Location.getCurrentPositionAsync(POSITION_OPTIONS);
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    // last resort: the OS cache is good enough for "near you" lists
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    } catch {
      /* ignore */
    }
    return null;
  }
}

export interface LiveFix extends LatLng {
  heading?: number | null;
  speed?: number | null;
}

/**
 * Continuous position updates (driver GPS / live customer position).
 * Returns an unsubscribe function; safe to call from an effect cleanup.
 */
export async function watchCoords(onUpdate: (fix: LiveFix) => void): Promise<() => void> {
  try {
    if (!(await ensureLocationPermission())) return () => undefined;
    const sub = await Location.watchPositionAsync(WATCH_OPTIONS, (pos) =>
      onUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
      }),
    );
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

/** React hook: the user's coordinates, refreshed on demand via `refresh()`. */
export function useUserLocation(): { coords: LatLng | null; loading: boolean; denied: boolean; refresh: () => void } {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCurrentCoords().then((c) => {
      if (cancelled) return;
      setCoords(c);
      setDenied(c === null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { coords, loading, denied, refresh: () => setTick((t) => t + 1) };
}

/** Great-circle distance in kilometres (same maths as the server dispatcher). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km?: number | null): string {
  const n = typeof km === 'string' ? Number(km) : km;
  if (n == null || !isFinite(n)) return '—';
  return n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`;
}

/** Reads a Decimal scalar (string from the API) as a finite number. */
export function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? parseFloat(value) : (value as number);
  return typeof n === 'number' && isFinite(n) ? n : fallback;
}

/**
 * Google encoded-polyline decoder (the shape `delivery.routePolyline` returns).
 * Tolerates null/empty/truncated input by returning what it managed to read.
 */
export function decodePolyline(encoded?: string | null): LatLng[] {
  if (!encoded) return [];
  const out: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  try {
    while (index < encoded.length) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        if (index >= encoded.length) return out;
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lat += result & 1 ? ~(result >> 1) : result >> 1;

      shift = 0;
      result = 0;
      do {
        if (index >= encoded.length) return out;
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      lng += result & 1 ? ~(result >> 1) : result >> 1;

      out.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
  } catch {
    // partial decode is still useful for the map
  }
  return out;
}

/** Centroid of a set of points (used to centre map views). */
export function centerOf(points: LatLng[], fallback: LatLng = { lat: 40.7128, lng: -74.006 }): LatLng {
  if (!points.length) return fallback;
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

/** Region bounds so a MapView can fit several markers at once. */
export function regionOf(points: LatLng[]): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // 30% padding, with a sane floor so a single point still renders zoomed in
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.3, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * 1.3, 0.01),
  };
}
