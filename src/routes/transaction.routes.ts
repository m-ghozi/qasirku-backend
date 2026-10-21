import { Router } from 'express';
import { transactionController } from '../controllers/transaction.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/', transactionController.getAll);
router.get('/:id', transactionController.getById);
router.post('/', transactionController.create);

router.put('/:id/pay', transactionController.payHold);

// Pembatalan transaksi = perubahan pembukuan + pengembalian stok.
// Hanya owner yang boleh; staff yang butuh membatalkan bill miliknya sendiri
// memakai alur hold bill (DELETE /:id) yang tetap diizinkan di bawah.
router.post('/:id/cancel', requireRole('owner'), transactionController.cancelCompleted);
router.delete('/:id', transactionController.cancel); // Batal hold bill

export default router;