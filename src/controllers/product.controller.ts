import { Request, Response } from 'express';
import { productService } from '../services/product.service';

export const productController = {
  getAll: async (req: Request, res: Response): Promise<void> => {
    try {
      const products = await productService.getAllProducts();
      res.json({ success: true, data: products });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getById: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string);
      const product = await productService.getProductById(id);

      if (!product) {
        res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
        return;
      }

      res.json({ success: true, data: product });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  create: async (req: Request, res: Response): Promise<void> => {
    try {
      // Validasi sederhana
      const { name, sku, price, hpp, categoryId, unit } = req.body;
      if (!name || !sku || price === undefined || hpp === undefined || !categoryId || !unit) {
        res.status(400).json({ success: false, message: 'Data produk belum lengkap!' });
        return;
      }

      const newProduct = await productService.createProduct(req.body);
      res.status(201).json({ success: true, message: 'Produk berhasil ditambahkan', data: newProduct });
    } catch (error: any) {
      // Menangani error jika SKU duplikat
      if (error.code === 'P2002' && error.meta?.target?.includes('sku')) {
        res.status(400).json({ success: false, message: 'SKU (Kode Barang) sudah digunakan!' });
        return;
      }
      // Supplier yang dirujuk tidak ada
      if (error.code === 'P2003') {
        res.status(400).json({ success: false, message: 'Supplier tidak ditemukan!' });
        return;
      }
      res.status(500).json({ success: false, message: error.message });
    }
  },

  update: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string);
      const updatedProduct = await productService.updateProduct(id, req.body);
      res.json({ success: true, message: 'Produk berhasil diubah', data: updatedProduct });
    } catch (error: any) {
      if (error.code === 'P2003') {
        res.status(400).json({ success: false, message: 'Supplier tidak ditemukan!' });
        return;
      }
      res.status(500).json({ success: false, message: error.message });
    }
  },

  delete: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string);
      await productService.deleteProduct(id);
      res.json({ success: true, message: 'Produk berhasil dihapus' });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};