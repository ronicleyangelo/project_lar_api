export interface SafeServiceRequest {
  id: string;
  clientId: string;
  categoryId: string;
  city: string;
  neighborhood: string;
  approxDistanceKm: number;
  scheduledDate: Date;
  timeSlot: string;
  budgetLimit?: number | null;
  description: string;
  status: string;
  clientAddressMasked: boolean;
  fullAddress?: string;
}

export class PrivacyService {
  /**
   * Masks sensitive client details (full address) unless the provider has an ACCEPTED quote.
   */
  public static maskClientAddress<T extends { client?: { fullAddress?: string } }>(
    request: T,
    isAcceptedByProvider: boolean
  ): T {
    if (!request || !request.client) return request;

    if (!isAcceptedByProvider) {
      const cloned = JSON.parse(JSON.stringify(request));
      if (cloned.client) {
        cloned.client.fullAddress = '[ENDEREÇO OCULTO ATÉ O ACEITE DO ORÇAMENTO]';
      }
      return cloned;
    }

    return request;
  }
}
