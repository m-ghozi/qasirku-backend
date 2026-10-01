import { prisma } from '../lib/prisma';
import { buildMeta, parsePagination } from '../utils/pagination';

// Relasi supplier ikut dikirim agar nama supplier bisa langsung ditampilkan.
const supplierSelect = { select: { id: true, name: true } };

export interface ProductListOptions {
  page?: unknown;
  limit?: unknown;
  search?: string;
  categoryId?: number;
}

export const productService = {
  // Mengembalikan { items, meta } — count dijalankan dalam $transaction yang sama
  // agar total dan barisnya berasal dari snapshot yang konsisten.
  getAllProducts: async (opts: ProductListOptions = {}) => {
    const { page, limit, skip, take } = parsePagination(opts);

    const where = {
      isDeleted: false,
      ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
      // Kolom yang dicari sengaja disamakan dengan filter sisi-klien sebelumnya
      // (nama, SKU, deskripsi). MySQL default collation utf8mb4_*_ci sudah
      // case-insensitive, jadi `contains` cocok tanpa mode: 'insensitive'
      // (opsi itu hanya ada di Postgres/Mongo).
      ...(opts.search
        ? {
            OR: [
              { name: { contains: opts.search } },
              { sku: { contains: opts.search } },
              { description: { contains: opts.search } },
            ],
          }
        : {}),
    };

    // id desc sebagai tiebreaker: tanpa ini baris dengan createdAt kembar bisa
    // terlewat atau terduplikasi saat berpindah halaman.
    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: { category: true, supplier: supplierSelect },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      prisma.product.count({ where }),
    ]);

    return { items, meta: buildMeta(page, limit, total) };
  },

  getProductById: async (id: number) => {
    return await prisma.product.findFirst({
      where: { id, isDeleted: false },
      include: { category: true, supplier: supplierSelect }
    });
  },

  createProduct: async (data: any) => {
    return await prisma.product.create({
      data: {
        name: data.name,
        sku: data.sku,
        categoryId: data.categoryId,
        supplierId: data.supplierId ? Number(data.supplierId) : null,
        price: data.price,
        hpp: data.hpp,
        stock: data.stock || 0,
        unit: data.unit,
        description: data.description,
        barcode: data.barcode,
        photo: data.photo,
      }
    });
  },

  updateProduct: async (id: number, data: any) => {
    // undefined = kolom tidak disentuh; null/kosong = supplier dikosongkan.
    const supplierId =
      data.supplierId === undefined ? undefined : data.supplierId ? Number(data.supplierId) : null;

    return await prisma.product.update({
      where: { id },
      data: {
        name: data.name,
        sku: data.sku,
        categoryId: data.categoryId,
        supplierId,
        price: data.price,
        hpp: data.hpp,
        stock: data.stock,
        unit: data.unit,
        description: data.description,
        barcode: data.barcode,
        photo: data.photo,
      }
    });
  },

  deleteProduct: async (id: number) => {
    return await prisma.product.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() }
    });
  }
};