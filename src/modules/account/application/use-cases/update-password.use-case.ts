import { AppError } from '../../../../shared/errors/app-error';
import { AccountRepository } from '../../domain/account.repository';
import { PasswordService } from '../password.service';

export class UpdatePasswordUseCase {
  constructor(private readonly accounts: AccountRepository, private readonly passwords: PasswordService) {}
  async execute(userId: string, currentPassword: string, newPassword: string) {
    const account = await this.accounts.findById(userId);
    if (!account) throw new AppError('Conta não encontrada.', 404, 'ACCOUNT_NOT_FOUND');
    if (account.passwordHash && !(await this.passwords.compare(currentPassword, account.passwordHash))) {
      throw new AppError('A senha atual está incorreta.', 401, 'INVALID_CURRENT_PASSWORD');
    }
    await this.accounts.updatePasswordHash(userId, await this.passwords.hash(newPassword));
    return { message: account.passwordHash ? 'Senha alterada com sucesso.' : 'Senha criada com sucesso.' };
  }
}
