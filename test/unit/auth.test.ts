import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { hashPin, verifyPin, isLegacyPinHash, generateToken } from '../../src/utils/auth';

describe('hashPin', () => {
  it('menghasilkan hash scrypt bersalt (bukan SHA-256 polos)', () => {
    const hash = hashPin('123456');
    expect(hash.startsWith('scrypt$')).toBe(true);
    // Bukan lagi digest SHA-256 hex 64 karakter
    expect(hash).not.toBe(crypto.createHash('sha256').update('123456').digest('hex'));
  });

  it('memberi salt acak → hash PIN sama berbeda tiap kali', () => {
    expect(hashPin('123456')).not.toBe(hashPin('123456'));
  });

  it('PIN berbeda → hash berbeda', () => {
    expect(hashPin('123456')).not.toBe(hashPin('654321'));
  });
});

describe('verifyPin', () => {
  it('PIN benar → true, PIN salah → false', () => {
    const hash = hashPin('123456');
    expect(verifyPin('123456', hash)).toBe(true);
    expect(verifyPin('654321', hash)).toBe(false);
  });

  it('mendukung hash lama SHA-256 tanpa salt (kompatibilitas login)', () => {
    const legacy = crypto.createHash('sha256').update('123456').digest('hex');
    expect(isLegacyPinHash(legacy)).toBe(true);
    expect(verifyPin('123456', legacy)).toBe(true);
    expect(verifyPin('000000', legacy)).toBe(false);
  });

  it('hash kosong / null → false', () => {
    expect(verifyPin('123456', '')).toBe(false);
    expect(verifyPin('123456', null)).toBe(false);
    expect(verifyPin('123456', undefined)).toBe(false);
  });
});

describe('generateToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test_secret_kasir';
  });

  it('token bisa di-verify & membawa payload yang benar', () => {
    const token = generateToken(7, 'owner', ['sales']);
    const decoded = jwt.verify(token, 'test_secret_kasir') as any;
    expect(decoded.userId).toBe(7);
    expect(decoded.role).toBe('owner');
    expect(decoded.permissions).toEqual(['sales']);
  });

  it('gagal (throw) bila JWT_SECRET tidak di-set', () => {
    delete process.env.JWT_SECRET;
    expect(() => generateToken(1, 'staff', [])).toThrow(/JWT_SECRET/);
  });
});
