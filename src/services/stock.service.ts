import { prisma } from '../lib/prisma';
import { startOfDay, endOfDay, startOfMonth, subDays, addDays } from 'date-fns';
import { hppHistoryService } from './hppHistory.service';
import { buildMeta, dateRangeWhere, parsePagination } from '../utils/pagination';

// ── Rentang laporan ───────────────────────────────────────────────────────────

/** Preset rentang cepat — samakan dengan yang dipakai modul pengeluaran. */
export type RangePreset = 'today' | '7' | '30' | 'month' | 'all';

export interface RangeParams {
  range?: string;
  from?: string;
  to?: string;
  /** Legacy: GET /stocks/report?period=7|30 — dipetakan ke preset yang sama. */
  period?: string;
}

/** Batas bawah untuk preset 'all'. */
const EARLIEST = new Date(2000, 0, 1);

/** 'YYYY-MM-DD' → Date. Null kalau tidak diisi atau tidak valid. */
function parseDay(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Ubah parameter query jadi rentang [from, to] yang inklusif di kedua ujung.
 *
 * Prioritas: from/to eksplisit → preset `range` (atau `period` legacy) → 7 hari terakhir.
 *
 * Catatan: `parsePagination`/`dateRangeWhere` milik daftar ber-paginasi sengaja TIDAK
 * dipakai di sini. Daftar menampilkan seluruh riwayat kalau rentangnya kosong, sedangkan
 * laporan butuh rentang yang selalu terdefinisi supaya angkanya bermakna.
 */
export function resolveRange(params: RangeParams = {}): { from: Date; to: Date } {
  const now = new Date();
  const today = endOfDay(now);

  const fromDay = parseDay(params.from);
  const toDay = parseDay(params.to);
  if (fromDay || toDay) {
    return {
      from: fromDay ? startOfDay(fromDay) : startOfDay(startOfMonth(now)),
      to: toDay ? endOfDay(toDay) : today,
    };
  }

  switch (params.range ?? params.period) {
    case 'today':
      return { from: startOfDay(now), to: today };
    case 'month':
      return { from: startOfMonth(now), to: today };
    case 'all':
      return { from: EARLIEST, to: today };
    case '7':
      return { from: startOfDay(subDays(now, 6)), to: today };
    case '30':
      return { from: startOfDay(subDays(now, 29)), to: today };
    default: {
      // period=<jumlah hari> dari hook lama. Tanpa parameter yang valid → 7 hari.
      const days = Number(params.range ?? params.period);
      const n = Number.isFinite(days) && days > 0 ? Math.floor(days) : 7;
      return { from: startOfDay(subDays(now, n - 1)), to: today };
    }
  }
}

// ── Rekap mutasi stok ─────────────────────────────────────────────────────────

/**
 * Jendela waktu mutasi. Sengaja tidak memakai `dateRangeWhere` dari utils/pagination:
 * helper itu berkontrak "kosong berarti tanpa batas" untuk daftar yang menampilkan
 * seluruh riwayat, sedangkan jendela laporan selalu punya kedua ujung — memaksakannya
 * hanya menambah cabang yang tidak mungkin terjadi.
 */
interface MovementWindow {
  date: { gte?: Date; lte?: Date; gt?: Date };
}

interface MovementAgg {
  stockIn: number;
  stockOut: number;
  sold: number;
  adjustIn: number;
}

const EMPTY_AGG: MovementAgg = { stockIn: 0, stockOut: 0, sold: 0, adjustIn: 0 };

function addAgg(
  map: Map<number, MovementAgg>,
  productId: number,
  key: keyof MovementAgg,
  qty: number,
) {
  const cur = map.get(productId) ?? { ...EMPTY_AGG };
  cur[key] += qty;
  map.set(productId, cur);
}

/**
 * Rekap mutasi stok per produk untuk satu jendela waktu.
 *
 * `TransactionItem` ikut dihitung karena penjualan juga menggerakkan stok — bukan cuma
 * StockIn/StockOut. Transaksi berstatus `open` (hold bill) tidak memotong stok
 * (`transaction.service.ts`), jadi hanya `completed` yang dihitung sebagai penjualan,
 * dan hanya `cancelled` yang mengembalikan stok.
 *
 * Keterbatasan yang diketahui: open bill tidak menyimpan waktu pelunasan, jadi transaksi
 * yang dibuat `open` sebelum jendela lalu dibayar di dalamnya akan terhitung memotong
 * stok di tanggal pembuatan. Hanya alur Hold Bill — Kasir normal tidak terpengaruh.
 */
async function aggregateMovements(where: MovementWindow): Promise<Map<number, MovementAgg>> {
  const [stockIns, stockOuts, soldItems, restoredItems] = await Promise.all([
    prisma.stockIn.findMany({
      where,
      select: { productId: true, quantity: true },
    }),
    prisma.stockOut.findMany({
      where,
      select: { productId: true, quantity: true },
    }),
    prisma.transactionItem.findMany({
      where: { transaction: { status: 'completed', ...where } },
      select: { productId: true, quantity: true },
    }),
    prisma.transactionItem.findMany({
      where: { transaction: { status: 'cancelled', cancelledAt: where.date } },
      select: { productId: true, quantity: true },
    }),
  ]);

  const map = new Map<number, MovementAgg>();
  for (const r of stockIns) addAgg(map, r.productId, 'stockIn', r.quantity);
  for (const r of stockOuts) addAgg(map, r.productId, 'stockOut', r.quantity);
  for (const r of soldItems) addAgg(map, r.productId, 'sold', r.quantity);
  for (const r of restoredItems) addAgg(map, r.productId, 'adjustIn', r.quantity);
  return map;
}

/** Saldo bersih dari sebuah rekap: masuk + koreksi masuk − keluar − terjual. */
function netOf(agg?: MovementAgg): number {
  if (!agg) return 0;
  return agg.stockIn + agg.adjustIn - agg.stockOut - agg.sold;
}

export interface StockListOptions {
  from?: Date;
  to?: Date;
  supplierId?: number;
  page?: unknown;
  limit?: unknown;
}

// Catatan: resolveRange di atas punya default "7 hari terakhir" dan HANYA dipakai
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

  getReport: async (params: RangeParams = {}) => {
    const { from, to } = resolveRange(params);
    // Batas atas ikut dipasang: sebelumnya hanya `gte: from`, sehingga rentang
    // historis (mis. "bulan lalu") tetap menghitung semua data setelahnya.
    const window = { gte: from, lte: to };

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
        where: { date: window },
        _sum: { quantity: true },
      }),
      prisma.stockIn.aggregate({
        where: { date: window },
        _sum: { totalPrice: true, quantity: true },
      }),
      prisma.stockOut.aggregate({
        where: { date: window },
        _sum: { quantity: true },
      }),
      prisma.stockOut.groupBy({
        by: ['reason'],
        where: { date: window },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
      }),
      prisma.stockIn.groupBy({
        by: ['date'],
        where: { date: window },
        _sum: { quantity: true },
        orderBy: { date: 'asc' },
      }),
      prisma.stockOut.groupBy({
        by: ['date'],
        where: { date: window },
        _sum: { quantity: true },
        orderBy: { date: 'asc' },
      }),
      // Alert di bawah ini sengaja TIDAK difilter rentang — semuanya kondisi saat ini.
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
      range: { from: from.toISOString(), to: to.toISOString() },
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

  /**
   * Kartu stok: rekap mutasi per produk untuk satu rentang.
   *
   * Saldo akhir dihitung mundur dari `Product.stock` dengan membatalkan mutasi SETELAH
   * `to`: `stok akhir = stok sekarang − mutasi setelah rentang`. Saldo awal lalu
   * `= stok akhir − mutasi rentang`, sehingga `stok awal + mutasi = stok akhir` selalu
   * konsisten dan — untuk rentang yang berakhir hari ini — stok akhir sama persis dengan
   * yang tampil di halaman Produk.
   *
   * Kenapa tidak merekonstruksi murni dari ledger mutasi: `product.service.ts` bisa
   * menyetel `stock` langsung tanpa membuat record StockIn (stok awal saat produk dibuat,
   * dan lewat update produk). Ledger-nya karena itu tidak lengkap, dan rekonstruksi murni
   * akan melaporkan 0 untuk produk yang jelas-jelas ada stoknya. Berlabuh ke
   * `Product.stock` membuat selisih tak tercatat itu ikut terbawa di saldo awal.
   */
  getProductMovements: async (params: RangeParams = {}) => {
    const { from, to } = resolveRange(params);

    const [within, after, products] = await Promise.all([
      aggregateMovements({ date: { gte: from, lte: to } }),
      aggregateMovements({ date: { gt: to } }),
      prisma.product.findMany({
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          hpp: true,
          stock: true,
          isDeleted: true,
          category: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const rows = products
      .map((p) => {
        const agg = within.get(p.id) ?? EMPTY_AGG;
        const closingStock = p.stock - netOf(after.get(p.id));
        const openingStock = closingStock - netOf(agg);
        const hpp = Number(p.hpp);

        return {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          categoryName: p.category?.name ?? null,
          hpp,
          openingStock,
          stockIn: agg.stockIn,
          sold: agg.sold,
          adjustIn: agg.adjustIn,
          adjustOut: agg.stockOut,
          closingStock,
          closingValue: closingStock * hpp,
          /** Stok sistem saat ini — untuk merekonsiliasi bila rentang berakhir hari ini. */
          currentStock: p.stock,
        };
      })
      // Produk tanpa saldo dan tanpa aktivitas hanya jadi noise di laporan.
      .filter(
        (r) =>
          r.openingStock !== 0 ||
          r.closingStock !== 0 ||
          r.stockIn !== 0 ||
          r.sold !== 0 ||
          r.adjustIn !== 0 ||
          r.adjustOut !== 0,
      );

    const totals = rows.reduce(
      (acc, r) => ({
        openingStock: acc.openingStock + r.openingStock,
        stockIn: acc.stockIn + r.stockIn,
        sold: acc.sold + r.sold,
        adjustIn: acc.adjustIn + r.adjustIn,
        adjustOut: acc.adjustOut + r.adjustOut,
        closingStock: acc.closingStock + r.closingStock,
        closingValue: acc.closingValue + r.closingValue,
        currentStock: acc.currentStock + r.currentStock,
      }),
      {
        openingStock: 0,
        stockIn: 0,
        sold: 0,
        adjustIn: 0,
        adjustOut: 0,
        closingStock: 0,
        closingValue: 0,
        currentStock: 0,
      },
    );

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals,
      products: rows,
    };
  },
};
