// Pembentukan SKU lanjutan dari SKU terakhir sebuah kategori.
//
// Pola yang dikenali: huruf + pemisah opsional + angka — "ATK-035", "ELK001".
// SKU berupa barcode angka murni ("8998866613750") sengaja TIDAK dianggap
// berpola: tidak ada nomor urut yang bisa dinaikkan, jadi produk seperti itu
// dilewati saat mencari SKU terakhir — bukan diperlakukan sebagai "kategori ini
// belum punya SKU sama sekali".

const SKU_PATTERN = /^([A-Za-z]+)([-_]?)(\d+)$/;

export interface ParsedSku {
  prefix: string;
  separator: string;
  /** Bagian angka apa adanya — dipakai untuk mempertahankan nol di depan. */
  digits: string;
  value: number;
}

/** Mengurai SKU berpola; null berarti SKU tidak bisa dilanjutkan. */
export function parseSku(sku: string): ParsedSku | null {
  const match = SKU_PATTERN.exec(sku.trim());
  if (!match) return null;

  const value = Number(match[3]);
  // Nomor di luar rentang aman dilewati: menambah 1 padanya bisa menghasilkan
  // angka yang sama (presisi float), dan SKU yang tidak bergerak lebih buruk
  // daripada jatuh ke prefix cadangan.
  if (!Number.isSafeInteger(value)) return null;

  return { prefix: match[1], separator: match[2], digits: match[3], value };
}

/**
 * Prefix cadangan untuk kategori yang belum punya SKU berpola: tiga huruf
 * pertama namanya ("Elektronik" → "ELE"). Nama kategori yang tidak punya huruf
 * sama sekali jatuh ke "PRD" agar hasilnya tidak pernah kosong.
 */
export function derivePrefix(categoryName: string): string {
  const letters = categoryName.replace(/[^A-Za-z]/g, '').toUpperCase();
  return letters.slice(0, 3) || 'PRD';
}

/**
 * Usulan SKU berikutnya. `step` dipakai pemanggil untuk melompati nomor yang
 * ternyata sudah terpakai di kategori lain.
 */
export function nextSku(lastSku: string | null, categoryName: string, step = 0): string {
  const parsed = lastSku ? parseSku(lastSku) : null;

  if (!parsed) {
    return `${derivePrefix(categoryName)}-${String(1 + step).padStart(3, '0')}`;
  }

  // Lebar angka dipertahankan (ATK-035 → ATK-036, bukan ATK-36) supaya SKU
  // dalam satu seri tetap sejajar; begitu melewati 999 angkanya memanjang sendiri.
  const value = String(parsed.value + 1 + step).padStart(parsed.digits.length, '0');
  return `${parsed.prefix}${parsed.separator}${value}`;
}
