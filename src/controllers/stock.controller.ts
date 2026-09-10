import { Request, Response } from 'express';
import { stockService } from '../services/stock.service';
import { isPositiveInteger, isNonNegativeNumber } from '../middlewares/validate.middleware';

// Helper: parse ?from query param
function parseFromDate(from?: string): Date | undefined {
  if (!from) return undefined;
  const days = Number(from);
  if (!isNaN(days) && days > 0) {
    const { startOfDay } = require('date-fns');
    const { subDays } = require('date-fns');
    return startOfDay(subDays(new Date(), days));
  }
  const parsed = new Date(from);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

export const stockController = {
  // === STOCK IN ===

  getStockIn: async (req: Request, res: Response): Promise<void> => {
    try {
      const from = parseFromDate(req.query.from as string | undefined);
      const data = await stockService.getAllStockIn(from);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ✅ DIUBAH: response sekarang menyertakan hppUpdate info
  createStockIn: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { productId, quantity, buyPrice } = req.body;

      if (!productId || !quantity || !buyPrice) {
        res.status(400).json({ success: false, message: 'Produk, Jumlah, dan Harga Beli wajib diisi!' });
        return;
      }

      if (!isPositiveInteger(quantity)) {
        res.status(400).json({ success: false, message: 'Jumlah stok masuk harus bilangan bulat lebih dari 0' });
        return;
      }

      if (!isNonNegativeNumber(buyPrice)) {
        res.status(400).json({ success: false, message: 'Harga beli tidak boleh negatif' });
        return;
      }

      const newStockIn = await stockService.createStockIn(req.body, userId);
      res.status(201).json({
        success: true,
        message: 'Stok masuk berhasil dicatat',
        data: newStockIn,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // === STOCK OUT ===

  getStockOut: async (req: Request, res: Response): Promise<void> => {
    try {
      const from = parseFromDate(req.query.from as string | undefined);
      const data = await stockService.getAllStockOut(from);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  createStockOut: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { productId, quantity, reason } = req.body;

      if (!productId || !quantity || !reason) {
        res.status(400).json({ success: false, message: 'Produk, Jumlah, dan Alasan wajib diisi!' });
        return;
      }

      if (!isPositiveInteger(quantity)) {
        res.status(400).json({ success: false, message: 'Jumlah stok keluar harus bilangan bulat lebih dari 0' });
        return;
      }

      const newStockOut = await stockService.createStockOut(req.body, userId);
      res.status(201).json({ success: true, message: 'Stok keluar berhasil dicatat', data: newStockOut });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // === STOCK REPORT ===

  getReport: async (req: Request, res: Response): Promise<void> => {
    try {
      const period = req.query.period as string | undefined;
      const data = await stockService.getReport(period);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
};