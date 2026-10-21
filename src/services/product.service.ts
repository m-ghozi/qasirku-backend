import { prisma } from '../lib/prisma';
import { buildMeta, parsePagination } from '../utils/pagination';
import { nextSku, parseSku } from '../utils/sku';

// Relasi supplier ikut dikirim agar nama supplier bisa langsung ditampilkan.
const supplierSelect = { select: { id: true, name: true } };

// Batas pencarian nomor bebas. Dalam praktiknya hampir selalu berhenti di
// percobaan pertama; batas ini hanya agar permintaan tidak pernah menggantung.
const MAX_SKU_ATTEMPTS = 200;

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

  /**
   * SKU usulan untuk produk baru di satu kategori: lanjutan dari SKU terakhir
   * yang dipakai kategori itu (mis. terakhir ATK-035 → usul ATK-036).
   *
   * Produk yang sudah dihapus ikut diperhitungkan — SKU-nya masih memegang slot
   * `@unique` di database, jadi nomornya tidak boleh dipakai ulang.
   * Mengembalikan null kalau kategorinya tidak ada / sudah dihapus.
   */
  getNextSku: async (categoryId: number) => {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, isDeleted: false },
      select: { name: true },
    });
    if (!category) return null;

    const products = await prisma.product.findMany({
      where: { categoryId },
      select: { sku: true },
      // Sama seperti urutan daftar produk: yang paling baru dulu.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    // SKU terakhir = SKU produk terbaru yang polanya masih bisa dilanjutkan.
    // Produk ber-SKU barcode angka murni dilewati, bukan dijadikan alasan
    // menganggap kategori ini belum punya SKU.
    const lastSku = products.find((p) => parseSku(p.sku) !== null)?.sku ?? null;

    // Prefix bisa saja sudah dipakai kategori lain, atau nomornya terpakai
    // produk lama — jadi cari nomor pertama yang benar-benar masih bebas.
    for (let step = 0; step < MAX_SKU_ATTEMPTS; step++) {
      const candidate = nextSku(lastSku, category.name, step);
      const taken = await prisma.product.findUnique({
        where: { sku: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }

    // Praktis tidak terjadi: butuh 200 SKU berurutan terpakai semua.
    throw new Error('Tidak menemukan SKU yang masih bebas untuk kategori ini');
  },

  createProduct: async (data: any) => {
    const normalize = (v: any) => {
      if (v === undefined || v === null || v === '') return 0;
      let str = String(v);
      if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
      else str = str.replace(',', '.');
      return Number(str) || 0;
    };

    return await prisma.product.create({
      data: {
        name: data.name,
        sku: data.sku,
        categoryId: data.categoryId,
        supplierId: data.supplierId ? Number(data.supplierId) : null,
        price: normalize(data.price),
        hpp: normalize(data.hpp),
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

    const normalize = (v: any) => {
      if (v === undefined || v === null || v === '') return undefined;
      let str = String(v);
      if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
      else str = str.replace(',', '.');
      const n = Number(str);
      return Number.isFinite(n) ? n : undefined;
    };

    return await prisma.product.update({
      where: { id },
      data: {
        name: data.name,
        sku: data.sku,
        categoryId: data.categoryId,
        supplierId,
        price: normalize(data.price),
        hpp: normalize(data.hpp),
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