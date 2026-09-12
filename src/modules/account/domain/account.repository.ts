import { AccountRecord, PrivacyPreferences } from './account';

export interface AccountRepository {
  findById(id: string): Promise<AccountRecord | null>;
  updatePrivacy(id: string, preferences: PrivacyPreferences): Promise<void>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  hasBlockingActivity(id: string): Promise<boolean>;
  requestDeletion(id: string, requestedAt: Date, scheduledAt: Date): Promise<void>;
  cancelDeletion(id: string): Promise<void>;
  exportData(id: string): Promise<unknown | null>;
}
