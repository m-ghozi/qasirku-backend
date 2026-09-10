import { vi, describe, it, expect, beforeEach } from 'vitest';

// tx mock dipakai di dalam prisma.$transaction(cb) → cb(tx).
// vi.hoisted supaya tersedia saat factory vi.mock dievaluasi (di-hoist ke atas).
const mocks = vi.hoisted(() => ({
  tx: {
    product: { findMany: vi.fn(), update: vi.fn() },
    transaction: { create: vi.fn() },
    transactionItem: { create: vi.fn() },
  },
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    $transaction: (cb: any) => cb(mocks.tx),
  },
}));

import { transactionService } from '../../src/services/transaction.service';

const { tx } = mocks;

// Produk default: harga 10000, hpp 6000, stok 5
const KOPI = { id: 1, name: 'Kopi', sku: 'KOPI-01', price: 10000, hpp: 6000, stock: 5, isDeleted: false };

beforeEach(() => {
  vi.clearAllMocks();
  tx.product.findMany.mockResolvedValue([KOPI]);
  tx.transaction.create.mockResolvedValue({ id: 99, receiptNumber: 'TX-TEST' });
  tx.transactionItem.create.mockResolvedValue({});
  tx.product.update.mockResolvedValue({});
});

describe('createTransaction — validasi', () => {
  it('keranjang kosong → throw', async () => {
    await expect(transactionService.createTransaction({ items: [] }, 1))
      .rejects.toThrow('Keranjang belanja kosong');
  });

  it('produk tidak ditemukan → throw', async () => {
    tx.product.findMany.mockResolvedValue([]); // tidak ada produk
    await expect(
      transactionService.createTransaction({ items: [{ productId: 1, quantity: 1 }] }, 1)
    ).rejects.toThrow('tidak ditemukan');
  });

  it('stok kurang saat completed → throw', async () => {
    tx.product.findMany.mockResolvedValue([{ ...KOPI, stock: 1 }]);
    await expect(
      transactionService.createTransaction(
        { items: [{ productId: 1, quantity: 2 }], paymentAmount: 99999, status: 'completed' },
        1
      )
    ).rejects.toThrow('tidak mencukupi');
  });

  it('diskon persentase > 100 → throw', async () => {
    await expect(
      transactionService.createTransaction(
        { items: [{ productId: 1, quantity: 1, discountType: 'percentage', discountValue: 150 }], paymentAmount: 99999 },
        1
      )
    ).rejects.toThrow('0–100');
  });

  it('diskon nominal item melebihi total → throw', async () => {
    await expect(
      transactionService.createTransaction(
        { items: [{ productId: 1, quantity: 1, discountType: 'nominal', discountValue: 99999 }], paymentAmount: 99999 },
        1
      )
    ).rejects.toThrow('Diskon nominal');
  });

  it('pembayaran kurang dari total → throw', async () => {
    await expect(
      transactionService.createTransaction(
        { items: [{ productId: 1, quantity: 2 }], paymentAmount: 5000, status: 'completed' },
        1
      )
    ).rejects.toThrow('kurang dari total');
  });
});

describe('createTransaction — kalkulasi (happy path completed)', () => {
  it('hitung subtotal/total/profit/change & decrement stok', async () => {
    const result = await transactionService.createTransaction(
      { items: [{ productId: 1, quantity: 2 }], paymentAmount: 25000, status: 'completed' },
      7
    );

    // 10000*2 = 20000, hpp 6000*2 = 12000 → profit 8000, change 25000-20000 = 5000
    const created = tx.transaction.create.mock.calls[0][0].data;
    expect(created.subtotal).toBe(20000);
    expect(created.total).toBe(20000);
    expect(created.profit).toBe(8000);
    expect(created.change).toBe(5000);
    expect(created.status).toBe('completed');
    expect(created.createdById).toBe(7);

    // stok dikurangi 2
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { decrement: 2 } } })
    );

    expect(result.items[0].totalPrice).toBe(20000);
    expect(result.items[0].profit).toBe(8000);
  });

  it('item yang dikembalikan menyertakan relasi product (name & sku)', async () => {
    // Response create harus sekaya getById — klien memakai product.name untuk
    // nama produk di struk; tanpa ini jatuh ke "Produk #<id>".
    const result = await transactionService.createTransaction(
      { items: [{ productId: 1, quantity: 1 }], paymentAmount: 10000, status: 'completed' },
      1
    );

    expect(result.items[0].product).toEqual({ id: 1, name: 'Kopi', sku: 'KOPI-01' });
  });

  it('diskon persentase 10% per item → totalPrice & profit benar', async () => {
    await transactionService.createTransaction(
      { items: [{ productId: 1, quantity: 2, discountType: 'percentage', discountValue: 10 }], paymentAmount: 99999, status: 'completed' },
      1
    );
    // gross 20000, diskon 2000 → total 18000, profit 18000-12000 = 6000
    const created = tx.transaction.create.mock.calls[0][0].data;
    expect(created.total).toBe(18000);
    expect(created.profit).toBe(6000);
  });
});

describe('createTransaction — hold bill (open)', () => {
  it('tidak validasi stok, tidak decrement, change 0', async () => {
    // stok 1, qty 2 → kalau completed pasti throw; open harus lolos
    tx.product.findMany.mockResolvedValue([{ ...KOPI, stock: 1 }]);

    await transactionService.createTransaction(
      { items: [{ productId: 1, quantity: 2 }], status: 'open' },
      1
    );

    const created = tx.transaction.create.mock.calls[0][0].data;
    expect(created.status).toBe('open');
    expect(created.change).toBe(0);
    expect(created.paymentAmount).toBe(0);
    expect(tx.product.update).not.toHaveBeenCalled();
  });
});
