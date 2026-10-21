import { Router } from 'express';
import { productController } from '../controllers/product.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';
import { validateProduct } from '../middlewares/validate.middleware';
const router = Router();

router.use(verifyToken);

router.get('/', productController.getAll);
// Harus di atas '/:id' — kalau tidak, "next-sku" tertangkap sebagai id.
router.get('/next-sku', productController.getNextSku);
router.get('/:id', productController.getById);
router.post('/', requireRole('owner'), validateProduct, productController.create);
router.put('/:id', requireRole('owner'), validateProduct, productController.update);
router.delete('/:id', requireRole('owner'), productController.delete);

export default router;