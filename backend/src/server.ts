import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import apiRouter from './routes/api';
import { initDb } from './db';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Initialize Database
initDb();

// Middlewares
app.use(cors({
  origin: '*', // Allow all origins for local development testing
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.json({ limit: '50mb' })); // Support uploading large specs
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve parsed specs or generated results
app.use('/api', apiRouter);

// Basic health-check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'AutoTestify Backend Service' });
});

// Create upload and data directories if they don't exist
import fs from 'fs';
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 AutoTestify Backend running on port ${PORT}`);
  console.log(`🛠️ Health check: http://localhost:${PORT}/health`);
  console.log(`===============================================`);
});
