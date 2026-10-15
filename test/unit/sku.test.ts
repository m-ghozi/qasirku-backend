import { describe, it, expect } from 'vitest';
import { parseSku, derivePrefix, nextSku } from '../../src/utils/sku';

// Unit: pembentukan SKU lanjutan. Murni fungsi, tanpa DB.
describe('SKU — urai pola', () => {
  it('mengurai huruf + pemisah + angka', () => {
    expect(parseSku('ATK-035')).toEqual({
      prefix: 'ATK',
      separator: '-',
      digits: '035',
      value: 35,
    });
  });

  it('menerima SKU tanpa pemisah', () => {
    expect(parseSku('ELK001')).toMatchObject({ prefix: 'ELK', separator: '', digits: '001' });
  });

  it('menolak barcode angka murni — tidak ada nomor urut yang bisa dinaikkan', () => {
    expect(parseSku('8998866613750')).toBeNull();
  });

  it('menolak SKU tanpa angka di belakang', () => {
    expect(parseSku('botol')).toBeNull();
    expect(parseSku('ATK-')).toBeNull();
  });
});

describe('SKU — prefix cadangan', () => {
  it('memakai tiga huruf pertama nama kategori', () => {
    expect(derivePrefix('Elektronik')).toBe('ELE');
    // Diambil dari huruf, bukan inisial tiap kata — "Alat Tulis" → "ALA".
    expect(derivePrefix('Alat Tulis')).toBe('ALA');
  });

  it('jatuh ke PRD kalau nama tidak punya huruf', () => {
    expect(derivePrefix('123')).toBe('PRD');
  });
});

describe('SKU — usulan berikutnya', () => {
  it('menaikkan nomor terakhir dan mempertahankan lebar angka', () => {
    expect(nextSku('ATK-035', 'Alat Tulis')).toBe('ATK-036');
    expect(nextSku('ELK009', 'Elektronik')).toBe('ELK010');
  });

  it('mempertahankan gaya pemisah SKU terakhir', () => {
    expect(nextSku('PLS-013', 'Rumah Tangga')).toBe('PLS-014');
    expect(nextSku('ELK013', 'Elektronik')).toBe('ELK014');
  });

  it('melewati 999 tanpa terpotong', () => {
    expect(nextSku('ATK-999', 'Alat Tulis')).toBe('ATK-1000');
  });

  it('memakai prefix kategori saat belum ada SKU berpola', () => {
    expect(nextSku(null, 'Elektronik')).toBe('ELE-001');
  });

  it('step dipakai untuk melompati nomor yang sudah terpakai', () => {
    expect(nextSku('ATK-035', 'Alat Tulis', 0)).toBe('ATK-036');
    expect(nextSku('ATK-035', 'Alat Tulis', 2)).toBe('ATK-038');
  });
});
