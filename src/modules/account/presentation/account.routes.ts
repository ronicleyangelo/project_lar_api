import { Router } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../../presentation/middlewares/auth.middleware';
import { asyncHandler } from '../../../shared/http/async-handler';
import { validateBody } from '../../../shared/validation/validate-body.middleware';
import { GetAccountUseCase } from '../application/use-cases/get-account.use-case';
import { UpdatePrivacyUseCase } from '../application/use-cases/update-privacy.use-case';
import { UpdatePasswordUseCase } from '../application/use-cases/update-password.use-case';
import { RequestAccountDeletionUseCase } from '../application/use-cases/delete-account.use-case';
import { CancelAccountDeletionUseCase } from '../application/use-cases/cancel-account-deletion.use-case';
import { BcryptPasswordService } from '../infrastructure/bcrypt-password.service';
import { PrismaAccountRepository } from '../infrastructure/prisma-account.repository';
import { AccountController } from './account.controller';
import { deleteAccountSchema, passwordSchema, privacySchema } from './account.schemas';

const accounts = new PrismaAccountRepository();
const passwords = new BcryptPasswordService();
const controller = new AccountController(
  new GetAccountUseCase(accounts),
  new UpdatePrivacyUseCase(accounts),
  new UpdatePasswordUseCase(accounts, passwords),
  new RequestAccountDeletionUseCase(accounts, passwords),
  new CancelAccountDeletionUseCase(accounts),
);

export const accountRouter = Router();
accountRouter.use(authenticateToken);
accountRouter.get('/', asyncHandler((req, res) => controller.get(req as AuthenticatedRequest, res)));
accountRouter.put('/privacy', validateBody(privacySchema), asyncHandler((req, res) => controller.privacy(req as AuthenticatedRequest, res)));
accountRouter.put('/password', validateBody(passwordSchema), asyncHandler((req, res) => controller.password(req as AuthenticatedRequest, res)));
accountRouter.post('/deletion', validateBody(deleteAccountSchema), asyncHandler((req, res) => controller.requestAccountDeletion(req as AuthenticatedRequest, res)));
accountRouter.delete('/deletion', asyncHandler((req, res) => controller.cancelAccountDeletion(req as AuthenticatedRequest, res)));
