import * as Location from 'expo-location';

export interface LocationResult {
  status: 'success' | 'permission_denied' | 'services_disabled' | 'unavailable';
  coords?: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  };
  satelliteTimestamp?: string;
  errorMessage?: string;
}

/**
 * Checks if location hardware is enabled on the device.
 */
export async function isLocationHardwareEnabled(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return false;
  }
}

/**
 * Requests location permission if not already granted.
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === Location.PermissionStatus.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Safely fetches the current device coordinates with a 5-second timeout.
 * If fresh satellite fix times out, falls back to the last known position.
 */
export async function getCurrentCoordinates(): Promise<LocationResult> {
  try {
    // 1. Check if device location services are turned on
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      return {
        status: 'services_disabled',
        errorMessage: 'Device location is turned off. Please enable GPS in your device settings.',
      };
    }

    // 2. Check and request foreground permissions
    const { status: permStatus } = await Location.getForegroundPermissionsAsync();
    let granted = permStatus === Location.PermissionStatus.GRANTED;

    if (!granted) {
      const requestRes = await Location.requestForegroundPermissionsAsync();
      granted = requestRes.status === Location.PermissionStatus.GRANTED;
    }

    if (!granted) {
      return {
        status: 'permission_denied',
        errorMessage: 'Location permission was denied. Please allow location access to clock in.',
      };
    }

    // 3. Multi-tier GPS acquisition:
    // Tier 1: Try High Accuracy (Satellite GPS) with an 8-second timeout
    let position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);

    // Tier 2: If satellite lock timed out (indoors, cloud cover, emulator), try Balanced (Wi-Fi/Cellular/Network)
    if (!position) {
      position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
    }

    if (position) {
      return {
        status: 'success',
        coords: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        },
        satelliteTimestamp: new Date(position.timestamp).toISOString(),
      };
    }

    // Tier 3: Fallback to last known position
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown) {
      return {
        status: 'success',
        coords: {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          accuracy: lastKnown.coords.accuracy,
        },
        satelliteTimestamp: new Date(lastKnown.timestamp).toISOString(),
      };
    }

    return {
      status: 'unavailable',
      errorMessage: 'Could not acquire GPS satellite fix. Please move near a window, step outside, or proceed with location note.',
    };
  } catch (err) {
    return {
      status: 'unavailable',
      errorMessage: err instanceof Error ? err.message : 'Unknown location error',
    };
  }
}
