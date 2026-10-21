import { Router } from 'express';
import { customerController } from '../controllers/customer.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/', customerController.getAll);
router.get('/:id', customerController.getById);
router.get('/:id/transactions', customerController.getTransactions);
router.post('/', requireRole('owner'), customerController.create);
router.put('/:id', requireRole('owner'), customerController.update);
router.delete('/:id', requireRole('owner'), customerController.delete);

export default router;