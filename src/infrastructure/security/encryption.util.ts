import crypto from 'crypto';

export class EncryptionUtil {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits

  private static getKey(): Buffer {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey) {
      throw new Error('FATAL ERROR: ENCRYPTION_MASTER_KEY is not defined in environment variables');
    }
    const keyBuffer = Buffer.from(masterKey, 'base64');
    if (keyBuffer.length !== EncryptionUtil.KEY_LENGTH) {
      throw new Error('FATAL ERROR: ENCRYPTION_MASTER_KEY must be exactly 32 bytes (256-bit) in Base64');
    }
    return keyBuffer;
  }

  public static encrypt(text: string | number | null | undefined): string | null {
    if (!text) return text as any;
    
    const textStr = String(text);
    
    // Check if it's already encrypted
    if (textStr.startsWith('enc:v1:')) return textStr;

    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(EncryptionUtil.ALGORITHM, EncryptionUtil.getKey(), iv);
      
      let encrypted = cipher.update(textStr, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      const authTag = cipher.getAuthTag().toString('base64');
      
      return `enc:v1:${iv.toString('base64')}:${authTag}:${encrypted}`;
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt sensitive data');
    }
  }

  public static decrypt(encryptedText: string | number | null | undefined): string | null {
    if (!encryptedText) return encryptedText as any;
    
    const textStr = String(encryptedText);
    
    // Check if it is encrypted
    if (!textStr.startsWith('enc:v1:')) return textStr;

    try {
      const parts = textStr.split(':');
      if (parts.length !== 5) throw new Error('Invalid encrypted data format');
      
      const iv = Buffer.from(parts[2], 'base64');
      const authTag = Buffer.from(parts[3], 'base64');
      const ciphertext = parts[4];

      const decipher = crypto.createDecipheriv(EncryptionUtil.ALGORITHM, EncryptionUtil.getKey(), iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption failed (Possible data tampering or wrong key):', error);
      return '***DATA_CORRUPTED_OR_TAMPERED***';
    }
  }
}
