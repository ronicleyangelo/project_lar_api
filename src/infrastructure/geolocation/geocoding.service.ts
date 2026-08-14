interface MapboxGeocodingResponse {
  features?: Array<{ center: [number, number] }>;
}

type Coordinates = { latitude: number; longitude: number };

export class GeocodingService {
  private static readonly MAPBOX_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
  private static readonly REQUEST_TIMEOUT_MS = 2500;
  private static readonly cache = new Map<string, Coordinates | null>();

  public static async getCoordinates(neighborhood: string, city: string): Promise<Coordinates | null> {
    const cacheKey = `${neighborhood.trim().toLowerCase()}|${city.trim().toLowerCase()}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? null;
    }

    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) {
      this.cache.set(cacheKey, null);
      return null;
    }

    try {
      const query = encodeURIComponent(`${neighborhood}, ${city}, Brazil`);
      const response = await fetch(`${this.MAPBOX_URL}/${query}.json?access_token=${token}&limit=1`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.error(`[Geocoding] HTTP ${response.status}`);
        this.cache.set(cacheKey, null);
        return null;
      }

      const data = await response.json() as MapboxGeocodingResponse;
      const center = data.features?.[0]?.center;
      if (!center) {
        this.cache.set(cacheKey, null);
        return null;
      }

      const [longitude, latitude] = center;
      const coordinates = { latitude, longitude };
      this.cache.set(cacheKey, coordinates);
      return coordinates;
    } catch (error) {
      console.error('[Geocoding] Falha ou timeout ao buscar coordenadas:', error);
      this.cache.set(cacheKey, null);
      return null;
    }
  }

  public static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const earthRadiusKm = 6371;
    const latitudeDelta = this.deg2rad(lat2 - lat1);
    const longitudeDelta = this.deg2rad(lon2 - lon1);
    const value =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * Math.sin(longitudeDelta / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  private static deg2rad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
