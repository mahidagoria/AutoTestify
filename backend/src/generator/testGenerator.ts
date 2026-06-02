import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParsedEndpoint, ParsedParameter, ParsedSpec } from '../parser/swaggerParser';
import { TestCase } from '../db';
import crypto from 'crypto';

// Generate random UUIDs for test IDs
function generateId(): string {
  return crypto.randomUUID();
}

// Generate realistic mock data based on parameter definitions
function getMockParamValue(param: ParsedParameter): string {
  if (param.example !== undefined) return String(param.example);
  if (param.default !== undefined) return String(param.default);
  if (param.enum && param.enum.length > 0) return String(param.enum[0]);

  switch (param.type) {
    case 'integer':
    case 'number':
      return '1';
    case 'boolean':
      return 'true';
    case 'string':
    default:
      if (param.name.toLowerCase().includes('email')) return 'test@example.com';
      if (param.name.toLowerCase().includes('id')) return '123';
      return `mock_${param.name}`;
  }
}

// Recursive helper to generate mock bodies from JSON schemas
export function generateMockDataFromSchema(schema: any): any {
  if (!schema) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  // Handle arrays
  if (schema.type === 'array' || schema.items) {
    return [generateMockDataFromSchema(schema.items)];
  }

  // Handle objects
  if (schema.type === 'object' || schema.properties) {
    const obj: any = {};
    const props = schema.properties || {};
    Object.keys(props).forEach(key => {
      // If property is required or just a standard field, generate it
      obj[key] = generateMockDataFromSchema(props[key]);
    });
    return obj;
  }

  // Handle primitives
  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'date') return new Date().toISOString().split('T')[0];
      if (schema.format === 'email') return 'test.user@example.com';
      if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
      if (schema.enum && schema.enum.length > 0) return schema.enum[0];
      return 'string';
    case 'number':
    case 'integer':
      if (schema.enum && schema.enum.length > 0) return schema.enum[0];
      if (schema.minimum !== undefined) return schema.minimum;
      return 1;
    case 'boolean':
      return true;
    default:
      return 'string';
  }
}

// Rules-based Test Generator (Fallback & Core Engine)
export function generateRuleBasedTests(endpoint: ParsedEndpoint): TestCase[] {
  const tests: TestCase[] = [];

  // Parse path and query params for default values
  const pathParams: Record<string, string> = {};
  const queryParams: Record<string, string> = {};
  const headers: Record<string, string> = {
    'Accept': 'application/json'
  };

  endpoint.parameters.forEach(p => {
    const val = getMockParamValue(p);
    if (p.in === 'path') {
      pathParams[p.name] = val;
    } else if (p.in === 'query') {
      queryParams[p.name] = val;
    } else if (p.in === 'header') {
      headers[p.name] = val;
    }
  });

  // Extract expected success status code (first 2xx code found, default to 200)
  const successResponse = endpoint.responses.find(r => r.statusCode.startsWith('2'));
  const expectedSuccessStatus = successResponse ? parseInt(successResponse.statusCode, 10) : 200;

  // 1. HAPPY PATH TEST
  const happyBody = endpoint.requestBody ? generateMockDataFromSchema(endpoint.requestBody.schema) : undefined;
  if (happyBody && endpoint.requestBody?.contentType) {
    headers['Content-Type'] = endpoint.requestBody.contentType;
  }

  tests.push({
    id: generateId(),
    name: `${endpoint.method} ${endpoint.path} - Success (Happy Path)`,
    method: endpoint.method,
    path: endpoint.path,
    headers: { ...headers },
    queryParams: { ...queryParams },
    requestBody: happyBody,
    assertions: {
      expectedStatus: expectedSuccessStatus,
      responseType: 'json',
      schemaValidation: !!successResponse?.schema,
      expectedSchema: successResponse?.schema,
      durationLessThanMs: 2000
    }
  });

  // 2. BOUNDARY / INPUT VALIDATION (MISSING REQUIRED PARAMETERS)
  const requiredParams = endpoint.parameters.filter(p => p.required && p.in !== 'path');
  if (requiredParams.length > 0) {
    requiredParams.forEach(req => {
      const missingQueryParams = { ...queryParams };
      const missingHeaders = { ...headers };
      
      if (req.in === 'query') delete missingQueryParams[req.name];
      if (req.in === 'header') delete missingHeaders[req.name];

      tests.push({
        id: generateId(),
        name: `${endpoint.method} ${endpoint.path} - Missing Required Query/Header Param (${req.name})`,
        method: endpoint.method,
        path: endpoint.path,
        headers: missingHeaders,
        queryParams: missingQueryParams,
        requestBody: happyBody,
        assertions: {
          expectedStatus: 400, // Bad Request
          durationLessThanMs: 1500
        }
      });
    });
  }

  // 3. MISSING REQUIRED BODY FIELDS
  if (endpoint.requestBody?.schema?.required && Array.isArray(endpoint.requestBody.schema.required)) {
    endpoint.requestBody.schema.required.forEach((field: string) => {
      if (happyBody && typeof happyBody === 'object' && field in happyBody) {
        const invalidBody = { ...happyBody };
        delete invalidBody[field];

        tests.push({
          id: generateId(),
          name: `${endpoint.method} ${endpoint.path} - Missing Required Body Field (${field})`,
          method: endpoint.method,
          path: endpoint.path,
          headers: { ...headers },
          queryParams: { ...queryParams },
          requestBody: invalidBody,
          assertions: {
            expectedStatus: 400, // Bad Request
            durationLessThanMs: 1500
          }
        });
      }
    });
  }

  // 4. INVALID PARAMETER TYPES (e.g. integer parameters passed string)
  const integerParams = endpoint.parameters.filter(p => p.type === 'integer' || p.type === 'number');
  if (integerParams.length > 0) {
    integerParams.forEach(param => {
      const badQueryParams = { ...queryParams };
      const badHeaders = { ...headers };
      
      if (param.in === 'query') badQueryParams[param.name] = 'invalid_number_string';
      if (param.in === 'header') badHeaders[param.name] = 'invalid_number_string';

      tests.push({
        id: generateId(),
        name: `${endpoint.method} ${endpoint.path} - Invalid Param Type for (${param.name})`,
        method: endpoint.method,
        path: endpoint.path,
        headers: badHeaders,
        queryParams: badQueryParams,
        requestBody: happyBody,
        assertions: {
          expectedStatus: 400, // Bad Request
          durationLessThanMs: 1500
        }
      });
    });
  }

  return tests;
}

