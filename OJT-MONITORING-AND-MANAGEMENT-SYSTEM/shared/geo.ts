/**
 * Geolocation & Geofencing utility functions using standard Haversine formula.
 * Zero external dependencies, pure mathematical calculation.
 */

const EARTH_RADIUS_METERS = 6371000; // Earth mean radius in meters

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Computes great-circle distance between two GPS coordinates in meters.
 */
export function calculateDistanceInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Checks if a user is within the designated geofence radius of a target location.
 */
export function isWithinGeofence(
  userLat: number,
  userLng: number,
  targetLat: number,
  targetLng: number,
  radiusMeters = 150
): { isWithin: boolean; distanceMeters: number } {
  const distanceMeters = calculateDistanceInMeters(userLat, userLng, targetLat, targetLng);
  return {
    isWithin: distanceMeters <= radiusMeters,
    distanceMeters,
  };
}
