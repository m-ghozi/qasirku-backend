import { Router } from 'express';
import { paymentMethodController } from '../controllers/paymentMethod.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/', paymentMethodController.getAll);
router.get('/:id', paymentMethodController.getById);
router.post('/', requireRole('owner'), paymentMethodController.create);
router.put('/:id', requireRole('owner'), paymentMethodController.update);
router.delete('/:id', requireRole('owner'), paymentMethodController.delete);
router.patch('/:id/deactivate', requireRole('owner'), paymentMethodController.deactivate);
router.patch('/:id/set-default', requireRole('owner'), paymentMethodController.setDefault);

export default router;