interface MapboxGeocodingResponse {
  features?: Array<{ center: [number, number] }>;
}

export class GeocodingService {
  private static readonly MAPBOX_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

  /**
   * Obtém latitude e longitude baseada no bairro e cidade via MapBox.
   */
  public static async getCoordinates(neighborhood: string, city: string): Promise<{ latitude: number; longitude: number } | null> {
    try {
      const query = encodeURIComponent(`${neighborhood}, ${city}, Brazil`);
      const token = process.env.MAPBOX_ACCESS_TOKEN;
      
      if (!token) {
        console.error('[Geocoding] MAPBOX_ACCESS_TOKEN não configurado no .env');
        return null;
      }

      const response = await fetch(`${this.MAPBOX_URL}/${query}.json?access_token=${token}&limit=1`, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`[Geocoding] HTTP Error ${response.status}`);
        return null;
      }

      const data = await response.json() as MapboxGeocodingResponse;

      if (data && data.features && data.features.length > 0) {
        // Mapbox retorna longitude primeiro (center: [lon, lat])
        const [longitude, latitude] = data.features[0].center;
        return { latitude, longitude };
      }

      console.warn(`[Geocoding] Nenhuma coordenada encontrada para: ${neighborhood}, ${city}`);
      return null;
    } catch (error) {
      console.error(`[Geocoding] Falha ao buscar coordenadas:`, error);
      return null;
    }
  }

  /**
   * Calcula a distância entre duas coordenadas usando a fórmula de Haversine (em KM)
   */
  public static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Raio da Terra em KM
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
      
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
