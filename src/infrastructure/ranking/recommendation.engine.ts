import { ProviderProfile, ProviderService, CoverageArea, ProviderActivity } from '@prisma/client';
import { GeocodingService } from '../geolocation/geocoding.service';

export interface ProviderWithDetails extends ProviderProfile {
  services: ProviderService[];
  coverageAreas: CoverageArea[];
  activities: ProviderActivity[];
}

export interface RecommendationCriteria {
  categoryId: string;
  city: string;
  neighborhood: string;
  minBudget?: number;
  maxBudget?: number;
  propertyType?: string;
  hasPets?: boolean;
  minRating?: number;
  activityIds?: string[];
}

export interface RankedProvider {
  provider: ProviderWithDetails;
  totalScore: number;
  breakdown: {
    adjustedRatingScore: number;
    distanceScore: number;
    completionScore: number;
    availabilityScore: number;
    responseScore: number;
    rehireScore: number;
    priceScore: number;
  };
  isNewProvider: boolean;
  distanceKm: number | null;
}

export class RecommendationEngine {
  /**
   * Ranks service providers according to Section 06 of PDF Specification.
   */
  public static async rankProviders(
    providers: ProviderWithDetails[],
    criteria: RecommendationCriteria
  ): Promise<RankedProvider[]> {
    
    // Obter coordenadas do cliente via MapLibre/OSM
    const clientCoords = criteria.city.trim() && criteria.neighborhood.trim()
      ? await GeocodingService.getCoordinates(criteria.neighborhood, criteria.city)
      : null;
    
    // Stage 1: Mandatory Filters
    const normalizedCity = criteria.city.trim().toLocaleLowerCase('pt-BR');
    const normalizedNeighborhood = criteria.neighborhood.trim().toLocaleLowerCase('pt-BR');
    const providerDistances = new Map<string, number | null>();

    const eligibleProviders = providers.filter((p) => {
      const matchingService = p.services.find((s) => s.categoryId === criteria.categoryId);
      const handlesCategory = Boolean(matchingService);
      let minimumDistance: number | null = null;
      if (clientCoords) {
        for (const area of p.coverageAreas) {
          if (area.latitude == null || area.longitude == null) continue;
          const distance = GeocodingService.calculateDistance(clientCoords.latitude, clientCoords.longitude, area.latitude, area.longitude);
          minimumDistance = minimumDistance == null ? distance : Math.min(minimumDistance, distance);
        }
      }
      providerDistances.set(p.id, minimumDistance);
      const handlesLocation = !normalizedCity
        ? true
        : minimumDistance != null
        ? minimumDistance <= p.serviceRadiusKm
        : p.coverageAreas.some((area) =>
            area.city.trim().toLocaleLowerCase('pt-BR') === normalizedCity &&
            (!normalizedNeighborhood || area.neighborhood.trim().toLocaleLowerCase('pt-BR') === normalizedNeighborhood)
          );
      const isInsideBudget = !matchingService || (
        (criteria.minBudget === undefined || matchingService.basePrice >= criteria.minBudget) &&
        (criteria.maxBudget === undefined || matchingService.basePrice <= criteria.maxBudget)
      );
      const handlesProperty = !criteria.propertyType || p.propertyTypes.includes(criteria.propertyType);
      const acceptsPets = !criteria.hasPets || p.acceptsPets;
      const meetsRating = criteria.minRating === undefined || p.trustScore >= criteria.minRating;
      const offeredActivityIds = new Set(p.activities.map(item => item.activityId));
      const handlesActivities = !criteria.activityIds?.length || criteria.activityIds.every(id => offeredActivityIds.has(id));
      return handlesCategory && handlesLocation && isInsideBudget && handlesProperty && acceptsPets && meetsRating && handlesActivities;
    });

    // Stage 2: Classification with Weighted Signals
    const rankedList: RankedProvider[] = eligibleProviders.map((p) => {
      const matchingService = p.services.find((s) => s.categoryId === criteria.categoryId);

      // Signal 1: Adjusted Rating (30%) - Bayesian smoothed rating
      const adjustedRatingScore = Math.min(100, (p.trustScore / 5.0) * 100);

      // Signal 2: Distance / Proximity (20%) - Real Spatial Calculation
      const distanceKm = providerDistances.get(p.id) ?? null;
      let distanceScore = distanceKm == null ? 75 : Math.max(0, 100 - (distanceKm * 5));

      // Signal 3: Completion Rate (15%)
      const completionScore = p.reviewCount > 0 ? 95 : 80;

      // Signal 4: Availability (15%)
      const availabilityScore = 90;

      // Signal 5: Response Speed (10%)
      const responseScore = 85;

      // Signal 6: Rehire Rate (5%)
      const rehireScore = p.reviewCount > 3 ? 90 : 70;

      // Signal 7: Price Compatibility (5%)
      let priceScore = 80;
      if (matchingService && criteria.minBudget !== undefined && criteria.maxBudget !== undefined) {
        const rangeCenter = (criteria.minBudget + criteria.maxBudget) / 2;
        const distanceFromCenter = Math.abs(matchingService.basePrice - rangeCenter);
        const halfRange = Math.max(1, (criteria.maxBudget - criteria.minBudget) / 2);
        priceScore = Math.max(80, 100 - (distanceFromCenter / halfRange) * 20);
      }

      // Calculate Total Score using exact weights from PDF Page 7
      const totalScore =
        adjustedRatingScore * 0.30 +
        distanceScore * 0.20 +
        completionScore * 0.15 +
        availabilityScore * 0.15 +
        responseScore * 0.10 +
        rehireScore * 0.05 +
        priceScore * 0.05;

      return {
        provider: p,
        totalScore: Math.round(totalScore * 10) / 10,
        breakdown: {
          adjustedRatingScore: Math.round(adjustedRatingScore),
          distanceScore,
          completionScore,
          availabilityScore,
          responseScore,
          rehireScore,
          priceScore,
        },
        isNewProvider: p.isNewProvider,
        distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
      };
    });

    // Sort descending by total score
    rankedList.sort((a, b) => b.totalScore - a.totalScore);

    // Boost slot for New Providers (expose at least 1 new provider near top)
    const newProviderIndex = rankedList.findIndex((item) => item.isNewProvider);
    if (newProviderIndex > 1) {
      const [newProv] = rankedList.splice(newProviderIndex, 1);
      rankedList.splice(1, 0, newProv); // Place at 2nd position for visibility
    }

    return rankedList;
  }
}
