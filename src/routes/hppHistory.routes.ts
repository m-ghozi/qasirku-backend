import { Router } from 'express';
import { hppHistoryController } from '../controllers/hppHistory.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/', hppHistoryController.getAll);
router.get('/product/:productId', hppHistoryController.getByProduct);

// Menulis ulang HPP mengubah basis biaya dan dengan demikian laba yang
// dilaporkan — hanya owner yang boleh.
router.post('/manual', requireRole('owner'), hppHistoryController.updateManual);

export default router;