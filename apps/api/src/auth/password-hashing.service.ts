import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$Vmh6XKjJOhVTctCNuF+G+g$YfvQXGXoRrvu6F8aQBVaex5SgLH3dukgEtHY2iH0c6g';

@Injectable()
export class PasswordHashingService {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async verifyDummy(password: string): Promise<void> {
    await this.verify(DUMMY_PASSWORD_HASH, password);
  }
}
