import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

export class PrismaService extends PrismaClient {
  private static instance: PrismaService;

  private constructor() {
    super();
  }

  public static getInstance(): PrismaService {
    if (!PrismaService.instance) {
      PrismaService.instance = new PrismaService();
      PrismaService.instance.setupSecurityHooks();
    }
    return PrismaService.instance;
  }

  private setupSecurityHooks() {
    const { EncryptionUtil } = require('../security/encryption.util');

    const encryptFields = (data: any) => {
      if (!data) return;
      if (data.fullAddress != null) data.fullAddress = EncryptionUtil.encrypt(data.fullAddress);
      if (data.latitude != null) data.latitude = EncryptionUtil.encrypt(data.latitude);
      if (data.longitude != null) data.longitude = EncryptionUtil.encrypt(data.longitude);
    };

    const decryptFields = (data: any) => {
      if (!data) return;
      if (data.fullAddress) data.fullAddress = EncryptionUtil.decrypt(data.fullAddress);

      if (data.latitude) {
        const decLat = EncryptionUtil.decrypt(data.latitude);
        data.latitude = (decLat && !decLat.startsWith('***')) ? parseFloat(decLat) : null;
      }

      if (data.longitude) {
        const decLng = EncryptionUtil.decrypt(data.longitude);
        data.longitude = (decLng && !decLng.startsWith('***')) ? parseFloat(decLng) : null;
      }

      // Consultas de User/Appointment podem trazer perfis e áreas por include.
      // Percorre as relações para não devolver ciphertext à aplicação.
      for (const value of Object.values(data)) {
        if (Array.isArray(value)) value.forEach(decryptFields);
        else if (value && typeof value === 'object' && !(value instanceof Date)) decryptFields(value);
      }
    };

    const targetModels = ['ClientProfile', 'ProviderProfile', 'ServiceRequest', 'CoverageArea'];

    this.$use(async (params, next) => {
      if (targetModels.includes(params.model as string)) {
        if (['create', 'update'].includes(params.action) && params.args.data) {
          encryptFields(params.args.data);
        }
      }

      const result = await next(params);

      if (result) {
        if (['findUnique', 'findFirst', 'create', 'update'].includes(params.action)) {
          decryptFields(result);
        } else if (params.action === 'findMany') {
          result.forEach(decryptFields);
        }
      }

      return result;
    });
  }
}

export const prisma = PrismaService.getInstance();
