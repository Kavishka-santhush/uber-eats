const axios = require('axios');
const env = require('../config/env');

/**
 * Google Maps server-side APIs:
 *  - Directions (polyline route for driver navigation)
 *  - Distance Matrix (ETA + distance for delivery estimation)
 *  - Places Autocomplete proxy (keeps API key server-side)
 *  - Geocoding (address -> coords)
 */

const BASE = 'https://maps.googleapis.com/maps/api';

const client = axios.create({ timeout: 8000 });

async function directions(origin, destination, mode = 'driving') {
  const { data } = await client.get(`${BASE}/directions/json`, {
    params: {
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      mode, key: env.GOOGLE_MAPS_API_KEY,
    },
  });
  if (data.status !== 'OK') {
    return { status: data.status, polyline: null, distanceKm: null, durationMin: null };
  }
  const leg = data.routes[0].legs[0];
  return {
    status: 'OK',
    polyline: data.routes[0].overview_polyline.points,
    distanceKm: leg.distance.value / 1000,
    durationMin: Math.round(leg.duration.value / 60),
  };
}

async function distanceMatrix(origins, destinations, mode = 'driving') {
  const { data } = await client.get(`${BASE}/distancematrix/json`, {
    params: {
      origins: origins.map((o) => `${o.lat},${o.lng}`).join('|'),
      destinations: destinations.map((d) => `${d.lat},${d.lng}`).join('|'),
      mode, key: env.GOOGLE_MAPS_API_KEY,
    },
  });
  return data.rows.map((row) => row.elements.map((el) => (
    el.status === 'OK'
      ? { distanceKm: el.distance.value / 1000, durationMin: Math.round(el.duration.value / 60) }
      : { distanceKm: null, durationMin: null, status: el.status }
  )));
}

async function geocode(address) {
  const { data } = await client.get(`${BASE}/geocode/json`, {
    params: { address, key: env.GOOGLE_MAPS_API_KEY },
  });
  if (data.status !== 'OK' || !data.results.length) return null;
  const r = data.results[0];
  return {
    lat: r.geometry.location.lat, lng: r.geometry.location.lng,
    formattedAddress: r.formatted_address,
    placeId: r.place_id,
    components: r.address_components,
  };
}

async function autocomplete(input, { lat, lng } = {}) {
  const params = { input, key: env.GOOGLE_MAPS_API_KEY };
  if (lat != null && lng != null) {
    params.location = `${lat},${lng}`;
    params.radius = 5000;
  }
  const { data } = await client.get(`${BASE}/places/autocomplete/json`, { params });
  return data.predictions || [];
}

async function placeDetails(placeId, sessionToken) {
  const { data } = await client.get(`${BASE}/places/details/json`, {
    params: {
      place_id: placeId,
      fields: 'geometry,formatted_address,name,address_components',
      key: env.GOOGLE_MAPS_API_KEY,
      ...(sessionToken ? { sessiontoken: sessionToken } : {}),
    },
  });
  return data.status === 'OK' ? data.result : null;
}

module.exports = { directions, distanceMatrix, geocode, autocomplete, placeDetails };
