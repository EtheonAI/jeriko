// Darwin — Location via IP geolocation (no native macOS CoreLocation from CLI)

import type { LocationProvider, LocationInfo } from "../interface.js";

export class DarwinLocation implements LocationProvider {
  /**
   * Get approximate location via IP geolocation.
   * Uses the free ip-api.com service (no API key needed, 45 req/min limit).
   * For precise GPS location, macOS CoreLocation requires a native helper.
   */
  async current(): Promise<LocationInfo> {
    const response = await fetch("http://ip-api.com/json/?fields=lat,lon,city,regionName,country,timezone,query");

    if (!response.ok) {
      throw new Error(`Location lookup failed: HTTP ${response.status}`);
    }

    const data = await response.json() as {
      lat?: number;
      lon?: number;
      city?: string;
      regionName?: string;
      country?: string;
      timezone?: string;
      query?: string;
    };

    return {
      latitude: data.lat ?? 0,
      longitude: data.lon ?? 0,
      city: data.city,
      region: data.regionName,
      country: data.country,
      timezone: data.timezone,
      ip: data.query,
    };
  }
}
