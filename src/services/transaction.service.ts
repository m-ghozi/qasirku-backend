import { prisma } from '../lib/prisma';

// ── Kalkulasi pesanan (dipakai createTransaction & payOpenBill) ──────────────
// Kedua jalur harus menghasilkan angka yang sama persis, jadi perhitungannya
// disatukan di sini: harga & HPP selalu diambil dari DB, diskon divalidasi, dan
// klien tidak pernah menentukan nilai finansial sendiri.

type CalculatedItem = {
  productId: number;
  quantity: number;
  price: number;
  hpp: number;
  discountType: string | null;
  discountValue: number;
  discountAmount: number;
  totalPrice: number;
  profit: number;
  notes: string | null;
};

async function loadProductsForItems(tx: any, items: any[]) {
  // Ambil semua produk sekaligus (1 query, bukan N queries)
  const productIds: number[] = items.map((i: any) => Number(i.productId));
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, isDeleted: false },
  });

  const productMap = new Map<number, any>();
  for (const product of products as any[]) {
    productMap.set(Number(product.id), product);
  }

  // Validasi semua produk ditemukan
  for (const item of items) {
    if (!productMap.has(Number(item.productId))) {
      throw new Error(`Produk ID ${item.productId} tidak ditemukan atau sudah dihapus`);
    }
  }

  return productMap;
}

function calculateOrder(
  productMap: Map<number, any>,
  items: any[],
  discountTypeInput: string | null | undefined,
  discountValueInput: unknown,
) {
  const calculatedItems: CalculatedItem[] = items.map((item: any) => {
    const product = productMap.get(Number(item.productId))!;
    const qty = Number(item.quantity);
    // Kuantitas wajib bilangan bulat > 0. Nilai negatif akan melewati cek stok
    // (stok < qty) dan membuat decrement justru menambah stok, sekaligus
    // menghasilkan total transaksi negatif.
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error(`Jumlah item "${product.name}" harus bilangan bulat lebih dari 0`);
    }
    const price = Number(product.price);
    const hpp = Number(product.hpp);

    const discountType: string | null = item.discountType ?? null;
    const discountValue = Number(item.discountValue ?? 0);

    const grossTotal = price * qty;  // ← hitung gross dulu
    let discountAmount = 0;

    if (discountType === 'percentage') {
      if (discountValue < 0 || discountValue > 100) {
        throw new Error(`Diskon persentase item "${product.name}" harus antara 0–100`);
      }
      // Percentage: hitung dari grossTotal (ekuivalen dengan per-unit × qty)
      discountAmount = (grossTotal * discountValue) / 100;
    } else if (discountType === 'nominal') {
      if (discountValue < 0 || discountValue > grossTotal) {
        throw new Error(`Diskon nominal item "${product.name}" tidak valid`);
      }
      // Nominal: nilai flat dari total, bukan per-unit
      discountAmount = discountValue;
    }

    const totalPrice = grossTotal - discountAmount;
    const profit = totalPrice - hpp * qty;  // ← tidak pakai effectivePrice lagi

    return {
      productId: product.id,
      quantity: qty,
      price,
      hpp,
      discountType,
      discountValue,
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      totalPrice: parseFloat(totalPrice.toFixed(2)),
      profit: parseFloat(profit.toFixed(2)),
      notes: item.notes ?? null,
    };
  });

  // ── Hitung subtotal, diskon transaksi, total, profit ──────────────────────

  const subtotal = calculatedItems.reduce((acc, i) => acc + i.totalPrice, 0);

  // Diskon level transaksi (opsional)
  const discountType: string | null = discountTypeInput ?? null;
  const discountValue = Number(discountValueInput ?? 0);
  let discountAmount = 0;

  if (discountType === 'percentage') {
    if (discountValue < 0 || discountValue > 100) {
      throw new Error('Diskon persentase transaksi harus antara 0–100');
    }
    discountAmount = (subtotal * discountValue) / 100;
  } else if (discountType === 'nominal') {
    if (discountValue < 0 || discountValue > subtotal) {
      throw new Error('Diskon nominal transaksi tidak valid');
    }
    discountAmount = discountValue;
  }

  const total = subtotal - discountAmount;
  const totalProfit = calculatedItems.reduce((acc, i) => acc + i.profit, 0) - discountAmount;

  return {
    calculatedItems,
    subtotal,
    discountType,
    discountValue,
    discountAmount,
    total,
    totalProfit,
  };
}

