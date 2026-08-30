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
import { accountRouter } from './modules/account/presentation/account.routes';
import { errorMiddleware } from './shared/http/error.middleware';
import { authenticateToken, authorizeRoles } from './presentation/middlewares/auth.middleware';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.json());
app.use(cookieParser());

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', service: 'Projeto Lar API', timestamp: new Date().toISOString() });
});

// Authentication Routes
app.post('/api/auth/register-client', AuthController.registerClient);
app.post('/api/auth/register-provider', AuthController.registerProvider);
app.post('/api/auth/login', AuthController.login);
app.post('/api/auth/logout', AuthController.logout);
app.post('/api/auth/google', AuthController.googleLogin);
app.post('/api/auth/google/complete', AuthController.completeGoogleRegistration);
app.get('/api/auth/me', authenticateToken, AuthController.getCurrentUser);
app.get('/api/provider/profile', authenticateToken, authorizeRoles('PROVIDER'), ProviderProfileController.getProfile);
app.put('/api/provider/profile', authenticateToken, authorizeRoles('PROVIDER'), ProviderProfileController.updateProfile);
app.post('/api/provider/profile/submit-review', authenticateToken, authorizeRoles('PROVIDER'), ProviderProfileController.submitForReview);
app.use('/api/account', accountRouter);

// Categories
app.get('/api/categories', CategoryController.listCategories);
app.post('/api/categories/seed', CategoryController.seedCategories);
app.get('/api/activities', ActivityController.list);

// Service Requests & Recommendations
app.post('/api/requests', authenticateToken, authorizeRoles('CLIENT'), RequestController.createRequest);
app.get('/api/requests/client', authenticateToken, authorizeRoles('CLIENT'), RequestController.listClientRequests);
app.get('/api/requests/recommendations', RequestController.getRecommendations);
app.get('/api/requests/provider/open', authenticateToken, authorizeRoles('PROVIDER'), RequestController.listOpenRequestsForProvider);

// Quotes & Proposals
app.post('/api/quotes', authenticateToken, authorizeRoles('PROVIDER'), QuoteController.sendQuote);
app.post('/api/quotes/:quoteId/accept', authenticateToken, authorizeRoles('CLIENT'), QuoteController.acceptQuote);

// Appointments
app.get('/api/appointments', authenticateToken, AppointmentController.listAppointments);
app.post('/api/appointments/:id/start', authenticateToken, authorizeRoles('PROVIDER'), AppointmentController.startAppointment);
app.post('/api/appointments/:id/complete', authenticateToken, authorizeRoles('PROVIDER'), AppointmentController.completeAppointment);
app.post('/api/appointments/:id/confirm-completion', authenticateToken, authorizeRoles('CLIENT'), AppointmentController.confirmCompletion);

// Reviews & Ratings
app.post('/api/reviews', authenticateToken, authorizeRoles('CLIENT'), ReviewController.createReview);
app.get('/api/reviews/provider/:providerId', ReviewController.getProviderReviews);

// Admin Routes
app.get('/api/admin/metrics', authenticateToken, authorizeRoles('ADMIN'), AdminController.getMetrics);
app.get('/api/admin/providers', authenticateToken, authorizeRoles('ADMIN'), AdminController.listProviders);
app.get('/api/admin/providers/:id', authenticateToken, authorizeRoles('ADMIN'), AdminController.getProvider);
app.put('/api/admin/providers/:id/verify', authenticateToken, authorizeRoles('ADMIN'), AdminController.verifyProvider);
app.put('/api/admin/providers/:id/verification', authenticateToken, authorizeRoles('ADMIN'), AdminController.reviewProvider);

app.use(errorMiddleware);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
