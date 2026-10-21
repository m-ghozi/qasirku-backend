import { Router } from 'express';
import { storeSettingController } from '../controllers/storeSetting.controller';
import { verifyToken, requireRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/', storeSettingController.get);
router.put('/', requireRole('owner'), storeSettingController.update);

export default router;