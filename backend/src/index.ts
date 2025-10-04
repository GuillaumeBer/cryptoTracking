import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morphoRouter from './routes/morpho';
import aaveRouter from './routes/aave';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/morpho', morphoRouter);
app.use('/api/aave', aaveRouter);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
