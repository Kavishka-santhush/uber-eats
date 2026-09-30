import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { config } from '@/lib/config';
import { decodePolyline, regionOf } from '@/lib/geo';
import { palette, radius, useTheme } from '@/lib/theme';

export type MarkerKind = 'driver' | 'pickup' | 'dropoff' | 'free';

export interface TrackMarker {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  kind?: MarkerKind;
  /** Compass heading in degrees — only used by driver pins. */
  heading?: number;
}

const KIND_COLOR: Record<MarkerKind, string> = {
  driver: palette.brand,
  pickup: palette.info,
  dropoff: palette.warning,
  free: palette.muted,
};

const KIND_ICON: Record<MarkerKind, keyof typeof Ionicons.glyphMap> = {
  driver: 'bicycle',
  pickup: 'storefront',
  dropoff: 'home',
  free: 'location',
};

interface Props {
  markers: TrackMarker[];
  /** Google encoded polyline for the active delivery route. */
  polyline?: string | null;
  height?: number;
  /** Animate the camera onto this marker id every time its position changes. */
  followId?: string;
  loading?: boolean;
  onPress?: () => void;
  style?: object;
}

/**
 * Google Maps view for order tracking and the driver run screen.
 *
 * The map needs a native API key (wired from env in mobile/app.config.js); when
 * none is configured we render an informative panel instead of a blank tile, so
 * the rest of the screen (timeline, chat, CTAs) stays usable.
 */
export function MapTracker({ markers, polyline, height = 260, followId, loading, onPress, style }: Props) {
  const theme = useTheme();
  const mapRef = useRef<MapView | null>(null);

  const valid = useMemo(
    () => markers.filter((m) => isFinite(m.lat) && isFinite(m.lng) && (m.lat !== 0 || m.lng !== 0)),
    [markers],
  );
  const region = useMemo(() => regionOf(valid.map((m) => ({ lat: m.lat, lng: m.lng }))), [valid]);
  const path = useMemo(() => decodePolyline(polyline), [polyline]);
  const followed = followId ? valid.find((m) => m.id === followId) : undefined;

  // Pan to the followed pin whenever a new GPS fix arrives.
  useEffect(() => {
    if (!followed || !mapRef.current) return;
    mapRef.current.animateToRegion(
      { latitude: followed.lat, longitude: followed.lng, latitudeDelta: 0.012, longitudeDelta: 0.012 },
      600,
    );
  }, [followed?.lat, followed?.lng]);

  if (!config.googleMapsKey) {
    return (
      <View style={[styles.off, { height, backgroundColor: theme.inputBg, borderColor: theme.border }, style]}>
        <Ionicons name="map-outline" size={26} color={theme.subtext} />
        <Text style={[styles.offTitle, { color: theme.text }]}>Live map unavailable</Text>
        <Text style={[styles.offBody, { color: theme.subtext }]}>
          Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY and rebuild to see the driver on the map. Status updates still arrive in
          real time.
        </Text>
      </View>
    );
  }

  return (
    <View style={[{ height, borderRadius: radius.card, overflow: 'hidden' }, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={
          region ?? {
            latitude: valid[0]?.lat ?? 40.7128,
            longitude: valid[0]?.lng ?? -74.006,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }
        }
        onPress={onPress}
        showsUserLocation={false}
        showsMyLocationButton={false}
      >
        {path.length > 1 && <Polyline coordinates={path} strokeWidth={4} strokeColor={palette.brand} />}
        {valid.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.title}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View
              style={[
                styles.pin,
                {
                  backgroundColor: KIND_COLOR[m.kind ?? 'free'],
                  transform: [{ rotate: `${m.kind === 'driver' ? m.heading ?? 0 : 0}deg` }],
                },
              ]}
            >
              <Ionicons name={KIND_ICON[m.kind ?? 'free']} size={14} color="#fff" />
            </View>
          </Marker>
        ))}
      </MapView>

      {!!region && (
        <Pressable
          onPress={() => mapRef.current?.animateToRegion(region, 500)}
          style={[styles.fit, { backgroundColor: theme.card, borderColor: theme.border }]}
          accessibilityRole="button"
          accessibilityLabel="Fit route on map"
        >
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>Fit</Text>
        </Pressable>
      )}

      {!!loading && (
        <View style={styles.busy}>
          <ActivityIndicator color={palette.brand} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  off: { borderRadius: radius.card, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  offTitle: { fontWeight: '800', marginTop: 8, fontSize: 14 },
  offBody: { fontSize: 12, textAlign: 'center', marginTop: 4, lineHeight: 17 },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  busy: { position: 'absolute', top: 8, right: 8, backgroundColor: '#FFFFFFDD', borderRadius: 20, padding: 6 },
  fit: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
