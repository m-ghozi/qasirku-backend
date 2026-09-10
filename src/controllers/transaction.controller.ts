import { Request, Response } from 'express';
import { transactionService } from '../services/transaction.service';
import { isPositiveInteger } from '../middlewares/validate.middleware';

export const transactionController = {
  getAll: async (req: Request, res: Response): Promise<void> => {
    try {
      const transactions = await transactionService.getAllTransactions();
      res.json({ success: true, data: transactions });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  getById: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string);
      const transaction = await transactionService.getTransactionById(id);

      if (!transaction) {
        res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
        return;
      }

      res.json({ success: true, data: transaction });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

  create: async (req: Request, res: Response): Promise<void> => {
    try {
      // req.user didapatkan dari middleware auth
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Sesi tidak valid' });
        return;
      }

      // Pastikan ada item yang dikirim
      if (!req.body.items || req.body.items.length === 0) {
        res.status(400).json({ success: false, message: 'Keranjang belanja kosong!' });
        return;
      }

      // Kuantitas tiap item wajib bilangan bulat > 0. Tanpa ini, quantity negatif
      // lolos validasi stok & membuat decrement stok justru menambah stok.
      for (const item of req.body.items) {
        if (!isPositiveInteger(item?.quantity)) {
          res.status(400).json({ success: false, message: 'Jumlah item harus bilangan bulat lebih dari 0' });
          return;
        }
      }

      const newTransaction = await transactionService.createTransaction(req.body, userId);
      res.status(201).json({
        success: true,
        message: 'Transaksi berhasil disimpan',
        data: newTransaction
      });
    } catch (error: any) {
      // Idempotency: retry koneksi jelek mengirim receiptNumber yang sama.
      // Transaksi sudah tersimpan di percobaan sebelumnya — kembalikan yang ada
      // alih-alih membuat duplikat (P2002 = unique constraint receiptNumber).
      if (error.code === 'P2002' && req.body.receiptNumber) {
        const existing = await transactionService.getByReceiptNumber(req.body.receiptNumber);
        if (existing) {
          res.status(200).json({ success: true, message: 'Transaksi sudah tersimpan', data: existing });
          return;
        }
      }
      // Error handling jika stok tiba-tiba kurang atau ID produk salah
      console.error("Transaction Error:", error);
      res.status(500).json({ success: false, message: 'Gagal memproses transaksi: ' + error.message });
    }
  },

  payHold: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string);
      const { paymentMethodId, paymentAmount, change } = req.body;

      if (!paymentMethodId || paymentAmount === undefined) {
        res.status(400).json({ success: false, message: 'Data pembayaran tidak lengkap' });
        return;
      }

      const completedTransaction = await transactionService.payOpenBill(id, {
        paymentMethodId, paymentAmount, change
      });

      res.json({
        success: true,
        message: 'Hold Bill berhasil dilunasi',
        data: completedTransaction
      });
    } catch (error: any) {
      console.error("Pay Hold Bill Error:", error);
      const statusCode = error.message.includes('tidak ditemukan') || error.message.includes('sudah lunas') ? 400 : 500;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  },
  cancel: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = Number(req.params.id);
      await transactionService.cancelTransaction(id);
      res.json({ success: true, message: 'Bill berhasil dibatalkan' });
    } catch (error: any) {
      const statusCode = error.message.includes('tidak ditemukan') ? 404 : 400;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  },

  cancelCompleted: async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseInt(req.params.id as string);
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ success: false, message: 'Sesi tidak valid' });
        return;
      }

      const reason = req.body?.reason as string | undefined;
      const cancelled = await transactionService.cancelCompletedTransaction(id, userId, reason);

      res.json({
        success: true,
        message: 'Transaksi berhasil dibatalkan, stok dikembalikan',
        data: cancelled,
      });
    } catch (error: any) {
      const statusCode = error.message.includes('tidak ditemukan') ? 404 : 400;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  },
};