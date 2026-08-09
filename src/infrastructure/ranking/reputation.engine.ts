export interface ReviewRatings {
  qualityRating: number;
  punctualityRating: number;
  communicationRating: number;
  careRating: number;
  costBenefitRating: number;
}

export class ReputationEngine {
  private static readonly PRIOR_RATING = 4.5;
  private static readonly PRIOR_WEIGHT = 5; // Weight of 5 prior reviews to smooth initial scores

  /**
   * Calculates average score across the 5 mandatory criteria from PDF Page 6.
   */
  public static calculateReviewAverage(ratings: ReviewRatings): number {
    const sum =
      ratings.qualityRating +
      ratings.punctualityRating +
      ratings.communicationRating +
      ratings.careRating +
      ratings.costBenefitRating;
    return Math.round((sum / 5.0) * 100) / 100;
  }

  /**
   * Calculates Bayesian adjusted trust score for a provider.
   * Prevents a single 5.0 rating from outranking a provider with 30 reviews averaging 4.8.
   */
  public static calculateAdjustedTrustScore(
    currentReviewCount: number,
    allReviewAverages: number[]
  ): number {
    if (allReviewAverages.length === 0) {
      return 0.0;
    }

    const actualSum = allReviewAverages.reduce((acc, score) => acc + score, 0);
    const bayesianScore =
      (this.PRIOR_WEIGHT * this.PRIOR_RATING + actualSum) /
      (this.PRIOR_WEIGHT + currentReviewCount);

    return Math.round(bayesianScore * 100) / 100;
  }
}
