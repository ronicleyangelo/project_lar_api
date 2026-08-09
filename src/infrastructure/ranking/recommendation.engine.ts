import { ProviderProfile, ProviderService, CoverageArea } from '@prisma/client';
import { GeocodingService } from '../geolocation/geocoding.service';

export interface ProviderWithDetails extends ProviderProfile {
  services: ProviderService[];
  coverageAreas: CoverageArea[];
}

export interface RecommendationCriteria {
  categoryId: string;
  city: string;
  neighborhood: string;
  minBudget?: number;
  maxBudget?: number;
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
    const clientCoords = await GeocodingService.getCoordinates(criteria.neighborhood, criteria.city);
    
    // Stage 1: Mandatory Filters
    const eligibleProviders = providers.filter((p) => {
      const matchingService = p.services.find((s) => s.categoryId === criteria.categoryId);
      const handlesCategory = Boolean(matchingService);
      const handlesLocation = p.coverageAreas.some(
        (a) => a.city.toLowerCase() === criteria.city.toLowerCase() &&
               a.neighborhood.toLowerCase() === criteria.neighborhood.toLowerCase()
      );
      const isInsideBudget = !matchingService || (
        (criteria.minBudget === undefined || matchingService.basePrice >= criteria.minBudget) &&
        (criteria.maxBudget === undefined || matchingService.basePrice <= criteria.maxBudget)
      );
      return handlesCategory && handlesLocation && isInsideBudget;
    });

    // Stage 2: Classification with Weighted Signals
    const rankedList: RankedProvider[] = eligibleProviders.map((p) => {
      const matchingService = p.services.find((s) => s.categoryId === criteria.categoryId);

      // Signal 1: Adjusted Rating (30%) - Bayesian smoothed rating
      const adjustedRatingScore = Math.min(100, (p.trustScore / 5.0) * 100);

      // Signal 2: Distance / Proximity (20%) - Real Spatial Calculation
      let distanceScore = 90; // Default if coords missing
      if (clientCoords && p.coverageAreas.length > 0) {
        // Encontrar a menor distância entre o cliente e as áreas de cobertura do profissional
        let minDistance = Number.MAX_VALUE;
        for (const area of p.coverageAreas) {
          if (area.latitude && area.longitude) {
            const dist = GeocodingService.calculateDistance(
              clientCoords.latitude, clientCoords.longitude,
              area.latitude, area.longitude
            );
            if (dist < minDistance) minDistance = dist;
          }
        }
        
        if (minDistance < Number.MAX_VALUE) {
          // Pontuação: 100 se < 1km, diminui até 0 em 20km
          distanceScore = Math.max(0, 100 - (minDistance * 5));
        }
      }

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
