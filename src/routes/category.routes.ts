import { Router } from 'express';
import { categoryController } from '../controllers/category.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/', categoryController.getAll);
router.get('/:id', categoryController.getById);
router.post('/', requireRole('owner'), categoryController.create);
router.put('/:id', requireRole('owner'), categoryController.update);
router.delete('/:id', requireRole('owner'), categoryController.delete);

export default router;