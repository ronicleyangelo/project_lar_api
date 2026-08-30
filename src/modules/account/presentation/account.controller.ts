import { Response } from 'express';
import { AuthenticatedRequest } from '../../../presentation/middlewares/auth.middleware';
import { GetAccountUseCase } from '../application/use-cases/get-account.use-case';
import { UpdatePrivacyUseCase } from '../application/use-cases/update-privacy.use-case';
import { UpdatePasswordUseCase } from '../application/use-cases/update-password.use-case';
import { RequestAccountDeletionUseCase } from '../application/use-cases/delete-account.use-case';
import { CancelAccountDeletionUseCase } from '../application/use-cases/cancel-account-deletion.use-case';

export class AccountController {
  constructor(
    private readonly getAccount: GetAccountUseCase,
    private readonly updatePrivacy: UpdatePrivacyUseCase,
    private readonly updatePassword: UpdatePasswordUseCase,
    private readonly requestDeletion: RequestAccountDeletionUseCase,
    private readonly cancelDeletionUseCase: CancelAccountDeletionUseCase,
  ) {}

  get = async (req: AuthenticatedRequest, res: Response) =>
    res.json(await this.getAccount.execute(req.user!.userId));

  privacy = async (req: AuthenticatedRequest, res: Response) =>
    res.json(await this.updatePrivacy.execute(req.user!.userId, req.body));

  password = async (req: AuthenticatedRequest, res: Response) =>
    res.json(await this.updatePassword.execute(req.user!.userId, req.body.currentPassword, req.body.newPassword));

  requestAccountDeletion = async (req: AuthenticatedRequest, res: Response) => {
    await this.requestDeletion.execute(req.user!.userId, req.body.confirmation, req.body.currentPassword);
    return res.status(202).json({ message: 'Exclusão agendada por 30 dias.' });
  };

  cancelAccountDeletion = async (req: AuthenticatedRequest, res: Response) => {
    await this.cancelDeletionUseCase.execute(req.user!.userId);
    return res.json({ message: 'Solicitação de exclusão cancelada.' });
  };
}
