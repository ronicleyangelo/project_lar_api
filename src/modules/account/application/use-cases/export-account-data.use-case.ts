import { AppError } from '../../../../shared/errors/app-error';
import { AccountRepository } from '../../domain/account.repository';

export class ExportAccountDataUseCase {
  constructor(private readonly accounts: AccountRepository) {}

  async execute(userId: string): Promise<unknown> {
    const data = await this.accounts.exportData(userId);
    if (!data) throw new AppError('Conta não encontrada.', 404);
    return data;
  }
}
