import { AppError } from '../../../../shared/errors/app-error';
import { AccountRepository } from '../../domain/account.repository';
import { toAccountView } from '../account.mapper';

export class GetAccountUseCase {
  constructor(private readonly accounts: AccountRepository) {}
  async execute(userId: string) {
    const account = await this.accounts.findById(userId);
    if (!account) throw new AppError('Conta não encontrada.', 404, 'ACCOUNT_NOT_FOUND');
    return toAccountView(account);
  }
}
