import { Router } from 'express';
import { unitController } from '../controllers/unit.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/', unitController.getAll);
router.get('/:id', unitController.getById);
router.post('/', unitController.create);
router.put('/:id', unitController.update);
router.delete('/:id', unitController.delete);

export default router;