import { AppError } from '../../../../shared/errors/app-error';
import { AccountRepository } from '../../domain/account.repository';
import { PasswordService } from '../password.service';

export class RequestAccountDeletionUseCase {
  constructor(private readonly accounts: AccountRepository, private readonly passwords: PasswordService) {}
  async execute(userId: string, confirmation: string, currentPassword: string): Promise<void> {
    if (confirmation !== 'EXCLUIR MINHA CONTA') {
      throw new AppError('Digite EXCLUIR MINHA CONTA para confirmar.', 400, 'INVALID_CONFIRMATION');
    }
    const account = await this.accounts.findById(userId);
    if (!account) throw new AppError('Conta não encontrada.', 404, 'ACCOUNT_NOT_FOUND');
    if (account.role === 'ADMIN') throw new AppError('Contas administrativas não podem ser excluídas por esta tela.', 403, 'ADMIN_DELETE_FORBIDDEN');
    if (account.status === 'DELETION_PENDING') throw new AppError('A exclusão desta conta já está agendada.', 409, 'DELETION_ALREADY_PENDING');
    if (account.passwordHash && !(await this.passwords.compare(currentPassword, account.passwordHash))) {
      throw new AppError('A senha atual está incorreta.', 401, 'INVALID_CURRENT_PASSWORD');
    }
    if (await this.accounts.hasBlockingActivity(userId)) {
      throw new AppError('Finalize ou cancele agendamentos e disputas pendentes antes de solicitar a exclusão.', 409, 'ACCOUNT_HAS_BLOCKING_ACTIVITY');
    }
    const requestedAt = new Date();
    const scheduledAt = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    await this.accounts.requestDeletion(userId, requestedAt, scheduledAt);
  }
}
