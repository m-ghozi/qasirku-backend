import { Request, Response } from 'express';
import { endOfDay, startOfDay, subDays } from 'date-fns';
import { stockService, type RangeParams } from '../services/stock.service';
import { isPositiveInteger, isNonNegativeNumber } from '../middlewares/validate.middleware';
import { parseOptionalId } from '../utils/pagination';

// Helper: parse ?from query param.
// - angka (mis. "7")          → 7 hari terakhir
// - tanggal (mis. "2026-09-19") → awal hari itu
// startOfDay dipakai pada cabang tanggal karena `new Date('2026-09-19')` diurai
// sebagai tengah malam UTC, yang di WIB berarti jam 07:00 — tanpa ini rentang
// tanggal akan membuang riwayat dini hari.
function parseFromDate(from?: string): Date | undefined {
  if (!from) return undefined;
  const days = Number(from);
  if (!isNaN(days) && days > 0) return startOfDay(subDays(new Date(), days));
  const parsed = new Date(from);
  return isNaN(parsed.getTime()) ? undefined : startOfDay(parsed);
}

// Helper: parse ?to → akhir hari, supaya tanggal yang dipilih inklusif.
function parseToDate(to?: string): Date | undefined {
  if (!to) return undefined;
  const parsed = new Date(to);
  return isNaN(parsed.getTime()) ? undefined : endOfDay(parsed);
}

// Helper: parameter rentang laporan.
// Nilai mentah diteruskan apa adanya — penganalisisan (preset / from-to / period)
// ada di `resolveRange` supaya semua arti "rentang" terkumpul di satu tempat.
function parseRangeParams(query: Request['query']): RangeParams {
  return {
    range: query.range as string | undefined,
    from: query.from as string | undefined,
    to: query.to as string | undefined,
    period: query.period as string | undefined,
  };
}

export const stockController = {
  // === STOCK IN ===

  // Query: page, limit, supplierId, from, to.
  getStockIn: async (req: Request, res: Response): Promise<void> => {
    try {
      const { items, meta } = await stockService.getAllStockIn({
        from: parseFromDate(req.query.from as string | undefined),
        to: parseToDate(req.query.to as string | undefined),
        supplierId: parseOptionalId(req.query.supplierId),
        page: req.query.page,
        limit: req.query.limit,
      });
      res.json({ success: true, data: items, meta });
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

  // Query: page, limit, from, to.
  getStockOut: async (req: Request, res: Response): Promise<void> => {
    try {
      const { items, meta } = await stockService.getAllStockOut({
        from: parseFromDate(req.query.from as string | undefined),
        to: parseToDate(req.query.to as string | undefined),
        page: req.query.page,
        limit: req.query.limit,
      });
      res.json({ success: true, data: items, meta });
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

  // Query: range (today|7|30|month|all), from, to, atau period (lama).
  getReport: async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await stockService.getReport(parseRangeParams(req.query));
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Kartu stok per produk untuk satu rentang. Query sama dengan getReport.
  getMovements: async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await stockService.getProductMovements(parseRangeParams(req.query));
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
};