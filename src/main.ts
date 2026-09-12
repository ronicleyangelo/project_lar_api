import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { AuthController } from './presentation/controllers/auth.controller';
import { CategoryController } from './presentation/controllers/category.controller';
import { RequestController } from './presentation/controllers/request.controller';
import { QuoteController } from './presentation/controllers/quote.controller';
import { AppointmentController } from './presentation/controllers/appointment.controller';
import { ReviewController } from './presentation/controllers/review.controller';
import { AdminController } from './presentation/controllers/admin.controller';
import { ProviderProfileController } from './presentation/controllers/provider-profile.controller';
import { ActivityController } from './presentation/controllers/activity.controller';
import { ClientProfileController } from './presentation/controllers/client-profile.controller';
import { FavoriteController } from './presentation/controllers/favorite.controller';
import { accountRouter } from './modules/account/presentation/account.routes';
import { errorMiddleware } from './shared/http/error.middleware';
import { authenticateToken, authorizeRoles } from './presentation/middlewares/auth.middleware';
import { apiRateLimiter, authenticationRateLimiter, sensitiveActionRateLimiter } from './presentation/middlewares/rate-limit.middleware';
import { JwtProvider } from './infrastructure/security/jwt.provider';
import { AccountDeletionWorker } from './modules/account/infrastructure/account-deletion.worker';
import { securityHeaders, validateUuidParam } from './presentation/middlewares/request-security.middleware';
import { PaymentController } from './presentation/controllers/payment.controller';

dotenv.config();

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
JwtProvider.assertConfigured();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:4200')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origem não permitida pelo CORS.'));
  },
  credentials: true,
}));
app.use(securityHeaders);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api', apiRateLimiter);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', service: 'Projeto Lar API', timestamp: new Date().toISOString() });
});

// Authentication Routes
app.post('/api/auth/register-client', authenticationRateLimiter, AuthController.registerClient);
app.post('/api/auth/register-provider', authenticationRateLimiter, AuthController.registerProvider);
app.post('/api/auth/login', authenticationRateLimiter, AuthController.login);
app.post('/api/auth/logout', AuthController.logout);
app.post('/api/auth/google', authenticationRateLimiter, AuthController.googleLogin);
app.post('/api/auth/google/complete', authenticationRateLimiter, AuthController.completeGoogleRegistration);
app.get('/api/auth/me', authenticateToken, AuthController.getCurrentUser);
app.get('/api/provider/profile', authenticateToken, authorizeRoles('PROVIDER'), ProviderProfileController.getProfile);
app.put('/api/provider/profile', authenticateToken, authorizeRoles('PROVIDER'), ProviderProfileController.updateProfile);
app.post('/api/provider/profile/submit-review', authenticateToken, authorizeRoles('PROVIDER'), ProviderProfileController.submitForReview);
app.get('/api/client/profile', authenticateToken, authorizeRoles('CLIENT'), ClientProfileController.getProfile);
app.put('/api/client/profile', authenticateToken, authorizeRoles('CLIENT'), ClientProfileController.updateProfile);
app.get('/api/client/favorites', authenticateToken, authorizeRoles('CLIENT'), FavoriteController.list);
app.post('/api/client/favorites/:providerId', authenticateToken, authorizeRoles('CLIENT'), validateUuidParam('providerId'), FavoriteController.add);
app.delete('/api/client/favorites/:providerId', authenticateToken, authorizeRoles('CLIENT'), validateUuidParam('providerId'), FavoriteController.remove);
app.use('/api/account', accountRouter);

// Categories
app.get('/api/categories', CategoryController.listCategories);
app.post('/api/categories/seed', authenticateToken, authorizeRoles('ADMIN'), sensitiveActionRateLimiter, CategoryController.seedCategories);
app.get('/api/activities', ActivityController.list);

// Service Requests & Recommendations
app.post('/api/requests', authenticateToken, authorizeRoles('CLIENT'), sensitiveActionRateLimiter, RequestController.createRequest);
app.get('/api/requests/client', authenticateToken, authorizeRoles('CLIENT'), RequestController.listClientRequests);
app.get('/api/requests/recommendations', RequestController.getRecommendations);
app.get('/api/requests/provider/open', authenticateToken, authorizeRoles('PROVIDER'), RequestController.listOpenRequestsForProvider);

// Quotes & Proposals
app.post('/api/quotes', authenticateToken, authorizeRoles('PROVIDER'), sensitiveActionRateLimiter, QuoteController.sendQuote);
app.post('/api/quotes/:quoteId/accept', authenticateToken, authorizeRoles('CLIENT'), validateUuidParam('quoteId'), sensitiveActionRateLimiter, QuoteController.acceptQuote);

// Appointments
app.get('/api/appointments', authenticateToken, authorizeRoles('CLIENT', 'PROVIDER'), AppointmentController.listAppointments);
app.post('/api/appointments/:id/start', authenticateToken, authorizeRoles('PROVIDER'), validateUuidParam('id'), AppointmentController.startAppointment);
app.post('/api/appointments/:id/complete', authenticateToken, authorizeRoles('PROVIDER'), validateUuidParam('id'), AppointmentController.completeAppointment);
app.post('/api/appointments/:id/confirm-completion', authenticateToken, authorizeRoles('CLIENT'), validateUuidParam('id'), AppointmentController.confirmCompletion);

// Reviews & Ratings
app.post('/api/reviews', authenticateToken, authorizeRoles('CLIENT'), sensitiveActionRateLimiter, ReviewController.createReview);
app.get('/api/reviews/provider/:providerId', validateUuidParam('providerId'), ReviewController.getProviderReviews);

// Mercado Pago Marketplace
app.get('/api/payments/mercado-pago/status', authenticateToken, authorizeRoles('PROVIDER'), PaymentController.connectionStatus);
app.post('/api/payments/mercado-pago/connect', authenticateToken, authorizeRoles('PROVIDER'), sensitiveActionRateLimiter, PaymentController.connect);
app.get('/api/payments/mercado-pago/callback', PaymentController.callback);
app.post('/api/payments/mercado-pago/webhook', PaymentController.webhook);
app.post('/api/payments/appointments/:id/checkout', authenticateToken, authorizeRoles('CLIENT'), validateUuidParam('id'), sensitiveActionRateLimiter, PaymentController.createCheckout);

// Admin Routes
app.get('/api/admin/metrics', authenticateToken, authorizeRoles('ADMIN'), AdminController.getMetrics);
app.get('/api/admin/providers', authenticateToken, authorizeRoles('ADMIN'), AdminController.listProviders);
app.get('/api/admin/providers/:id', authenticateToken, authorizeRoles('ADMIN'), validateUuidParam('id'), AdminController.getProvider);
app.put('/api/admin/providers/:id/verify', authenticateToken, authorizeRoles('ADMIN'), validateUuidParam('id'), AdminController.verifyProvider);
app.put('/api/admin/providers/:id/verification', authenticateToken, authorizeRoles('ADMIN'), validateUuidParam('id'), AdminController.reviewProvider);

app.use(errorMiddleware);

app.listen(PORT, () => {
  new AccountDeletionWorker().start();
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
