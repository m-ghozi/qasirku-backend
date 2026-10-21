import { Router } from 'express';
import { supplierController } from '../controllers/supplier.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

// Proteksi rute agar hanya bisa diakses setelah login
router.get('/', supplierController.getAll);             // Ambil semua
router.get('/:id', supplierController.getById);         // Ambil detail 1
router.post('/', requireRole('owner'), supplierController.create);            // Tambah baru
router.put('/:id', requireRole('owner'), supplierController.update);          // Edit
router.delete('/:id', requireRole('owner'), supplierController.delete);       // Hapus (Soft delete)

export default router;