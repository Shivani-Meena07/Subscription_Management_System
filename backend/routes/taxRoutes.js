
import express from 'express';
import {
  createTax,
  getTaxes,
  updateTax,
  deleteTax
} from '../controllers/taxController.js';

import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.post('/', createTax);
router.get('/', getTaxes);
router.put('/:id', updateTax);
router.delete('/:id', deleteTax);

export default router;