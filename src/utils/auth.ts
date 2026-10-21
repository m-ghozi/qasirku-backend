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
 *
 * Secret juga divalidasi kekuatannya. HMAC-SHA256 membutuhkan secret minimal
 * 256 bit (32 byte) — secret pendek atau nilai contoh seperti
 * "kasir_super_rahasia_2026" membuat token bisa ditebak/dibuat ulang siapa saja
 * yang berhasil membaca nilainya. Menolak secret lemah di sini memaksa
 * rotasi terjadi saat deploy, bukan setelah insiden.
 */
const MIN_SECRET_LENGTH = 32;

// Nilai contoh / placeholder yang sering tertinggal di .env — semuanya
// menghasilkan secret yang sama di setiap instalasi.
const KNOWN_WEAK_SECRETS = new Set([
  'kasir_super_rahasia_2026',
  'ganti_dengan_secret_acak_panjang',
  'secret',
  'change_me',
  'changeme',
  'jwt_secret',
]);

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.trim() === '') {
    throw new Error(
      'JWT_SECRET tidak di-set. Isi JWT_SECRET di environment sebelum menjalankan server.'
    );
  }

  const trimmed = secret.trim();

  if (trimmed.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET terlalu pendek (${trimmed.length} karakter). ` +
      `Gunakan minimal ${MIN_SECRET_LENGTH} karakter acak, mis: openssl rand -hex 32`
    );
  }

  if (KNOWN_WEAK_SECRETS.has(trimmed.toLowerCase())) {
    throw new Error(
      'JWT_SECRET memakai nilai contoh yang sudah/dikenal. ' +
      'Ganti dengan secret acak unik, mis: openssl rand -hex 32'
    );
  }

  return trimmed;
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
