import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/index';
import { prisma } from '../../src/lib/prisma';
import { getJwtSecret } from '../../src/utils/auth';

// Integration: relasi opsional Product → Supplier, hit DB kasir_test (lihat .env.test).
describe('Produk — relasi supplier opsional', () => {
  let token: string;
  let categoryId: number;
  let supplierId: number;

  const skus = ['ITG-SUP-001', 'ITG-SUP-002', 'ITG-SUP-003', 'ITG-SUP-004', 'ITG-SUP-005'];
  const baseProduct = () => ({
    name: 'Produk ITG',
    categoryId,
    price: 15000,
    hpp: 10000,
    stock: 0,
    unit: 'pcs',
  });
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    token = jwt.sign({ id: 1, role: 'owner' }, getJwtSecret(), { expiresIn: '1h' });

    const category = await prisma.category.create({
      data: { name: 'ITG Kategori', color: '#123456', icon: '🧪' },
    });
    categoryId = category.id;

    const supplier = await prisma.supplier.create({ data: { name: 'ITG Supplier' } });
    supplierId = supplier.id;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { sku: { in: skus } } });
    await prisma.supplier.delete({ where: { id: supplierId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('menyimpan supplierId dan mengembalikan relasi supplier', async () => {
    const created = await auth(
      request(app).post('/api/products').send({ ...baseProduct(), sku: skus[0], supplierId }),
    );
    expect(created.status).toBe(201);
    expect(created.body.data.supplierId).toBe(supplierId);

    const detail = await auth(request(app).get(`/api/products/${created.body.data.id}`));
    expect(detail.status).toBe(200);
    expect(detail.body.data.supplier).toMatchObject({ id: supplierId, name: 'ITG Supplier' });
  });

  it('produk tanpa supplier tetap boleh dibuat', async () => {
    const res = await auth(request(app).post('/api/products').send({ ...baseProduct(), sku: skus[1] }));
    expect(res.status).toBe(201);

    // Respons create tidak menyertakan relasi — cek lewat endpoint detail.
    const detail = await auth(request(app).get(`/api/products/${res.body.data.id}`));
    expect(detail.body.data.supplierId).toBeNull();
    expect(detail.body.data.supplier).toBeNull();
  });

  it('mengosongkan supplier lewat update (supplierId null)', async () => {
    const created = await auth(
      request(app).post('/api/products').send({ ...baseProduct(), sku: skus[2], supplierId }),
    );
    expect(created.body.data.supplierId).toBe(supplierId);

    const updated = await auth(
      request(app).put(`/api/products/${created.body.data.id}`).send({ supplierId: null }),
    );
    expect(updated.status).toBe(200);
    expect(updated.body.data.supplierId).toBeNull();
  });

  it('supplierId yang tidak ada → 400', async () => {
    const res = await auth(
      request(app).post('/api/products').send({ ...baseProduct(), sku: skus[3], supplierId: 999999 }),
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Supplier tidak ditemukan!');
  });

  it('supplierId tidak valid → 400', async () => {
    const res = await auth(
      request(app).post('/api/products').send({ ...baseProduct(), sku: skus[4], supplierId: 'abc' }),
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Supplier tidak valid');
  });
});
