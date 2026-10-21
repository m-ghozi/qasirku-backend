import { Router } from 'express';
import { stockController } from '../controllers/stock.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

// === Stock In ===
router.get('/in', stockController.getStockIn);

// Perubahan stok (barang masuk / keluar) adalah operasi administratif:
// staff kasir tidak boleh menambah stok sesuka hatinya karena itu
// memengaruhi HPP dan angka laba yang dilihat owner.
router.post('/in', requireRole('owner'), stockController.createStockIn);

// === Stock Out ===
router.get('/out', stockController.getStockOut);
router.post('/out', requireRole('owner'), stockController.createStockOut);

// === Report ===
// Rentang bisa lewat preset (?range=today|7|30|month|all), rentang bebas
// (?from=YYYY-MM-DD&to=YYYY-MM-DD), atau ?period=7|30 yang lama.
router.get('/report/movements', stockController.getMovements);
router.get('/report', stockController.getReport);

export default router;