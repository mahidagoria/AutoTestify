import SwaggerParser from '@apidevtools/swagger-parser';
import { OpenAPI, OpenAPIV2, OpenAPIV3 } from 'openapi-types';

export interface ParsedParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  type: string;
  description?: string;
  default?: any;
  example?: any;
  enum?: any[];
}

export interface ParsedRequestBody {
  required: boolean;
  contentType: string;
  schema: any; // Fully dereferenced schema
}

export interface ParsedResponse {
  statusCode: string;
  description?: string;
  schema?: any; // Fully dereferenced schema
}

export interface ParsedEndpoint {
  path: string;
  method: string;
  summary?: string;
  description?: string;
  parameters: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responses: ParsedResponse[];
}

export interface ParsedSpec {
  title: string;
  version: string;
  description?: string;
  basePath?: string;
  servers: string[];
  endpoints: ParsedEndpoint[];
}

export async function parseSwaggerSpec(filePathOrObject: string | object): Promise<ParsedSpec> {
  // SwaggerParser.dereference resolves all $ref pointers so we get inline schemas
  const api = await SwaggerParser.dereference(filePathOrObject as any) as any;

  const title = api.info?.title || 'API Specification';
  const version = api.info?.version || '1.0.0';
  const description = api.info?.description;

  // Extract base servers / URLs
  const servers: string[] = [];
  let basePath = '';

  if ('openapi' in api) {
    // OpenAPI 3.x
    const openapiDoc = api as OpenAPIV3.Document;
    if (openapiDoc.servers && openapiDoc.servers.length > 0) {
      openapiDoc.servers.forEach(s => {
        if (s.url) servers.push(s.url);
      });
    }
  } else if ('swagger' in api) {
    // Swagger 2.0
    const swaggerDoc = api as OpenAPIV2.Document;
    const schemes = swaggerDoc.schemes || ['http'];
    const host = swaggerDoc.host || '';
    basePath = swaggerDoc.basePath || '';
    
    if (host) {
      schemes.forEach(scheme => {
        servers.push(`${scheme}://${host}${basePath}`);
      });
    } else if (basePath) {
      servers.push(basePath);
    }
  }

  if (servers.length === 0) {
    servers.push('http://localhost:8080'); // Fallback default
  }

  const endpoints: ParsedEndpoint[] = [];

  if (api.paths) {
    Object.keys(api.paths).forEach(pathKey => {
      const pathItem = api.paths![pathKey];
      if (!pathItem) return;

      // Extract path-level parameters
      const pathParameters = (pathItem.parameters || []) as (OpenAPIV2.Parameter | OpenAPIV3.ParameterObject)[];

      const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];
      methods.forEach(method => {
        const operation = (pathItem as any)[method] as OpenAPIV2.OperationObject | OpenAPIV3.OperationObject;
        if (!operation) return;

        const summary = operation.summary;
        const opDescription = operation.description;
        
        // Extract operation-level parameters
        const opParameters = (operation.parameters || []) as (OpenAPIV2.Parameter | OpenAPIV3.ParameterObject)[];
        
        // Combine parameters, prioritizing operation-level parameters if they duplicate names
        const allParamsMap = new Map<string, any>();
        
        // Path parameters first
        pathParameters.forEach(p => {
          if (p.name && p.in) {
            allParamsMap.set(`${p.in}-${p.name}`, p);
          }
        });
        
        // Operation parameters override path parameters
        opParameters.forEach(p => {
          if (p.name && p.in) {
            allParamsMap.set(`${p.in}-${p.name}`, p);
          }
        });

        const parameters: ParsedParameter[] = [];
        let requestBody: ParsedRequestBody | undefined = undefined;

        // Process all combined parameters
        allParamsMap.forEach((param) => {
          // If it's a Swagger 2.0 body parameter, map it to requestBody
          if (param.in === 'body') {
            const bodyParam = param as OpenAPIV2.InBodyParameterObject;
            requestBody = {
              required: !!bodyParam.required,
              contentType: 'application/json', // Swagger 2.0 body defaults to json
              schema: bodyParam.schema || {}
            };
            return;
          }

          // Otherwise normal parameter
          let paramType = 'string';
          let paramEnum: any[] | undefined = undefined;
          let paramDefault: any = undefined;
          let paramExample: any = undefined;

          if ('type' in param) {
            paramType = param.type as string;
            paramEnum = param.enum;
            paramDefault = param.default;
          } else if ('schema' in param) {
            const schema = param.schema as OpenAPIV3.SchemaObject;
            if (schema) {
              paramType = schema.type as string;
              paramEnum = schema.enum;
              paramDefault = schema.default;
              paramExample = schema.example || param.example;
            }
          }

          parameters.push({
            name: param.name,
            in: param.in as 'path' | 'query' | 'header' | 'cookie',
            required: !!param.required,
            type: paramType || 'string',
            description: param.description,
            default: paramDefault,
            example: paramExample,
            enum: paramEnum
          });
        });

        // OpenAPI 3.x requestBody extraction
        if ('requestBody' in operation && operation.requestBody) {
          const reqBodyObj = operation.requestBody as OpenAPIV3.RequestBodyObject;
          const content = reqBodyObj.content || {};
          
          // Look for JSON primarily, fallback to urlencoded or form-data
          const contentTypes = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'];
          let selectedType = '';
          let selectedSchema: any = null;

          for (const type of contentTypes) {
            if (content[type]) {
              selectedType = type;
              selectedSchema = content[type].schema;
              break;
            }
          }

          // Fallback to first available content type if none of the above are matched
          if (!selectedType && Object.keys(content).length > 0) {
            selectedType = Object.keys(content)[0];
            selectedSchema = content[selectedType].schema;
          }

          if (selectedType) {
            requestBody = {
              required: !!reqBodyObj.required,
              contentType: selectedType,
              schema: selectedSchema || {}
            };
          }
        }

        // Responses extraction
        const responses: ParsedResponse[] = [];
        if (operation.responses) {
          Object.keys(operation.responses).forEach(statusCode => {
            const resObj = operation.responses[statusCode] as any;
            if (!resObj) return;

            let schema: any = undefined;

            if ('schema' in resObj) {
              // Swagger 2.0
              schema = (resObj as OpenAPIV2.ResponseObject).schema;
            } else if ('content' in resObj && resObj.content) {
              // OpenAPI 3.x
              const jsonContent = (resObj as OpenAPIV3.ResponseObject).content?.['application/json'];
              schema = jsonContent?.schema;
            }

            responses.push({
              statusCode,
              description: resObj.description || '',
              schema
            });
          });
        }

        endpoints.push({
          path: pathKey,
          method: method.toUpperCase(),
          summary,
          description: opDescription,
          parameters,
          requestBody,
          responses
        });
      });
    });
  }

  return {
    title,
    version,
    description,
    basePath,
    servers,
    endpoints
  };
}
