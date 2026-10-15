import { vi, describe, it, expect, beforeEach } from 'vitest';
import { startOfDay, endOfDay, startOfMonth, subDays } from 'date-fns';

const mocks = vi.hoisted(() => ({
  tx: {
    product: { findUnique: vi.fn(), update: vi.fn() },
    stockOut: { create: vi.fn() },
  },
  stockIn: { findMany: vi.fn() },
  stockOut: { findMany: vi.fn() },
  transactionItem: { findMany: vi.fn() },
  product: { findMany: vi.fn() },
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: (cb: any) => cb(mocks.tx),
    stockIn: mocks.stockIn,
    stockOut: mocks.stockOut,
    transactionItem: mocks.transactionItem,
    product: mocks.product,
  },
}));

import { stockService, resolveRange } from '../../src/services/stock.service';

const { tx } = mocks;

beforeEach(() => {
  vi.clearAllMocks();
  tx.stockOut.create.mockResolvedValue({ id: 1 });
  tx.product.update.mockResolvedValue({});

  mocks.stockIn.findMany.mockResolvedValue([]);
  mocks.stockOut.findMany.mockResolvedValue([]);
  mocks.transactionItem.findMany.mockResolvedValue([]);
  mocks.product.findMany.mockResolvedValue([]);
});

describe('createStockOut', () => {
  it('stok kurang → throw', async () => {
    tx.product.findUnique.mockResolvedValue({ id: 1, stock: 1 });
    await expect(
      stockService.createStockOut({ productId: 1, quantity: 5 }, 1)
    ).rejects.toThrow('tidak mencukupi');
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('produk tidak ada → throw', async () => {
    tx.product.findUnique.mockResolvedValue(null);
    await expect(
      stockService.createStockOut({ productId: 1, quantity: 1 }, 1)
    ).rejects.toThrow('tidak mencukupi');
  });

  it('stok cukup → buat record & decrement', async () => {
    tx.product.findUnique.mockResolvedValue({ id: 1, stock: 10 });
    await stockService.createStockOut({ productId: 1, quantity: 3, reason: 'rusak' }, 7);

    expect(tx.stockOut.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productId: 1, quantity: 3, createdById: 7 }) })
    );
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { decrement: 3 } } })
    );
  });
});

// ── resolveRange ──────────────────────────────────────────────────────────────

describe('resolveRange', () => {
  it('from/to eksplisit menang atas preset', () => {
    const { from, to } = resolveRange({ range: '30', from: '2026-01-05', to: '2026-01-10' });

    expect(from).toEqual(startOfDay(new Date('2026-01-05')));
    expect(to).toEqual(endOfDay(new Date('2026-01-10')));
  });

  it("preset '7' = 7 hari terakhir termasuk hari ini", () => {
    const { from, to } = resolveRange({ range: '7' });
    const now = new Date();

    expect(from).toEqual(startOfDay(subDays(now, 6)));
    expect(to).toEqual(endOfDay(now));
  });

  it("preset 'month' mulai dari awal bulan", () => {
    const { from, to } = resolveRange({ range: 'month' });
    const now = new Date();

    expect(from).toEqual(startOfMonth(now));
    expect(to).toEqual(endOfDay(now));
  });

  it('tanpa parameter → default 7 hari terakhir', () => {
    const { from, to } = resolveRange({});
    const now = new Date();

    expect(from).toEqual(startOfDay(subDays(now, 6)));
    expect(to).toEqual(endOfDay(now));
  });

  it('period legacy 30 diperlakukan seperti preset 30 hari', () => {
    const { from } = resolveRange({ period: '30' });
    const now = new Date();

    expect(from).toEqual(startOfDay(subDays(now, 29)));
  });
});

// ── getProductMovements (kartu stok) ──────────────────────────────────────────

const product = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Kopi Susu',
  sku: 'KOPI-1',
  unit: 'pcs',
  hpp: 5000,
  stock: 0,
  isDeleted: false,
  category: { name: 'Minuman' },
  ...over,
});

