import { GeocodingService } from '../infrastructure/geolocation/geocoding.service';

type Coordinate = number | string | null | undefined;
type CoverageArea = {
  city: string;
  neighborhood: string;
  latitude?: Coordinate;
  longitude?: Coordinate;
  approximateLat?: Coordinate;
  approximateLng?: Coordinate;
};
type LocatedRequest = CoverageArea;

const numericCoordinate = (approximate: Coordinate, exact: Coordinate): number | null => {
  const value = approximate ?? exact;
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalize = (value: string): string => value.trim().toLocaleLowerCase('pt-BR');

/** Política única usada tanto para exibir uma oportunidade quanto para cotá-la. */
export function providerCoversRequest(
  serviceRadiusKm: number,
  coverageAreas: CoverageArea[],
  request: LocatedRequest,
): boolean {
  const requestLat = numericCoordinate(request.approximateLat, request.latitude);
  const requestLng = numericCoordinate(request.approximateLng, request.longitude);

  if (requestLat !== null && requestLng !== null) {
    const coveredByDistance = coverageAreas.some(area => {
      const areaLat = numericCoordinate(area.approximateLat, area.latitude);
      const areaLng = numericCoordinate(area.approximateLng, area.longitude);
      return areaLat !== null && areaLng !== null &&
        GeocodingService.calculateDistance(requestLat, requestLng, areaLat, areaLng) <= serviceRadiusKm;
    });
    if (coveredByDistance) return true;
  }

  // Compatibilidade com cadastros antigos ou ambientes sem geocodificação.
  return coverageAreas.some(area =>
    normalize(area.city) === normalize(request.city) &&
    normalize(area.neighborhood) === normalize(request.neighborhood),
  );
}
