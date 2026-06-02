import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { TestCase, TestCaseResult, TestRun } from '../db';

// Helper to replace placeholder path parameters and format URL queries
export function buildUrl(targetUrl: string, path: string, queryParams: Record<string, string>): { url: string; remainingQuery: Record<string, string> } {
  // Prepend http protocol if it is missing
  let normalizedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'http://' + normalizedUrl;
  }
  // Normalize target URL (remove trailing slash)
  const baseUrl = normalizedUrl.endsWith('/') ? normalizedUrl.slice(0, -1) : normalizedUrl;
  
  let resolvedPath = path;
  const remainingQuery = { ...queryParams };
  
  // Resolve curly braces style: e.g. /pets/{id}
  const matches = path.match(/\{([^}]+)\}/g);
  if (matches) {
    matches.forEach(match => {
      const paramName = match.slice(1, -1);
      if (remainingQuery[paramName] !== undefined) {
        resolvedPath = resolvedPath.replace(match, String(remainingQuery[paramName]));
        delete remainingQuery[paramName];
      } else {
        // Fallback default mock id if not provided
        resolvedPath = resolvedPath.replace(match, '1');
      }
    });
  }

  // Resolve colon style: e.g. /pets/:id
  const colonMatches = path.match(/:([a-zA-Z0-9_]+)/g);
  if (colonMatches) {
    colonMatches.forEach(match => {
      const paramName = match.slice(1);
      if (remainingQuery[paramName] !== undefined) {
        resolvedPath = resolvedPath.replace(match, String(remainingQuery[paramName]));
        delete remainingQuery[paramName];
      } else {
        // Fallback default mock id
        resolvedPath = resolvedPath.replace(match, '1');
      }
    });
  }
  
  return {
    url: baseUrl + resolvedPath,
    remainingQuery
  };
}

// Custom JSON Schema validator
function validateResponseSchema(data: any, schema: any): string[] {
  const errors: string[] = [];
  if (!schema) return errors;

  const expectedType = schema.type;
  const actualType = Array.isArray(data) ? 'array' : typeof data;

  if (expectedType && expectedType !== actualType) {
    if (!(expectedType === 'integer' && actualType === 'number')) {
      errors.push(`Expected type "${expectedType}", but got "${actualType}"`);
      return errors;
    }
  }

  if (expectedType === 'object' && data && typeof data === 'object') {
    const props = schema.properties || {};
    const required = schema.required || [];

    // Check required fields
    required.forEach((reqField: string) => {
      if (data[reqField] === undefined) {
        errors.push(`Missing required field "${reqField}"`);
      }
    });

    // Check property types (shallow checking to ensure stability)
    Object.keys(data).forEach(key => {
      if (props[key]) {
        const propSchema = props[key];
        const propExpectedType = propSchema.type;
        const propActualType = Array.isArray(data[key]) ? 'array' : typeof data[key];
        
        if (propExpectedType && propExpectedType !== propActualType && data[key] !== null) {
          if (!(propExpectedType === 'integer' && propActualType === 'number')) {
            errors.push(`Field "${key}" expects type "${propExpectedType}", but got "${propActualType}"`);
          }
        }
      }
    });
  }

  return errors;
}

// Executes a single test case
export async function executeTestCase(testCase: TestCase, targetUrl: string): Promise<TestCaseResult> {
  const { url, remainingQuery } = buildUrl(targetUrl, testCase.path, testCase.queryParams);
  const errors: string[] = [];

  const config: AxiosRequestConfig = {
    method: testCase.method,
    url,
    headers: { ...testCase.headers },
    params: remainingQuery,
    data: testCase.requestBody,
    timeout: 10000, // 10s timeout
    validateStatus: () => true // Prevent axios throwing error on 4xx/5xx responses
  };

  const startTime = process.hrtime();
  let response: AxiosResponse | undefined = undefined;
  let durationMs = 0;

  try {
    response = await axios(config);
    const hrDuration = process.hrtime(startTime);
    durationMs = Math.round((hrDuration[0] * 1000) + (hrDuration[1] / 1000000));
  } catch (err: any) {
    const hrDuration = process.hrtime(startTime);
    durationMs = Math.round((hrDuration[0] * 1000) + (hrDuration[1] / 1000000));
    errors.push(`Network Connection Failed: ${err.message}`);
  }

  const { assertions } = testCase;

  // Run Assertions if response is present
  if (response) {
    // 1. Status Code assertion
    if (assertions.expectedStatus !== undefined) {
      if (response.status !== assertions.expectedStatus) {
        errors.push(`Expected HTTP Status ${assertions.expectedStatus}, but got ${response.status}`);
      }
    }

    // 2. Response Time assertion
    if (assertions.durationLessThanMs !== undefined) {
      if (durationMs > assertions.durationLessThanMs) {
        errors.push(`Response time of ${durationMs}ms exceeded target limit of ${assertions.durationLessThanMs}ms`);
      }
    }

    // 3. Response Schema verification
    if (assertions.schemaValidation && assertions.expectedSchema) {
      if (!response.data) {
        errors.push('Response body is empty, expected payload conforming to schema');
      } else {
        const schemaErrors = validateResponseSchema(response.data, assertions.expectedSchema);
        if (schemaErrors.length > 0) {
          errors.push(...schemaErrors.map(e => `Schema Violation: ${e}`));
        }
      }
    }
  }

  const status = errors.length === 0 ? 'passed' : 'failed';

  return {
    testCaseId: testCase.id,
    name: testCase.name,
    method: testCase.method,
    path: testCase.path,
    url,
    status,
    durationMs,
    request: {
      headers: testCase.headers,
      body: testCase.requestBody || null
    },
    response: response ? {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
      body: response.data
    } : undefined,
    errors
  };
}

// Executes an entire test suite
export async function executeSuite(
  suiteId: string, 
  suiteName: string, 
  testCases: TestCase[], 
  targetUrl: string,
  onProgress?: (run: TestRun) => void
): Promise<TestRun> {
  const runId = crypto.randomUUID();
  const run: TestRun = {
    id: runId,
    suiteId,
    suiteName,
    targetUrl,
    status: 'running',
    createdAt: new Date().toISOString(),
    durationMs: 0,
    totalTests: testCases.length,
    passed: 0,
    failed: 0,
    results: []
  };

  if (onProgress) onProgress({ ...run });

  const startTime = process.hrtime();
  
  // Execute sequentially to respect stateful endpoints (e.g. creating then deleting)
  for (const tc of testCases) {
    const result = await executeTestCase(tc, targetUrl);
    run.results.push(result);
    if (result.status === 'passed') {
      run.passed++;
    } else {
      run.failed++;
    }
    if (onProgress) onProgress({ ...run });
  }

  const hrDuration = process.hrtime(startTime);
  run.durationMs = Math.round((hrDuration[0] * 1000) + (hrDuration[1] / 1000000));
  run.status = run.failed === 0 ? 'completed' : 'failed'; // Mark run failed if any test fails, or mark 'completed' for general runs. Wait, usually a run completed successfully (ran all tests) is marked 'completed' status regardless of test passes/fails. Let's set status = 'completed'.
  run.status = 'completed';

  return run;
}
