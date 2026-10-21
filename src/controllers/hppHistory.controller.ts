import { Request, Response } from 'express';
import { hppHistoryService } from '../services/hppHistory.service';

export const hppHistoryController = {
  /**
   * GET /api/hpp-history
   * Query params: productId, source, from, to, limit
   */
  getAll: async (req: Request, res: Response): Promise<void> => {
    try {
      const { productId, source, from, to, limit } = req.query;

      const history = await hppHistoryService.getAllHppHistory({
        ...(productId ? { productId: parseInt(productId as string) } : {}),
        ...(source ? { source: source as string } : {}),
        ...(from ? { from: new Date(from as string) } : {}),
        ...(to ? { to: new Date(to as string) } : {}),
        ...(limit ? { limit: parseInt(limit as string) } : {}),
      });

      res.json({ success: true, data: history });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * GET /api/hpp-history/product/:productId
   */
  getByProduct: async (req: Request, res: Response): Promise<void> => {
    try {
      const productId = parseInt(req.params.productId as string);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const history = await hppHistoryService.getHppHistory(productId, limit);

      res.json({ success: true, data: history });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * POST /api/hpp-history/manual
   * Body: { productId, newHpp }
   * Untuk update HPP manual dari halaman edit produk
   */
  updateManual: async (req: Request, res: Response): Promise<void> => {
    try {
      const { productId, newHpp } = req.body;

      if (!productId || newHpp === undefined) {
        res.status(400).json({
          success: false,
          message: 'productId dan newHpp wajib diisi',
        });
        return;
      }

      // Pelaku perubahan HPP diambil dari claim `userId` — claim yang sama
      // dipakai middleware verifyToken dan seluruh controller lain.
      //
      // Penting: nama claim harus PERSIS `userId`. JWT tidak punya claim `id`,
      // jadi membaca `user?.id` selalu menghasilkan undefined dan
      // membiarkan baris audit tersimpan tanpa pelaku (createdBy = NULL).
      // Cast `(req as any)` sengaja dihilangkan supaya ketidakcocokan nama claim
      // ketahuan oleh type-checker, bukan diam-diam merusak jejak audit.
      const createdBy = req.user?.userId;

      if (!createdBy) {
        res.status(401).json({
          success: false,
          message: 'Sesi tidak valid.',
        });
        return;
      }

      const result = await hppHistoryService.updateHppManual(
        parseInt(productId),
        parseFloat(newHpp),
        createdBy
      );

      res.json({
        success: true,
        message: 'HPP berhasil diperbarui',
        data: result,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
};