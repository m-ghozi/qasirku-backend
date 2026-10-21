import { Router } from 'express';
import { expenseController } from '../controllers/expense.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

// GET /api/expenses?range=30&categoryId=2&paymentMethodId=1
router.get('/', expenseController.getAll);

// GET /api/expenses/summary?range=30&categoryId=2
router.get('/summary', expenseController.getSummary);

router.get('/:id', expenseController.getById);
router.post('/', requireRole('owner'), expenseController.create);
router.put('/:id', requireRole('owner'), expenseController.update);
router.delete('/:id', requireRole('owner'), expenseController.delete);

export default router;
