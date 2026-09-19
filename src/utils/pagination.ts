// Utilitas pagination offset (page/limit) yang dipakai lintas service.
//
// Nilai query yang tidak valid sengaja di-clamp, bukan ditolak 400: parameter ini
// hanya mengatur tampilan daftar, jadi bookmark lama atau angka salah ketik tidak
// boleh menggagalkan seluruh halaman. Validasi ketat tetap ada di body request
// (lihat validate.middleware.ts).

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
// Batas atas page semata-mata penjaga: (page-1)*limit tetap jauh di bawah
// Number.MAX_SAFE_INTEGER sehingga `skip` selalu bilangan bulat yang sah.
const MAX_PAGE = 1_000_000;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

// Di bawah 1 (0 / negatif) dianggap permintaan yang tidak masuk akal → pakai
// nilai default, BUKAN dipaksa jadi 1. Kalau di-clamp ke 1, `?limit=-5` akan
// menghasilkan satu baris per halaman — sah secara teknis tapi jelas bukan
// maksud pemanggilnya. Nilai di atas batas atas baru di-clamp.
function toInt(raw: unknown, fallback: number, max: number): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < 1) return fallback;
  if (i > max) return max;
  return i;
}

/** Parse ?page=&limit= menjadi skip/take siap pakai untuk Prisma. */
export function parsePagination(query: { page?: unknown; limit?: unknown } = {}): PaginationParams {
  const page = toInt(query.page, 1, MAX_PAGE);
  const limit = toInt(query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

/** totalPages = 0 saat total 0, supaya frontend bisa membedakan "kosong" dari "satu halaman". */
export function buildMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

/** Query param id (categoryId/supplierId): hanya angka positif yang dipakai, sisanya diabaikan. */
export function parseOptionalId(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Filter rentang tanggal; kosong berarti tanpa batas. */
export function dateRangeWhere(from?: Date, to?: Date) {
  if (!from && !to) return {};
  return { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } };
}
