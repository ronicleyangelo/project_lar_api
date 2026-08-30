export interface AccountRecord {
  id: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  googleId: string | null;
  passwordHash: string | null;
  profileVisible: boolean;
  allowRecommendations: boolean;
  createdAt: Date;
  deletionRequestedAt: Date | null;
  scheduledDeletionAt: Date | null;
}

export interface AccountView {
  id: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  googleLinked: boolean;
  hasPassword: boolean;
  profileVisible: boolean;
  allowRecommendations: boolean;
  createdAt: Date;
  deletionRequestedAt: Date | null;
  scheduledDeletionAt: Date | null;
}

export interface PrivacyPreferences {
  profileVisible: boolean;
  allowRecommendations: boolean;
}
