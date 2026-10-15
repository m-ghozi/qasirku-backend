import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/index';
import { prisma } from '../../src/lib/prisma';
import { getJwtSecret } from '../../src/utils/auth';

// Integration: GET /api/products/next-sku — SKU usulan untuk form tambah produk.
// Prefix sengaja "NXS" agar tidak bentrok dengan fixture test lain di DB kasir_test.
describe('Produk — SKU usulan per kategori', () => {
  let token: string;
  let kategoriKosongId: number;
  let kategoriIsiId: number;
  let kategoriBarcodeId: number;

  const skus = ['NXS-007', 'NXS-003', '8000000000009'];
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const nextSku = (categoryId: number | string) =>
    auth(request(app).get('/api/products/next-sku').query({ categoryId }));

  beforeAll(async () => {
    token = jwt.sign({ id: 1, role: 'owner' }, getJwtSecret(), { expiresIn: '1h' });

    const [kosong, isi, barcode] = await Promise.all([
      prisma.category.create({ data: { name: 'NXS Kosong', color: '#111111', icon: '🧪' } }),
      prisma.category.create({ data: { name: 'NXS Isi', color: '#222222', icon: '🧪' } }),
      prisma.category.create({ data: { name: 'NXS Barcode', color: '#333333', icon: '🧪' } }),
    ]);
    kategoriKosongId = kosong.id;
    kategoriIsiId = isi.id;
    kategoriBarcodeId = barcode.id;

    const base = { price: 1000, hpp: 500, stock: 0, unit: 'pcs' };
    // Dibuat berurutan supaya urutan createdAt dapat diprediksi.
    await prisma.product.create({
      data: { ...base, name: 'NXS Lama', sku: 'NXS-003', categoryId: kategoriBarcodeId },
    });
    await prisma.product.create({
      data: { ...base, name: 'NXS Barcode', sku: '8000000000009', categoryId: kategoriBarcodeId },
    });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { sku: { in: skus } } });
    await prisma.category.deleteMany({
      where: { id: { in: [kategoriKosongId, kategoriIsiId, kategoriBarcodeId] } },
    });
    await prisma.$disconnect();
  });

  it('kategori tanpa SKU berpola → prefix dari nama kategori, mulai dari 001', async () => {
    const res = await nextSku(kategoriKosongId);
    expect(res.status).toBe(200);
    expect(res.body.data.sku).toBe('NXS-001');
  });

  it('melanjutkan nomor dari SKU terakhir di kategori itu', async () => {
    await prisma.product.create({
      data: { name: 'NXS Baru', sku: skus[0], categoryId: kategoriIsiId, price: 1000, hpp: 500, unit: 'pcs' },
    });

    const res = await nextSku(kategoriIsiId);
    expect(res.status).toBe(200);
    expect(res.body.data.sku).toBe('NXS-008');
  });

  it('melewati SKU barcode angka murni dan memakai SKU berpola terakhir', async () => {
    const res = await nextSku(kategoriBarcodeId);
    expect(res.status).toBe(200);
    expect(res.body.data.sku).toBe('NXS-004');
  });

  it('categoryId tidak valid → 400', async () => {
    const res = await nextSku('abc');
    expect(res.status).toBe(400);
  });

  it('kategori tidak ada → 404', async () => {
    const res = await nextSku(999999);
    expect(res.status).toBe(404);
  });
});
