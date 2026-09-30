/**
 * Geo helpers: Haversine distance, geofence checks, nearest-driver search.
 * All coordinates are decimal degrees.
 */

const R_EARTH_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Distance in km between two {lat,lng} points. */
function haversineKm(a, b) {
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(Number(a.lat))) * Math.cos(toRad(Number(b.lat))) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(s));
}

/** Point-in-circle geofence test (km). */
function isWithinRadius(point, center, radiusKm) {
  return haversineKm(point, center) <= Number(radiusKm);
}

/**
 * Ray-casting polygon containment. polygon = [[lat,lng], ...]
 * Used for admin-drawn surge zones / delivery zones.
 */
function isInsidePolygon(point, polygon) {
  let inside = false;
  const [y, x] = [Number(point.lat), Number(point.lng)]; // lat=y, lng=x
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Rough ETA (minutes) for a route: city avg 26 km/h + 2 min/KM traffic slack. */
function estimateDriveMinutes(distanceKm) {
  return Math.max(5, Math.round((distanceKm / 26) * 60 + distanceKm * 2));
}

module.exports = {
  haversineKm, isWithinRadius, isInsidePolygon, estimateDriveMinutes, R_EARTH_KM,
};
