import { z } from 'zod';

export const privacySchema = z.object({
  profileVisible: z.boolean(),
  allowRecommendations: z.boolean(),
}).strict();

export const passwordSchema = z.object({
  currentPassword: z.string().max(200).default(''),
  newPassword: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres.').max(200),
}).strict();

export const deleteAccountSchema = z.object({
  confirmation: z.literal('EXCLUIR MINHA CONTA', { errorMap: () => ({ message: 'Digite EXCLUIR MINHA CONTA para confirmar.' }) }),
  currentPassword: z.string().max(200).default(''),
}).strict();
