import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { parseSwaggerSpec } from '../parser/swaggerParser';
import { generateRuleBasedTests, generateAITests } from '../generator/testGenerator';
import { executeSuite } from '../runner/testRunner';
import { db, TestSuite, TestCase, TestRun } from '../db';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Helper to remove temp upload files
function cleanFile(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Failed to delete temp file:', err);
  }
}

// 1. Upload & Parse Swagger/OpenAPI Spec
router.post('/upload-spec', upload.single('specFile'), async (req: Request, res: Response) => {
  if (req.file) {
    const filePath = req.file.path;
    try {
      // Check if uploaded content is valid JSON or YAML
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      let parsedObj: any;
      try {
        parsedObj = JSON.parse(fileContent);
      } catch {
        // If JSON parse fails, it could be YAML (handled directly by swagger-parser)
        parsedObj = filePath;
      }

      const parsedSpec = await parseSwaggerSpec(parsedObj);
      return res.json(parsedSpec);
    } catch (err: any) {
      console.error('Failed to parse uploaded specification:', err);
      return res.status(400).json({ error: `Parsing failed: ${err.message || 'Invalid OpenAPI/Swagger specification'}` });
    } finally {
      cleanFile(filePath);
    }
  }

  // Fallback to check if specification JSON was pasted directly in req.body
  if (req.body && (req.body.openapi || req.body.swagger || (typeof req.body === 'object' && Object.keys(req.body).length > 0))) {
    try {
      const parsedSpec = await parseSwaggerSpec(req.body);
      return res.json(parsedSpec);
    } catch (err: any) {
      console.error('Failed to parse pasted specification:', err);
      return res.status(400).json({ error: `Parsing failed: ${err.message || 'Invalid OpenAPI/Swagger specification'}` });
    }
  }

  return res.status(400).json({ error: 'No file uploaded and no specification JSON provided' });
});

// 2. Generate and Save Test Suite
router.post('/suites/generate', async (req: Request, res: Response) => {
  const { title, spec, useAI } = req.body;
  if (!title || !spec || !spec.endpoints) {
    return res.status(400).json({ error: 'Missing title or spec endpoints definition' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || '';
    const shouldRunAI = useAI && apiKey.length > 0;
    const testCases: TestCase[] = [];

    // Process endpoints sequentially to avoid hitting rate limits if running AI generator
    for (const endpoint of spec.endpoints) {
      if (shouldRunAI) {
        const aiTests = await generateAITests(endpoint, apiKey);
        testCases.push(...aiTests);
      } else {
        const ruleTests = generateRuleBasedTests(endpoint);
        testCases.push(...ruleTests);
      }
    }

    const newSuite: TestSuite = {
      id: crypto.randomUUID(),
      name: title,
      createdAt: new Date().toISOString(),
      endpointsCount: spec.endpoints.length,
      spec,
      testCases
    };

    db.saveSuite(newSuite);
    return res.status(201).json(newSuite);
  } catch (err: any) {
    console.error('Failed to generate test suite:', err);
    return res.status(500).json({ error: `Generation failed: ${err.message}` });
  }
});

// 3. List all saved suites
router.get('/suites', (req: Request, res: Response) => {
  const suites = db.getSuites();
  // Don't return heavy spec files in the list
  const sanitizedSuites = suites.map(({ spec, ...rest }) => rest);
  return res.json(sanitizedSuites);
});

// 4. Retrieve single test suite details (including test cases)
router.get('/suites/:id', (req: Request, res: Response) => {
  const suite = db.getSuiteById(req.params.id);
  if (!suite) {
    return res.status(404).json({ error: 'Test suite not found' });
  }
  return res.json(suite);
});

// 5. Delete test suite and associated history
router.delete('/suites/:id', (req: Request, res: Response) => {
  const deleted = db.deleteSuite(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Test suite not found' });
  }
  return res.json({ message: 'Suite and associated test runs deleted successfully' });
});

// 6. Execute a Test Suite
router.post('/runs/execute', async (req: Request, res: Response) => {
  const { suiteId, targetUrl } = req.body;
  if (!suiteId || !targetUrl) {
    return res.status(400).json({ error: 'Missing suiteId or targetUrl' });
  }

  const suite = db.getSuiteById(suiteId);
  if (!suite) {
    return res.status(404).json({ error: 'Test suite not found' });
  }

  try {
    // Execute suite (sequentially)
    const runResult = await executeSuite(suite.id, suite.name, suite.testCases, targetUrl);
    db.saveRun(runResult);
    return res.json(runResult);
  } catch (err: any) {
    console.error('Failed to run test suite:', err);
    return res.status(500).json({ error: `Execution failed: ${err.message}` });
  }
});

// 7. List past test runs
router.get('/runs', (req: Request, res: Response) => {
  const runs = db.getRuns();
  // Don't return full results array to speed up summary loading
  const sanitizedRuns = runs.map(({ results, ...rest }) => rest);
  return res.json(sanitizedRuns);
});

// 8. Retrieve single test run logs
router.get('/runs/:id', (req: Request, res: Response) => {
  const run = db.getRunById(req.params.id);
  if (!run) {
    return res.status(404).json({ error: 'Test run not found' });
  }
  return res.json(run);
});

// 9. Fetch summary statistics
router.get('/stats', (req: Request, res: Response) => {
  const stats = db.getStats();
  return res.json(stats);
});

// --- Mock Petstore API Endpoints to Support Run Execution ---
router.get('/pets', (req: Request, res: Response) => {
  const { limit } = req.query;
  if (limit !== undefined && isNaN(Number(limit))) {
    return res.status(400).json({ error: 'Invalid query parameter: limit must be an integer' });
  }
  return res.json([
    { id: 101, name: 'Fido', tag: 'canine' },
    { id: 102, name: 'Whiskers', tag: 'feline' }
  ]);
});

router.post('/pets', (req: Request, res: Response) => {
  const { id, name } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: 'Missing id or name in pet payload' });
  }
  return res.status(201).json({ id, name, tag: req.body.tag || 'pet' });
});

router.get('/pets/:petId', (req: Request, res: Response) => {
  return res.json({ id: 101, name: 'Fido', tag: 'canine' });
});

// --- Mock Library Books API Endpoints to Support Run Execution ---
router.get('/books', (req: Request, res: Response) => {
  return res.json([
    { id: '978-3-16-148410-0', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', genre: 'Fiction' },
    { id: '978-0-452-28423-4', title: '1984', author: 'George Orwell', genre: 'Dystopian' }
  ]);
});

router.post('/books', (req: Request, res: Response) => {
  const { id, title, author } = req.body;
  if (!id || !title || !author) {
    return res.status(400).json({ error: 'Missing id, title, or author in book payload' });
  }
  return res.status(201).json({ id, title, author, genre: req.body.genre || 'General' });
});

router.get('/books/:bookId', (req: Request, res: Response) => {
  return res.json({ id: req.params.bookId, title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', genre: 'Fiction' });
});

router.delete('/books/:bookId', (req: Request, res: Response) => {
  return res.json({ message: `Book ${req.params.bookId} deleted successfully` });
});

export default router;
