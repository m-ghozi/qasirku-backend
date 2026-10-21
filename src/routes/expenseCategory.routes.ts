import { Router } from 'express';
import { expenseCategoryController } from '../controllers/expenseCategory.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/', expenseCategoryController.getAll);
router.get('/:id', expenseCategoryController.getById);
router.post('/', requireRole('owner'), expenseCategoryController.create);
router.put('/:id', requireRole('owner'), expenseCategoryController.update);
router.delete('/:id', requireRole('owner'), expenseCategoryController.delete);

export default router;
