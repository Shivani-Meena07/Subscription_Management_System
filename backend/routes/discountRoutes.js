
import express from 'express';
import {
  createDiscount,
  getDiscounts,
  updateDiscount,
  deleteDiscount
} from '../controllers/discountController.js';

import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.post('/', createDiscount);
router.get('/', getDiscounts);
router.put('/:id', updateDiscount);
router.delete('/:id', deleteDiscount);

export default router;
