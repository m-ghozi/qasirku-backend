import { prisma } from '../lib/prisma';
import { startOfDay } from 'date-fns';

// Helper: include yang dipakai berulang untuk transaksi
const transactionInclude = {
  createdBy: { select: { name: true } },
  paymentMethod: { select: { name: true } },
  items: {
    select: {
      product: { select: { name: true } },
    },
  },
} as const;

// Helper: normalisasi Decimal Prisma → number & tambahkan field turunan
function normalizeTransaction(
  tx: Awaited<ReturnType<typeof prisma.transaction.findMany<{
    include: typeof transactionInclude
  }>>>[number],
) {
  const itemNames = tx.items.length > 0
    ? tx.items.map((i) => i.product.name).join(', ')
    : null;

  return {
    id: tx.id,
    receiptNumber: tx.receiptNumber,
    subtotal: Number(tx.subtotal),
    discountType: tx.discountType as 'percentage' | 'nominal' | null,
    discountValue: Number(tx.discountValue),
    discountAmount: Number(tx.discountAmount),
    total: Number(tx.total),
    paymentMethodId: tx.paymentMethodId,
    paymentMethod: tx.paymentMethod?.name ?? 'Tunai',
    paymentAmount: Number(tx.paymentAmount),
    change: Number(tx.change),
    profit: Number(tx.profit),
    status: tx.status as 'open' | 'completed' | 'cancelled',
    date: tx.date,
    createdById: tx.createdById,
    createdBy: tx.createdBy,
    itemNames,
  };
}

export const dashboardService = {
  getSummary: async () => {
    const today = startOfDay(new Date());

    const [
      todayTransactions,
      openBillsCount,
      productsCount,
      lowStockProducts,
      recentTransactions,
      todayExpensesAgg,
    ] = await Promise.all([
      // 1. Transaksi hari ini yang sudah selesai
      prisma.transaction.findMany({
        where: { date: { gte: today }, status: 'completed' },
        include: transactionInclude,
        orderBy: { date: 'desc' },
      }),

      // 2. Jumlah open bills
      prisma.transaction.count({ where: { status: 'open' } }),

      // 3. Jumlah produk aktif
      prisma.product.count({ where: { isDeleted: false } }),

      // 4. Produk stok menipis (stok < 10)
      prisma.product.findMany({
        where: { stock: { lt: 10 }, isDeleted: false },
        select: { id: true, name: true, sku: true, stock: true, unit: true },
        orderBy: { stock: 'asc' },
      }),

      // 5. 5 transaksi terakhir secara global (bukan hanya hari ini)
      prisma.transaction.findMany({
        where: { status: 'completed' },
        include: transactionInclude,
        orderBy: { date: 'desc' },
        take: 5,
      }),

      // 6. Agregat pengeluaran hari ini
      prisma.expense.aggregate({
        where: { date: { gte: today }, isDeleted: false },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const todayRevenue = todayTransactions.reduce((acc, tx) => acc + Number(tx.total), 0);
    const todayProfit = todayTransactions.reduce((acc, tx) => acc + Number(tx.profit), 0);

    return {
      todayTransactions: todayTransactions.map(normalizeTransaction),
      stats: {
        todayRevenue,
        todayProfit,
        todaySalesCount: todayTransactions.length,
        openBillsCount,
        productsCount,
        todayExpenses: Number(todayExpensesAgg._sum.amount ?? 0),
        todayExpenseCount: todayExpensesAgg._count.id,
      },
      lowStockProducts,
      recentTransactions: recentTransactions.map(normalizeTransaction),
    };
  },
};