
import express from 'express';
import {
  createQuotation,
  getQuotations,
  getQuotationById,
  updateQuotationStatus,
  deleteQuotation
} from '../controllers/quotationController.js';

import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.post('/', createQuotation);
router.get('/', getQuotations);
router.get('/:id', getQuotationById);
router.patch('/:id/status', updateQuotationStatus);
router.delete('/:id', deleteQuotation);

export default router;
