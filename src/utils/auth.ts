import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// ── Konfigurasi ───────────────────────────────────────────────────────────────

const SCRYPT_PREFIX = 'scrypt';
const SCRYPT_KEYLEN = 64;
// N=16384, r=8, p=1 → biaya memori ~16MB per hash (default scrypt, aman & wajar).
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;

/**
 * Ambil JWT_SECRET dari environment. Tidak ada fallback: kalau tidak di-set,
 * server harus gagal alih-alih diam-diam memakai secret yang ada di source code.
 */
export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error(
      'JWT_SECRET tidak di-set. Isi JWT_SECRET di environment sebelum menjalankan server.'
    );
  }
  return secret;
};

// ── PIN hashing ───────────────────────────────────────────────────────────────

/**
 * Hash PIN dengan scrypt + salt acak per-user.
 * Format hasil: "scrypt$<saltHex>$<hashHex>"
 */
export const hashPin = (pin: string): string => {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(pin, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `${SCRYPT_PREFIX}$${salt.toString('hex')}$${derived.toString('hex')}`;
};

/**
 * Verifikasi PIN terhadap hash tersimpan.
 * Mendukung format baru (scrypt bersalt) dan format lama (SHA-256 tanpa salt)
 * supaya user yang belum reset PIN tetap bisa login.
 */
export const verifyPin = (pin: string, storedHash: string | null | undefined): boolean => {
  if (!storedHash) return false;

  if (storedHash.startsWith(`${SCRYPT_PREFIX}$`)) {
    const [, saltHex, hashHex] = storedHash.split('$');
    if (!saltHex || !hashHex) return false;

    const stored = Buffer.from(hashHex, 'hex');
    const derived = crypto.scryptSync(pin, Buffer.from(saltHex, 'hex'), stored.length, SCRYPT_OPTIONS);
    return stored.length === derived.length && crypto.timingSafeEqual(stored, derived);
  }

  // Legacy: SHA-256 hex tanpa salt.
  const legacy = crypto.createHash('sha256').update(pin).digest('hex');
  const a = Buffer.from(legacy, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** true bila hash masih memakai skema lama (SHA-256 tanpa salt) dan perlu di-upgrade. */
export const isLegacyPinHash = (storedHash: string): boolean =>
  !storedHash.startsWith(`${SCRYPT_PREFIX}$`);

// ── JWT ───────────────────────────────────────────────────────────────────────

// Fungsi untuk membuat Token JWT yang berlaku selama 1 hari
export const generateToken = (userId: number, role: string, permissions: any): string => {
  return jwt.sign({ userId, role, permissions }, getJwtSecret(), { expiresIn: '1d' });
};
