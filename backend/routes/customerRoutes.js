import express from 'express';
import mongoose from 'mongoose';
import { authenticate, allow } from '../middleware/auth.js';
import { createCustomer, deleteCustomer, getCustomerById, getCustomers, updateCustomer } from '../controllers/customerController.js';

const router = express.Router();
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
router.use(authenticate, allow('admin', 'staff'));
router.param('id', (req, res, next, value) => mongoose.isObjectIdOrHexString(value) ? next() : res.status(400).json({ message: 'Invalid customer ID.' }));
router.route('/').get(route(getCustomers)).post(route(createCustomer));
router.route('/:id').get(route(getCustomerById)).patch(route(updateCustomer)).put(route(updateCustomer)).delete(route(deleteCustomer));

export default router;
