import { PasswordHasher } from '../../../infrastructure/security/password.hasher';
import { PasswordService } from '../application/password.service';

export class BcryptPasswordService implements PasswordService {
  hash(value: string): Promise<string> { return PasswordHasher.hash(value); }
  compare(value: string, hash: string): Promise<boolean> { return PasswordHasher.compare(value, hash); }
}
