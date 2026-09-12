import { prisma } from '../../../infrastructure/database/prisma.service';

const SIX_HOURS = 6 * 60 * 60 * 1000;

export class AccountDeletionWorker {
  private timer?: NodeJS.Timeout;

  async run(): Promise<void> {
    const dueAccounts = await prisma.user.findMany({
      where: { status: 'DELETION_PENDING', scheduledDeletionAt: { lte: new Date() } },
      select: { id: true },
      take: 100,
    });

    for (const account of dueAccounts) {
      await prisma.user.delete({ where: { id: account.id } });
    }

    if (dueAccounts.length) console.info(`${dueAccounts.length} conta(s) excluída(s) após o prazo legal.`);
  }

  start(): void {
    void this.run().catch(error => console.error('Falha ao processar exclusões de contas:', error));
    this.timer = setInterval(() => {
      void this.run().catch(error => console.error('Falha ao processar exclusões de contas:', error));
    }, SIX_HOURS);
    this.timer.unref();
  }
}
