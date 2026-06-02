import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface TestCase {
  id: string;
  name: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  requestBody?: any;
  assertions: {
    expectedStatus?: number;
    responseType?: string;
    schemaValidation?: boolean;
    expectedSchema?: any; // Expected JSON schema for response body validation
    durationLessThanMs?: number;
    requiredFields?: string[];
  };
}

export interface TestSuite {
  id: string;
  name: string;
  createdAt: string;
  endpointsCount: number;
  spec: any; // Raw or parsed Swagger spec
  testCases: TestCase[];
}

export interface TestCaseResult {
  testCaseId: string;
  name: string;
  method: string;
  path: string;
  url: string;
  status: 'passed' | 'failed';
  durationMs: number;
  request: {
    headers: Record<string, string>;
    body: any;
  };
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
  };
  errors: string[];
}

export interface TestRun {
  id: string;
  suiteId: string;
  suiteName: string;
  targetUrl: string;
  status: 'running' | 'completed' | 'failed';
  createdAt: string;
  durationMs: number;
  totalTests: number;
  passed: number;
  failed: number;
  results: TestCaseResult[];
}

interface DatabaseSchema {
  suites: TestSuite[];
  runs: TestRun[];
}

// Ensure database file exists
export function initDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initialData: DatabaseSchema = { suites: [], runs: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

function readDb(): DatabaseSchema {
  initDb();
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database file, resetting database:', err);
    const initialData: DatabaseSchema = { suites: [], runs: [] };
    return initialData;
  }
}

function writeDb(data: DatabaseSchema) {
  initDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export const db = {
  getSuites(): TestSuite[] {
    const data = readDb();
    return data.suites;
  },

  getSuiteById(id: string): TestSuite | undefined {
    const data = readDb();
    return data.suites.find(s => s.id === id);
  },

  saveSuite(suite: TestSuite): void {
    const data = readDb();
    const index = data.suites.findIndex(s => s.id === suite.id);
    if (index !== -1) {
      data.suites[index] = suite;
    } else {
      data.suites.push(suite);
    }
    writeDb(data);
  },

  deleteSuite(id: string): boolean {
    const data = readDb();
    const index = data.suites.findIndex(s => s.id === id);
    if (index !== -1) {
      data.suites.splice(index, 1);
      // Clean up runs associated with this suite
      data.runs = data.runs.filter(r => r.suiteId !== id);
      writeDb(data);
      return true;
    }
    return false;
  },

  getRuns(): TestRun[] {
    const data = readDb();
    return data.runs;
  },

  getRunById(id: string): TestRun | undefined {
    const data = readDb();
    return data.runs.find(r => r.id === id);
  },

  saveRun(run: TestRun): void {
    const data = readDb();
    const index = data.runs.findIndex(r => r.id === run.id);
    if (index !== -1) {
      data.runs[index] = run;
    } else {
      data.runs.push(run);
    }
    writeDb(data);
  },

  getStats() {
    const data = readDb();
    const totalSuites = data.suites.length;
    const totalRuns = data.runs.length;
    const completedRuns = data.runs.filter(r => r.status === 'completed');
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let totalDurationMs = 0;

    completedRuns.forEach(r => {
      totalTests += r.totalTests;
      passedTests += r.passed;
      failedTests += r.failed;
      totalDurationMs += r.durationMs;
    });

    const averageDurationMs = completedRuns.length > 0 ? Math.round(totalDurationMs / completedRuns.length) : 0;
    const successRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

    return {
      totalSuites,
      totalRuns,
      totalTests,
      passedTests,
      failedTests,
      averageDurationMs,
      successRate
    };
  }
};