// AI-based Test Generator utilizing Gemini API
export async function generateAITests(endpoint: ParsedEndpoint, apiKey: string): Promise<TestCase[]> {
  try {
    const successResponse = endpoint.responses.find(r => r.statusCode.startsWith('2'));
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are an expert QA Automation Engineer.
Generate test cases in JSON format for the following API endpoint parsed from an OpenAPI spec:

Method: ${endpoint.method}
Path: ${endpoint.path}
Summary: ${endpoint.summary || 'None'}
Description: ${endpoint.description || 'None'}
Parameters: ${JSON.stringify(endpoint.parameters, null, 2)}
RequestBody Schema: ${JSON.stringify(endpoint.requestBody || null, null, 2)}
Responses Specs: ${JSON.stringify(endpoint.responses, null, 2)}

Requirements:
- Create exactly 3-5 comprehensive test cases covering:
  1. A robust Happy Path with highly realistic values (e.g., standard names, real emails, typical IDs).
  2. Input validation edge cases or boundary violations (e.g., invalid email formats, extremely long strings, out of range values).
  3. A security error or validation case (e.g. invalid permissions, wrong IDs, format mismatches).
- Format each test case as a JSON object inside an array matching the following schema structure:
[
  {
    "name": "Detailed, friendly test case name",
    "method": "${endpoint.method}",
    "path": "${endpoint.path}",
    "headers": { "Accept": "application/json", ... },
    "queryParams": { ... },
    "requestBody": { ... }, // (omit if endpoint does not expect a request body)
    "assertions": {
      "expectedStatus": 200, // (number matching the scenario)
      "responseType": "json", // or "text"
      "schemaValidation": true, // whether to validate schema
      "durationLessThanMs": 1500
    }
  }
]

Provide ONLY the raw JSON array. DO NOT wrap the output in markdown block ticks like \`\`\`json \`\`\` or output any other text or description. Return a single clean, valid JSON array.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Clean up potential markdown wrapper code blocks if model ignored prompt instructions
    if (text.startsWith('```')) {
      text = text.replace(/^```(json)?\n/, '').replace(/\n```$/, '');
    }

    const aiTests = JSON.parse(text);
    if (Array.isArray(aiTests)) {
      // Map and inject unique IDs
      return aiTests.map(t => ({
        id: generateId(),
        name: t.name || `${endpoint.method} ${endpoint.path} - AI Generated`,
        method: endpoint.method,
        path: endpoint.path,
        headers: t.headers || { 'Accept': 'application/json' },
        queryParams: t.queryParams || {},
        requestBody: t.requestBody,
        assertions: {
          expectedStatus: t.assertions?.expectedStatus || 200,
          responseType: t.assertions?.responseType || 'json',
          schemaValidation: t.assertions?.schemaValidation !== undefined ? t.assertions.schemaValidation : true,
          expectedSchema: successResponse?.schema,
          durationLessThanMs: t.assertions?.durationLessThanMs || 2000
        }
      }));
    }
    throw new Error('AI response is not a valid array');
  } catch (err) {
    console.warn(`Gemini API failed for endpoint ${endpoint.method} ${endpoint.path}, falling back to rules-based. Error:`, err);
    return generateRuleBasedTests(endpoint);
  }
}
