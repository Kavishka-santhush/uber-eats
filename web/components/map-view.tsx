'use client';

import { useEffect, useRef, useState } from 'react';
import { config } from '@/lib/config';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  color?: string;
  kind?: 'driver' | 'pickup' | 'dropoff';
}

interface Props {
  center: { lat: number; lng: number };
  markers?: MapMarker[];
  polyline?: string; // encoded google geometry polyline
  zoom?: number;
  className?: string;
  /** Called when the map is clicked; receives the picked lat/lng. */
  onClick?: (pos: { lat: number; lng: number }) => void;
}

/**
 * Minimal Google Maps wrapper that loads the JS API lazily (no SSR) and keeps
 * markers in sync. Used by live tracking (web) and admin geofence editors.
 * Renders a muted placeholder when no API key is configured.
 */
export function MapView({ center, markers = [], polyline, zoom = 14, className, onClick }: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polyRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!config.googleMapsKey) return;
    let cancelled = false;
    (async () => {
      try {
        const { GoogleMapsLoader } = await import('@/lib/gmaps-loader');
        await GoogleMapsLoader.load();
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !divRef.current || mapRef.current) return;
    const google = (window as any).google;
    mapRef.current = new google.maps.Map(divRef.current, {
      center,
      zoom,
      disableDefaultUI: true,
      clickableIcons: false,
    });
    if (onClick) {
      mapRef.current.addListener('click', (e: any) => {
        if (e.latLng) onClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // keep viewport following the primary marker (driver)
  useEffect(() => {
    const map = mapRef.current;
    const google = (window as any).google;
    if (!ready || !map || !google) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = markers.map((mk) => {
      const color = mk.color || (mk.kind === 'driver' ? '#06c167' : mk.kind === 'pickup' ? '#f59e0b' : '#2563eb');
      const instance = new google.maps.Marker({
        position: { lat: Number(mk.lat), lng: Number(mk.lng) },
        map,
        title: mk.label,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: mk.kind === 'driver' ? 10 : 7,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      if (mk.label) {
        const tip = new google.maps.InfoWindow({ content: mk.label });
        instance.addListener('click', () => tip.open(map, instance));
      }
      return instance;
    });

    if (polyline && polyline.length > 0) {
      polyRef.current?.setMap(null);
      polyRef.current = new google.maps.Polyline({
        map,
        path: google.maps.geometry.encoding.decodePath(polyline),
        strokeColor: '#06c167',
        strokeWeight: 4,
        strokeOpacity: 0.8,
      });
    }

    if (markers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach((mk) => bounds.extend({ lat: Number(mk.lat), lng: Number(mk.lng) }));
      const driver = markers.find((m) => m.kind === 'driver');
      if (driver) {
        map.panTo({ lat: Number(driver.lat), lng: Number(driver.lng) });
      } else {
        map.fitBounds(bounds);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, markers, polyline]);

  if (!config.googleMapsKey || loadError) {
    return (
      <div className={className ?? 'h-72 w-full rounded-xl border bg-muted'}>
        <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
          <span className="font-medium">Map unavailable</span>
          <span className="text-xs">
            {loadError ? 'Failed to load Google Maps' : 'Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable maps'}
          </span>
          <span className="text-xs">
            ({Number(center.lat).toFixed(4)}, {Number(center.lng).toFixed(4)})
          </span>
        </div>
      </div>
    );
  }

  return <div ref={divRef} className={className ?? 'h-72 w-full rounded-xl border'} />;
}
