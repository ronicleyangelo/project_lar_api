import { AccountRecord, AccountView } from '../domain/account';

export const toAccountView = (account: AccountRecord): AccountView => ({
  id: account.id,
  email: account.email,
  role: account.role,
  status: account.status,
  emailVerified: account.emailVerified,
  googleLinked: !!account.googleId,
  hasPassword: !!account.passwordHash,
  profileVisible: account.profileVisible,
  allowRecommendations: account.allowRecommendations,
  createdAt: account.createdAt,
  deletionRequestedAt: account.deletionRequestedAt,
  scheduledDeletionAt: account.scheduledDeletionAt,
});
