const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

async function main() {
  const requests = await prisma.serviceRequest.findMany({
    select: {
      clientId: true,
      categoryId: true,
      city: true,
      neighborhood: true,
      scheduledDate: true,
      timeSlot: true,
      budgetLimit: true,
      description: true,
    },
  });

  const requestGroups = new Map();
  for (const request of requests) {
    const fingerprint = [
      request.clientId,
      request.categoryId,
      normalize(request.city),
      normalize(request.neighborhood),
      request.scheduledDate.toISOString(),
      normalize(request.timeSlot),
      request.budgetLimit ?? '',
      normalize(request.description),
    ].join('|');
    requestGroups.set(fingerprint, (requestGroups.get(fingerprint) ?? 0) + 1);
  }

  const quoteGroups = await prisma.quote.groupBy({
    by: ['requestId', 'providerId'],
    _count: { _all: true },
  });
  const appointmentGroups = await prisma.appointment.groupBy({
    by: ['requestId'],
    _count: { _all: true },
  });
  const duplicateRequestGroups = [...requestGroups.values()].filter((count) => count > 1);

  console.log(JSON.stringify({
    serviceRequests: requests.length,
    duplicateRequestGroups: duplicateRequestGroups.length,
    duplicateRequestRows: duplicateRequestGroups.reduce((total, count) => total + count, 0),
    duplicateQuotePairs: quoteGroups.filter((group) => group._count._all > 1).length,
    requestsWithMultipleAppointments: appointmentGroups.filter((group) => group._count._all > 1).length,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
