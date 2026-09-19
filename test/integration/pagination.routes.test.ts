import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/index';
import { prisma } from '../../src/lib/prisma';
import { getJwtSecret } from '../../src/utils/auth';

// Integration: pagination offset (page/limit) + meta pada /products, /stocks/in,
// /stocks/out. Hit DB kasir_test (lihat .env.test).
//
// Setiap query dibatasi ke fixture milik test ini (categoryId / supplierId)
// supaya angka `total` tidak terpengaruh data lain yang kebetulan ada di DB.
describe('Pagination — offset + meta', () => {
  let token: string;
  let categoryId: number;
  let supplierId: number;
  let productIds: number[] = [];

  const BASE_SKUS = ['PAG-001', 'PAG-002', 'PAG-003', 'PAG-004', 'PAG-005'];
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    token = jwt.sign({ id: 1, role: 'owner' }, getJwtSecret(), { expiresIn: '1h' });

    const category = await prisma.category.create({
      data: { name: 'PAG Kategori', color: '#0f0f0f', icon: '🧪' },
    });
    categoryId = category.id;

    const supplier = await prisma.supplier.create({ data: { name: 'PAG Supplier' } });
    supplierId = supplier.id;

    // 5 produk; "Kopi" hanya pada satu di antaranya agar uji ?search= tegas.
    const names = ['PAG Kopi', 'PAG Teh', 'PAG Gula', 'PAG Garam', 'PAG Merica'];
    const products = await Promise.all(
      BASE_SKUS.map((sku, i) =>
        prisma.product.create({
          data: {
            name: names[i],
            sku,
            categoryId,
            supplierId,
            price: 10000,
            hpp: 5000,
            stock: 10,
            unit: 'pcs',
          },
        }),
      ),
    );
    productIds = products.map(p => p.id);

    // 5 stock in pada supplier ini, tanggal tersebar agar uji rentang pasti.
    const dates = ['2026-01-01', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05'];
    await Promise.all(
      dates.map((d, i) =>
        prisma.stockIn.create({
          data: {
            productId: productIds[i],
            supplierId,
            quantity: 5,
            buyPrice: 1000,
            totalPrice: 5000,
            date: new Date(`${d}T10:00:00`),
          },
        }),
      ),
    );

    // Stock out tidak punya kolom supplier, jadi dibedakan lewat alasan unik.
    await Promise.all(
      dates.map((d, i) =>
        prisma.stockOut.create({
          data: {
            productId: productIds[i],
            quantity: 2,
            reason: `PAG-${i}`,
            date: new Date(`${d}T10:00:00`),
          },
        }),
      ),
    );
  });

  afterAll(async () => {
    await prisma.stockIn.deleteMany({ where: { supplierId } });
    await prisma.stockOut.deleteMany({ where: { reason: { startsWith: 'PAG-' } } });
    await prisma.product.deleteMany({ where: { sku: { in: BASE_SKUS } } });
    await prisma.supplier.delete({ where: { id: supplierId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  describe('GET /api/products', () => {
    it('mengembalikan data sebagai array + meta', async () => {
      const res = await auth(request(app).get(`/api/products?categoryId=${categoryId}`));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 5, totalPages: 1 });
    });

    it('memotong daftar sesuai limit dan menggeser halaman', async () => {
      const page1 = await auth(
        request(app).get(`/api/products?categoryId=${categoryId}&limit=2&page=1`),
      );
      const page2 = await auth(
        request(app).get(`/api/products?categoryId=${categoryId}&limit=2&page=2`),
      );
      const page3 = await auth(
        request(app).get(`/api/products?categoryId=${categoryId}&limit=2&page=3`),
      );

      expect(page1.body.data).toHaveLength(2);
      expect(page2.body.data).toHaveLength(2);
      expect(page3.body.data).toHaveLength(1); // sisa 1
      expect(page1.body.meta).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 });

      // Halaman harus saling lepas — ini yang gagal kalau skip/orderBy salah.
      const ids = (r: any) => r.body.data.map((p: any) => p.id);
      const overlap = ids(page1).filter((id: number) => ids(page2).includes(id));
      expect(overlap).toEqual([]);
      expect(new Set([...ids(page1), ...ids(page2), ...ids(page3)]).size).toBe(5);
    });

    it('menyaring dengan ?search= pada nama', async () => {
      const res = await auth(
        request(app).get(`/api/products?categoryId=${categoryId}&search=Kopi`),
      );

      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].name).toBe('PAG Kopi');
    });

    it('mengabaikan page/limit tidak valid, bukan menolak request', async () => {
      const res = await auth(
        request(app).get(`/api/products?categoryId=${categoryId}&page=abc&limit=-5`),
      );

      expect(res.status).toBe(200);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(20);
    });

    it('membatasi limit pada nilai maksimum', async () => {
      const res = await auth(
        request(app).get(`/api/products?categoryId=${categoryId}&limit=9999`),
      );

      expect(res.status).toBe(200);
      expect(res.body.meta.limit).toBe(100);
    });

    it('halaman di luar rentang mengembalikan array kosong dengan meta yang benar', async () => {
      const res = await auth(
        request(app).get(`/api/products?categoryId=${categoryId}&page=99&limit=2`),
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toMatchObject({ page: 99, total: 5, totalPages: 3 });
    });

    it('?categoryId= yang tidak valid diabaikan, bukan error', async () => {
      const res = await auth(request(app).get('/api/products?categoryId=abc'));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/stocks/in', () => {
    it('mengembalikan meta dan memfilter per supplier', async () => {
      const res = await auth(request(app).get(`/api/stocks/in?supplierId=${supplierId}`));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(5);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 20, total: 5, totalPages: 1 });
      expect(res.body.data.every((r: any) => r.supplierId === supplierId)).toBe(true);
    });

    it('memfilter rentang tanggal secara inklusif', async () => {
      const res = await auth(
        request(app).get(
          `/api/stocks/in?supplierId=${supplierId}&from=2026-01-01&to=2026-01-03`,
        ),
      );

      expect(res.status).toBe(200);
      // 2026-01-05 sengaja di luar rentang → tersisa 4.
      expect(res.body.meta.total).toBe(4);
      expect(res.body.data).toHaveLength(4);
    });

    it('berpaginasi tanpa tumpang tindih', async () => {
      const page1 = await auth(
        request(app).get(`/api/stocks/in?supplierId=${supplierId}&limit=2&page=1`),
      );
      const page2 = await auth(
        request(app).get(`/api/stocks/in?supplierId=${supplierId}&limit=2&page=2`),
      );

      expect(page1.body.data).toHaveLength(2);
      expect(page2.body.data).toHaveLength(2);
      expect(page1.body.meta).toMatchObject({ total: 5, totalPages: 3 });

      const ids1 = page1.body.data.map((r: any) => r.id);
      const ids2 = page2.body.data.map((r: any) => r.id);
      expect(ids1.filter((id: number) => ids2.includes(id))).toEqual([]);
    });

    it('tanpa from/to menampilkan semua riwayat (tidak mewarisi default 7 hari)', async () => {
      const res = await auth(request(app).get(`/api/stocks/in?supplierId=${supplierId}`));

      // Fixture bertanggal Januari 2026; kalau default 7 hari ikut terbawa,
      // total akan 0 dan test ini gagal.
      expect(res.body.meta.total).toBe(5);
    });
  });

  describe('GET /api/stocks/out', () => {
    it('mengembalikan meta dan rentang tanggal inklusif', async () => {
      const all = await auth(request(app).get('/api/stocks/out?limit=100'));
      const ranged = await auth(
        request(app).get('/api/stocks/out?limit=100&from=2026-01-01&to=2026-01-03'),
      );

      expect(all.status).toBe(200);
      expect(Array.isArray(all.body.data)).toBe(true);
      expect(all.body.meta.limit).toBe(100);

      const pagReasons = ranged.body.data
        .map((r: any) => r.reason)
        .filter((r: string) => r.startsWith('PAG-'));
      expect(pagReasons).toHaveLength(4); // PAG-4 (2026-01-05) di luar rentang
    });
  });
});
