import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

// Proteksi rute dengan middleware JWT
router.use(verifyToken);

router.get('/me', userController.getMe);

router.get('/', userController.getAll);
router.get('/:id', userController.getById);
router.post('/', userController.create);
router.put('/:id', userController.update);
// Perubahan role/permissions lewat jalur eksplisit, terpisah dari update profil.
router.put('/:id/role', userController.updateRole);
router.delete('/:id', userController.delete); // Menonaktifkan akun (Soft Delete)

export default router;