/** Arahkan tiap jendela waktu ke data yang berbeda. */
function mockWindows(opts: {
  within?: { in?: number; out?: number; sold?: number; restored?: number };
  after?: { in?: number; out?: number; sold?: number; restored?: number };
}) {
  // Jendela "setelah rentang" dikenali dari batas `gt`; sisanya jendela rentang.
  const pick = (win: any) => (win?.gt ? opts.after : opts.within) ?? {};

  mocks.stockIn.findMany.mockImplementation(({ where }: any) => {
    const q = pick(where.date).in;
    return Promise.resolve(q ? [{ productId: 1, quantity: q }] : []);
  });
  mocks.stockOut.findMany.mockImplementation(({ where }: any) => {
    const q = pick(where.date).out;
    return Promise.resolve(q ? [{ productId: 1, quantity: q }] : []);
  });
  mocks.transactionItem.findMany.mockImplementation(({ where }: any) => {
    const t = where.transaction;
    if (t.status === 'cancelled') {
      const q = pick(t.cancelledAt).restored;
      return Promise.resolve(q ? [{ productId: 1, quantity: q }] : []);
    }
    const q = pick(t.date).sold;
    return Promise.resolve(q ? [{ productId: 1, quantity: q }] : []);
  });
}

describe('getProductMovements', () => {
  it('stok akhir berlabuh ke stok sistem saat rentang berakhir hari ini', async () => {
    // Rentang: masuk 10, terjual 3 → saldo awal 0. Stok sistem 7 → stok akhir 7.
    mockWindows({ within: { in: 10, sold: 3 } });
    mocks.product.findMany.mockResolvedValue([product({ stock: 7 })]);

    const res = await stockService.getProductMovements({ range: '30' });
    const row = res.products[0];

    expect(row.openingStock).toBe(0);
    expect(row.stockIn).toBe(10);
    expect(row.sold).toBe(3);
    expect(row.closingStock).toBe(7);
    expect(row.closingValue).toBe(35000); // 7 × 5000
  });

  it('mutasi setelah rentang dibatalkan dari stok sistem (rentang historis)', async () => {
    // Tidak ada mutasi di rentang. Setelah rentang ada 5 masuk, stok sistem 12.
    // Stok akhir rentang harus 7 — bukan 12 (stok sistem).
    mockWindows({ after: { in: 5 } });
    mocks.product.findMany.mockResolvedValue([product({ stock: 12 })]);

    const res = await stockService.getProductMovements({ from: '2026-01-01', to: '2026-01-31' });
    const row = res.products[0];

    expect(row.closingStock).toBe(7);
    expect(row.openingStock).toBe(7);
    expect(row.currentStock).toBe(12);
  });

  it('memetakan tiap sumber mutasi ke kolomnya masing-masing', async () => {
    mockWindows({ within: { in: 5, out: 2, sold: 4, restored: 1 } });
    mocks.product.findMany.mockResolvedValue([product({ stock: 0 })]);

    const res = await stockService.getProductMovements({ range: '7' });
    const row = res.products[0];

    expect(row.stockIn).toBe(5);
    expect(row.adjustOut).toBe(2);
    expect(row.sold).toBe(4);
    expect(row.adjustIn).toBe(1);
    // saldo awal + masuk + koreksi masuk − keluar − terjual = akhir
    expect(row.openingStock).toBe(0);
    expect(row.closingStock).toBe(0);
  });

  it('terjual hanya dari transaksi completed, penyesuaian + dari cancelled', async () => {
    await stockService.getProductMovements({ range: '7' });

    // Dua jendela (rentang & setelah rentang) × dua status. Urutan panggilan tidak
    // dijamin karena query dijalankan paralel, jadi diperiksa sebagai himpunan.
    const calls = mocks.transactionItem.findMany.mock.calls.map(
      (c: any) => c[0].where.transaction,
    );
    expect(calls.filter((t: any) => t.status === 'completed')).toHaveLength(2);
    expect(calls.filter((t: any) => t.status === 'cancelled')).toHaveLength(2);

    const cancelled = calls.find((t: any) => t.status === 'cancelled');
    // Pembatalan memakai cancelledAt, bukan tanggal transaksi.
    expect(cancelled.cancelledAt).toBeDefined();
    expect(cancelled.date).toBeUndefined();
  });

  it('menjumlahkan total dan melewati produk tanpa saldo maupun aktivitas', async () => {
    mockWindows({ within: { in: 10, sold: 3 } });
    mocks.product.findMany.mockResolvedValue([
      product({ id: 1, stock: 7 }),
      product({ id: 2, name: 'Produk Kosong', sku: 'X-1', stock: 0 }),
    ]);

    const res = await stockService.getProductMovements({ range: '30' });

    expect(res.products).toHaveLength(1);
    expect(res.products[0].productId).toBe(1);
    expect(res.totals.closingStock).toBe(7);
    expect(res.totals.closingValue).toBe(35000);
    expect(res.range.from).toBeDefined();
    expect(res.range.to).toBeDefined();
  });
});
