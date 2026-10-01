import { prisma } from '../lib/prisma';
import { startOfDay, subDays, addDays } from 'date-fns';
import { hppHistoryService } from './hppHistory.service';
import { buildMeta, dateRangeWhere, parsePagination } from '../utils/pagination';

// ── Helper ────────────────────────────────────────────────────────────────────

function parsePeriod(period?: string): Date {
  const days = Number(period);
  if (!isNaN(days) && days > 0) return startOfDay(subDays(new Date(), days));
  const parsed = period ? new Date(period) : null;
  return parsed && !isNaN(parsed.getTime()) ? parsed : startOfDay(subDays(new Date(), 7));
}

export interface StockListOptions {
  from?: Date;
  to?: Date;
  supplierId?: number;
  page?: unknown;
  limit?: unknown;
}

// Catatan: parsePeriod di atas punya default "7 hari terakhir" dan HANYA dipakai
// laporan. Daftar ber-paginasi tidak boleh mewarisi default itu — kalau from/to
// kosong, daftar harus menampilkan semua riwayat.
export const stockService = {
  // === STOCK IN ===

  getAllStockIn: async (opts: StockListOptions = {}) => {
    const { page, limit, skip, take } = parsePagination(opts);

    const where = {
      ...dateRangeWhere(opts.from, opts.to),
      ...(opts.supplierId ? { supplierId: opts.supplierId } : {}),
    };

    // id desc sebagai tiebreaker agar urutan stabil saat `date` kembar.
    const [items, total] = await prisma.$transaction([
      prisma.stockIn.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip,
        take,
        include: {
          product: { select: { name: true, sku: true } },
          supplier: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      }),
      prisma.stockIn.count({ where }),
    ]);

    return { items, meta: buildMeta(page, limit, total) };
  },

  createStockIn: async (data: any, userId: number) => {
    const quantity = Number(data.quantity);
    const buyPrice = Number(data.buyPrice);

    // Pertahanan berlapis: tolak kuantitas/harga tidak valid sebelum menyentuh DB.
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('Jumlah stok masuk harus bilangan bulat lebih dari 0');
    }
    if (!Number.isFinite(buyPrice) || buyPrice < 0) {
      throw new Error('Harga beli tidak boleh negatif');
    }

    const stockIn = await prisma.$transaction(async (tx) => {
      const record = await tx.stockIn.create({
        data: {
          productId: data.productId,
          supplierId: data.supplierId || null,
          quantity,
          buyPrice,
          totalPrice: quantity * buyPrice,
          expireDate: data.expireDate ? new Date(data.expireDate) : null,
          notes: data.notes,
          createdById: userId,
        },
      });

      await tx.product.update({
        where: { id: data.productId },
        data: { stock: { increment: quantity } },
      });

      return record;
    });

    await hppHistoryService.recalculateHpp(
      data.productId,
      quantity,
      buyPrice,
      userId
    );

    return stockIn;
  },

  // Daftar batch yang mendekati/sudah lewat kadaluarsa — buat alert.
  // Catatan: ini berdasarkan tanggal batch StockIn, bukan sisa stok per-batch
  // (karena pengurangan stok saat ini tidak dialokasikan ke batch tertentu).
  getExpiringStock: async (days: number = 7) => {
    const now = new Date();
    const limit = addDays(now, days);
    return await prisma.stockIn.findMany({
      where: {
        expireDate: { not: null, lte: limit },
      },
      select: {
        id: true,
        productId: true,
        quantity: true,
        expireDate: true,
        date: true,
        product: { select: { name: true, unit: true } },
      },
      orderBy: { expireDate: 'asc' },
    });
  },

  // === STOCK OUT ===

  getAllStockOut: async (opts: StockListOptions = {}) => {
    const { page, limit, skip, take } = parsePagination(opts);
    const where = dateRangeWhere(opts.from, opts.to);

    const [items, total] = await prisma.$transaction([
      prisma.stockOut.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip,
        take,
        include: {
          product: { select: { name: true, sku: true, stock: true } },
          createdBy: { select: { name: true } },
        },
      }),
      prisma.stockOut.count({ where }),
    ]);

    return { items, meta: buildMeta(page, limit, total) };
  },

  createStockOut: async (data: any, userId: number) => {
    const quantity = Number(data.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('Jumlah stok keluar harus bilangan bulat lebih dari 0');
    }

    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: data.productId } });
      if (!product || product.stock < quantity) {
        throw new Error(`Stok tidak mencukupi! Stok saat ini hanya ${product?.stock || 0}`);
      }

      const stockOut = await tx.stockOut.create({
        data: {
          productId: data.productId,
          quantity,
          reason: data.reason,
          notes: data.notes,
          createdById: userId,
        },
      });

      await tx.product.update({
        where: { id: data.productId },
        data: { stock: { decrement: quantity } },
      });

      return stockOut;
    });
  },

  // === STOCK REPORT ===

  getReport: async (period?: string) => {
    const from = parsePeriod(period);

    const [
      stockInAgg,
      stockInValue,
      stockOutAgg,
      stockOutByReason,
      chartStockIn,
      chartStockOut,
      lowStock,
      outOfStock,
      totalCurrentStock,
      expiringStock,
    ] = await Promise.all([
      prisma.stockIn.aggregate({
        where: { date: { gte: from } },
        _sum: { quantity: true },
      }),
      prisma.stockIn.aggregate({
        where: { date: { gte: from } },
        _sum: { totalPrice: true, quantity: true },
      }),
      prisma.stockOut.aggregate({
        where: { date: { gte: from } },
        _sum: { quantity: true },
      }),
      prisma.stockOut.groupBy({
        by: ['reason'],
        where: { date: { gte: from } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
      }),
      prisma.stockIn.groupBy({
        by: ['date'],
        where: { date: { gte: from } },
        _sum: { quantity: true },
        orderBy: { date: 'asc' },
      }),
      prisma.stockOut.groupBy({
        by: ['date'],
        where: { date: { gte: from } },
        _sum: { quantity: true },
        orderBy: { date: 'asc' },
      }),
      prisma.product.findMany({
        where: { isDeleted: false, stock: { gt: 0, lte: 5 } },
        select: { id: true, name: true, stock: true, unit: true },
        orderBy: { stock: 'asc' },
      }),
      prisma.product.findMany({
        where: { isDeleted: false, stock: 0 },
        select: { id: true, name: true, stock: true, unit: true },
      }),
      prisma.product.aggregate({
        where: { isDeleted: false },
        _sum: { stock: true },
      }),
      prisma.stockIn.findMany({
        where: { expireDate: { not: null, lte: addDays(new Date(), 7) } },
        select: {
          id: true,
          productId: true,
          quantity: true,
          expireDate: true,
          product: { select: { name: true, unit: true } },
        },
        orderBy: { expireDate: 'asc' },
      }),
    ]);

    const now = new Date();
    const expiringRaw = expiringStock.map(s => ({
      id: s.id,
      productId: s.productId,
      productName: s.product?.name ?? '-',
      unit: s.product?.unit ?? '',
      quantity: s.quantity,
      expireDate: s.expireDate,
    }));
    const expired = expiringRaw.filter(s => s.expireDate && new Date(s.expireDate) < now);
    const expiringSoon = expiringRaw.filter(s => s.expireDate && new Date(s.expireDate) >= now);

    return {
      summary: {
        totalStockIn: stockInAgg._sum.quantity ?? 0,
        totalStockOut: stockOutAgg._sum.quantity ?? 0,
        totalStockInValue: stockInValue._sum.totalPrice ?? 0,
        avgBuyPrice:
          (stockInValue._sum.quantity ?? 0) > 0
            ? Number(Math.round(Number(stockInValue._sum.totalPrice ?? 0) / Number(stockInValue._sum.quantity ?? 0)))
            : 0,
        currentStock: totalCurrentStock._sum.stock ?? 0,
      },
      stockOutByReason: stockOutByReason.map(r => ({
        reason: r.reason,
        quantity: r._sum.quantity ?? 0,
      })),
      chart: {
        stockIn: chartStockIn.map(r => ({
          date: r.date,
          quantity: r._sum.quantity ?? 0,
        })),
        stockOut: chartStockOut.map(r => ({
          date: r.date,
          quantity: r._sum.quantity ?? 0,
        })),
      },
      alerts: {
        lowStock,
        outOfStock,
        expired,
        expiringSoon,
      },
    };
  },
};