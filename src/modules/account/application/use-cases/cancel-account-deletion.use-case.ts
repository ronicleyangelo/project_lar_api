import { AppError } from '../../../../shared/errors/app-error';
import { AccountRepository } from '../../domain/account.repository';

export class CancelAccountDeletionUseCase {
  constructor(private readonly accounts: AccountRepository) {}
  async execute(userId: string): Promise<void> {
    const account = await this.accounts.findById(userId);
    if (!account) throw new AppError('Conta não encontrada.', 404, 'ACCOUNT_NOT_FOUND');
    if (account.status !== 'DELETION_PENDING') throw new AppError('Esta conta não possui exclusão agendada.', 409, 'DELETION_NOT_PENDING');
    await this.accounts.cancelDeletion(userId);
  }
}
