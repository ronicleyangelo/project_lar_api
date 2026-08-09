export const REQUEST_STATUS = {
  OPEN: 'OPEN',
  QUOTED: 'QUOTED',
  ACCEPTED: 'ACCEPTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  DISPUTED: 'DISPUTED',
} as const;

export const QUOTE_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export const APPOINTMENT_STATUS = {
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  DISPUTED: 'DISPUTED',
} as const;

export type AppointmentStatus = typeof APPOINTMENT_STATUS[keyof typeof APPOINTMENT_STATUS];

const appointmentTransitions: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  SCHEDULED: ['IN_PROGRESS', 'AWAITING_CONFIRMATION', 'CANCELLED', 'DISPUTED'],
  IN_PROGRESS: ['AWAITING_CONFIRMATION', 'CANCELLED', 'DISPUTED'],
  AWAITING_CONFIRMATION: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  CANCELLED: [],
  DISPUTED: ['COMPLETED', 'CANCELLED'],
};

export function canTransitionAppointment(from: string, to: AppointmentStatus): boolean {
  const allowed = appointmentTransitions[from as AppointmentStatus];
  return Boolean(allowed?.includes(to));
}

export function assertAppointmentTransition(from: string, to: AppointmentStatus): void {
  if (!canTransitionAppointment(from, to)) {
    throw new Error(`Transicao de agendamento invalida: ${from} -> ${to}.`);
  }
}

export function canReceiveQuote(requestStatus: string): boolean {
  return requestStatus === REQUEST_STATUS.OPEN || requestStatus === REQUEST_STATUS.QUOTED;
}

export function canAcceptQuote(requestStatus: string, quoteStatus: string): boolean {
  return canReceiveQuote(requestStatus) && quoteStatus === QUOTE_STATUS.PENDING;
}
