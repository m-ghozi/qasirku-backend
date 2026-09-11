import { prisma } from '../lib/prisma';

// Relasi supplier ikut dikirim agar nama supplier bisa langsung ditampilkan.
const supplierSelect = { select: { id: true, name: true } };

export const productService = {
  getAllProducts: async () => {
    return await prisma.product.findMany({
      where: { isDeleted: false },
      include: { category: true, supplier: supplierSelect },
      orderBy: { createdAt: 'desc' }
    });
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