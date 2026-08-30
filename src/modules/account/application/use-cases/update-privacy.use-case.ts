import { AccountRepository } from '../../domain/account.repository';
import { PrivacyPreferences } from '../../domain/account';

export class UpdatePrivacyUseCase {
  constructor(private readonly accounts: AccountRepository) {}
  async execute(userId: string, preferences: PrivacyPreferences) {
    await this.accounts.updatePrivacy(userId, preferences);
    return preferences;
  }
}