export const transactionService = {
  // 1. Ambil semua riwayat transaksi (Untuk Laporan)
  getAllTransactions: async () => {
    return await prisma.transaction.findMany({
      orderBy: { date: 'desc' },
      include: {
        createdBy: { select: { name: true, username: true } },
        paymentMethod: { select: { name: true, category: true } },
        items: {
          include: { product: { select: { name: true, sku: true } } },
        },
      },
    });
  },

  // 2. Ambil detail 1 transaksi (Untuk Cetak Struk Ulang)
  getTransactionById: async (id: number) => {
    return await prisma.transaction.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true } },
        paymentMethod: { select: { name: true, category: true } },
        items: { include: { product: true } },
      },
    });
  },

  // 2b. Ambil transaksi by receiptNumber (idempotency saat retry)
  getByReceiptNumber: async (receiptNumber: string) => {
    return await prisma.transaction.findUnique({
      where: { receiptNumber: receiptNumber.trim() },
      include: {
        createdBy: { select: { name: true } },
        paymentMethod: { select: { name: true, category: true } },
        items: { include: { product: true } },
      },
    });
  },

  // 3. Buat Transaksi Baru (Proses Kasir Berjalan / Hold Bill)
  createTransaction: async (data: any, userId: number) => {
    return await prisma.$transaction(async (tx) => {
      const txStatus = data.status === 'open' ? 'open' : 'completed';

      // ── Validasi & kalkulasi item dari database ──────────────────────────────

      if (!data.items || data.items.length === 0) {
        throw new Error('Keranjang belanja kosong');
      }

      const productMap = await loadProductsForItems(tx, data.items);

      // Validasi stok jika transaksi langsung completed
      if (txStatus === 'completed') {
        for (const item of data.items) {
          const product = productMap.get(Number(item.productId))!;
          if (product.stock < item.quantity) {
            throw new Error(
              `Stok "${product.name}" tidak mencukupi. Stok tersedia: ${product.stock}, diminta: ${item.quantity}`
            );
          }
        }
      }

      // Hitung ulang nilai finansial di server (harga & HPP dari DB, bukan klien)
      const {
        calculatedItems,
        subtotal,
        discountType,
        discountValue,
        discountAmount,
        total,
        totalProfit,
      } = calculateOrder(productMap, data.items, data.discountType, data.discountValue);

      const paymentAmount = Number(data.paymentAmount ?? 0);

      if (txStatus === 'completed') {
        if (paymentAmount < total) {
          throw new Error(
            `Jumlah bayar (${paymentAmount}) kurang dari total transaksi (${total.toFixed(2)})`
          );
        }
      }

      // Backend always computes change — never trust client value
      const change = txStatus === 'completed'
        ? parseFloat((paymentAmount - total).toFixed(2))
        : 0;

      // ── Simpan header transaksi ──────────────────────────────────────────────

      // Receipt number: gunakan dari frontend jika ada, fallback ke timestamp+random
      const receiptNumber =
        data.receiptNumber?.trim() ||
        `TX${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      const transaction = await tx.transaction.create({
        data: {
          receiptNumber,
          subtotal: parseFloat(subtotal.toFixed(2)),
          discountType,
          discountValue: parseFloat(discountValue.toFixed(2)),
          discountAmount: parseFloat(discountAmount.toFixed(2)),
          total: parseFloat(total.toFixed(2)),
          paymentMethodId: data.paymentMethodId ?? null,
          paymentAmount: txStatus === 'completed' ? parseFloat(paymentAmount.toFixed(2)) : 0,
          change: txStatus === 'completed' ? parseFloat(change.toFixed(2)) : 0,
          profit: parseFloat(totalProfit.toFixed(2)),
          status: txStatus,
          createdById: userId,
          customerId: data.customerId ? Number(data.customerId) : null,
          customerName: data.customerName?.trim() || null,
        },
      });

      // ── Simpan item & kurangi stok ───────────────────────────────────────────

      for (const item of calculatedItems) {
        await tx.transactionItem.create({
          data: {
            transactionId: transaction.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            hpp: item.hpp,
            totalPrice: item.totalPrice,
            profit: item.profit,
            discountType: item.discountType,
            discountValue: item.discountValue,
            discountAmount: item.discountAmount,
            notes: item.notes,
          },
        });

        if (txStatus === 'completed') {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
        }
      }

      return {
        ...transaction,
        // Sertakan relasi product (name & sku) agar bentuk response sama dengan
        // getById/getAllTransactions. Tanpa ini klien hanya menerima productId
        // dan menampilkan "Produk #<id>" di struk Kasir.
        items: calculatedItems.map((item) => {
          const product = productMap.get(item.productId)!;
          return {
            ...item,
            product: { id: product.id, name: product.name, sku: product.sku },
          };
        }),
      };
    });
  },

  // 4. Lunasi Hold Bill (Ubah open → completed)
  //
  // `items` opsional: bila dikirim, keranjang final dari kasir dipakai sebagai
  // sumber kebenaran — harga & HPP dihitung ulang dari DB saat pelunasan, bukan
  // memakai total yang tersimpan ketika bill dibuat. Ini yang membuat harga yang
  // dibayar sama dengan yang tampil di keranjang saat bill diedit/dilunasi.
  payOpenBill: async (id: number, paymentData: any) => {
    return await prisma.$transaction(async (tx) => {
      // A. Ambil transaksi beserta itemnya
      const transaction = await tx.transaction.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!transaction) throw new Error('Transaksi tidak ditemukan');
      if (transaction.status === 'completed') throw new Error('Transaksi ini sudah lunas');
      if (transaction.status === 'cancelled') throw new Error('Transaksi sudah dibatalkan');

      const incomingItems = paymentData.items;
      const hasItems = incomingItems !== undefined;

      if (hasItems && (!Array.isArray(incomingItems) || incomingItems.length === 0)) {
        throw new Error('Keranjang belanja kosong');
      }

      // Nilai default: item & total tersimpan (perilaku lama untuk klien yang
      // tidak mengirim keranjang).
      let orderItems: { productId: number; quantity: number }[] = transaction.items;
      let subtotal = Number(transaction.subtotal);
      let discountType: string | null = transaction.discountType;
      let discountValue = Number(transaction.discountValue);
      let discountAmount = Number(transaction.discountAmount);
      let total = Number(transaction.total);
      let totalProfit = Number(transaction.profit);

      if (hasItems) {
        const productMap = await loadProductsForItems(tx, incomingItems);
        const calculated = calculateOrder(
          productMap,
          incomingItems,
          // `undefined` = klien tidak mengirim diskon transaksi → pertahankan
          // nilai bill. `null` eksplisit tetap berarti diskon dikosongkan.
          paymentData.discountType === undefined
            ? transaction.discountType
            : paymentData.discountType,
          paymentData.discountValue === undefined
            ? transaction.discountValue
            : paymentData.discountValue,
        );

        orderItems = calculated.calculatedItems;
        subtotal = calculated.subtotal;
        discountType = calculated.discountType;
        discountValue = calculated.discountValue;
        discountAmount = calculated.discountAmount;
        total = calculated.total;
        totalProfit = calculated.totalProfit;

        // Ganti item bill dengan keranjang final. Bila langkah berikutnya gagal,
        // seluruh $transaction di-rollback sehingga bill lama tetap utuh.
        await tx.transactionItem.deleteMany({ where: { transactionId: id } });
        await tx.transactionItem.createMany({
          data: calculated.calculatedItems.map((item) => ({ transactionId: id, ...item })),
        });
      }

      const paymentAmount = Number(paymentData.paymentAmount ?? 0);
      const change = parseFloat((paymentAmount - total).toFixed(2));

      // B. Validasi pembayaran terhadap total hasil hitung ulang
      if (paymentAmount < total) {
        throw new Error(
          `Jumlah bayar (${paymentAmount}) kurang dari total transaksi (${total.toFixed(2)})`
        );
      }

      // C. Re-check stok sebelum decrement (stok bisa berubah sejak hold)
      for (const item of orderItems) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product || product.stock < item.quantity) {
          throw new Error(
            `Stok produk ID ${item.productId} tidak mencukupi saat pelunasan. ` +
            `Tersedia: ${product?.stock ?? 0}, dibutuhkan: ${item.quantity}`
          );
        }
      }

      // D. Update status dan data pembayaran
      const updatedTransaction = await tx.transaction.update({
        where: { id },
        data: {
          status: 'completed',
          paymentMethodId: paymentData.paymentMethodId ?? null,
          paymentAmount: parseFloat(paymentAmount.toFixed(2)),
          change: parseFloat(change.toFixed(2)),
          customerId: paymentData.customerId ? Number(paymentData.customerId) : undefined,
          customerName: paymentData.customerName?.trim() || undefined,
          // Header ikut diselaraskan dengan item hasil hitung ulang.
          ...(hasItems
            ? {
                subtotal: parseFloat(subtotal.toFixed(2)),
                discountType,
                discountValue: parseFloat(discountValue.toFixed(2)),
                discountAmount: parseFloat(discountAmount.toFixed(2)),
                total: parseFloat(total.toFixed(2)),
                profit: parseFloat(totalProfit.toFixed(2)),
              }
            : {}),
        },
      });

      // E. Potong stok
      for (const item of orderItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return updatedTransaction;
    });
  },

  // 5. Batalkan Hold Bill
  cancelTransaction: async (id: number) => {
    return await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!transaction) throw new Error('Transaksi tidak ditemukan');
      if (transaction.status === 'completed') {
        throw new Error('Transaksi sudah selesai, tidak bisa dibatalkan');
      }
      if (transaction.status === 'cancelled') {
        throw new Error('Transaksi sudah dibatalkan');
      }

      // Open bill tidak memotong stok, jadi tidak perlu restore stok
      await tx.transaction.delete({ where: { id } });
    });
  },

  // 6. Batalkan transaksi yang sudah selesai (completed) → soft-cancel + restore stok
  //    Transaksi tetap tersimpan (status: 'cancelled') supaya laporan & audit tetap bisa dilacak.
  cancelCompletedTransaction: async (id: number, userId: number, reason?: string) => {
    return await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!transaction) throw new Error('Transaksi tidak ditemukan');
      if (transaction.status === 'cancelled') throw new Error('Transaksi sudah dibatalkan');
      if (transaction.status !== 'completed') {
        throw new Error('Transaksi belum lunas. Batalkan lewat menu Hold Bill.');
      }

      // Restore stok: balikkan pengurangan stok saat transaksi dibuat
      for (const item of transaction.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      // Soft-cancel: tandai status & simpan jejak audit (siapa, kapan, alasan)
      return await tx.transaction.update({
        where: { id },
        data: {
          status: 'cancelled',
          cancelledById: userId,
          cancelledAt: new Date(),
          cancelReason: reason?.trim() || null,
        },
        include: {
          items: { include: { product: { select: { name: true, sku: true } } } },
        },
      });
    });
  },
};