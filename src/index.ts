import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import productRoutes from './routes/product.routes';
import authRoutes from './routes/auth.routes'
import categoryRoutes from './routes/category.routes';
import transactionRoutes from './routes/transaction.routes';
import stockRoutes from './routes/stock.routes'
import dashboardRoutes from './routes/dashboard.routes'
import reportRoutes from './routes/report.routes'
import supplierRoutes from './routes/supplier.routes';
import userRoutes from './routes/user.routes'
import storeSettingRoutes from './routes/storeSetting.routes'
import unitRoutes from './routes/unit.routes';
import paymentMethodRoutes from './routes/paymentMethod.routes';
import hppHistoryRoutes from './routes/hppHistory.routes';
import expenseRoutes from './routes/expense.routes';
import expenseCategoryRoutes from './routes/expenseCategory.routes';
import customerRoutes from './routes/customer.routes';

dotenv.config();

// Fail-fast: tolak jalan tanpa JWT_SECRET agar tidak pernah memakai secret default.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') {
  throw new Error('JWT_SECRET tidak di-set. Isi JWT_SECRET di environment sebelum menjalankan server.');
}

const app: Express = express();
const port = process.env.PORT;

app.use(helmet());

app.set('trust proxy', 0);

// Rate Limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 1000, // maksimal 1000 request/IP
  }),
);

// === Global Middlewares ===
// CORS
app.use(
  cors({
    origin: [
      'http://localhost:4173',
      'http://localhost:8080',
      'https://qasir.sayangibu.co.id',
      'https://www.qasir.sayangibu.co.id',
    ],
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// === Routes Registration ===
app.get('/', (req: Request, res: Response) => {
  res.json({ message: '🚀 Kasir API is running smoothly!' });
});
app.use('/api/auth', authRoutes)
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/users', userRoutes);
app.use('/api/store-settings', storeSettingRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/hpp-history', hppHistoryRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/expense-categories', expenseCategoryRoutes);
app.use('/api/customers', customerRoutes);

// === Start Server ===
// Hanya start server saat dijalankan langsung (bukan saat di-import oleh test/supertest)
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
  });
}

export { app };
