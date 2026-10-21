import { Router } from 'express';
import { unitController } from '../controllers/unit.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/', unitController.getAll);
router.get('/:id', unitController.getById);
router.post('/', requireRole('owner'), unitController.create);
router.put('/:id', requireRole('owner'), unitController.update);
router.delete('/:id', requireRole('owner'), unitController.delete);

export default router;