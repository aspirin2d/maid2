import { z } from "zod";

/**
 * Remove markdown code fences from a string
 * Handles ```json, ```, and trailing ``` markers
 * Also handles edge cases like multiple fences and whitespace
 */
export function removeMarkdownCodeFences(text: string): string {
  let trimmed = text.trim();

  // Handle multiple leading code fences (rare but possible)
  while (trimmed.startsWith('```')) {
    if (trimmed.startsWith('```json')) {
      trimmed = trimmed.slice(7).trim();
    } else if (trimmed.startsWith('```typescript') || trimmed.startsWith('```javascript')) {
      // Handle other language markers
      const newlineIndex = trimmed.indexOf('\n');
      if (newlineIndex !== -1) {
        trimmed = trimmed.slice(newlineIndex + 1).trim();
      } else {
        trimmed = trimmed.slice(3).trim();
      }
    } else {
      trimmed = trimmed.slice(3).trim();
    }
  }

  // Remove trailing code fences
  while (trimmed.endsWith('```')) {
    trimmed = trimmed.slice(0, -3).trim();
  }

  return trimmed;
}

/**
 * Result of parsing LLM response
 */
export interface ParseResult<T = unknown> {
  /** Successfully parsed and validated output */
  success: boolean;
  /** Parsed output (only if success is true) */
  data?: T;
  /** Cleaned response text (markdown fences removed) */
  cleanedText: string;
  /** Error message (only if success is false) */
  error?: string;
  /** Error details for logging */
  errorDetails?: {
    stage: 'cleaning' | 'json_parse' | 'schema_validation';
    originalError: unknown;
  };
}

/**
 * Parse and validate LLM response against output schema
 * @param rawResponse - Raw LLM response text (may contain markdown fences)
 * @param schema - Zod schema to validate against
 * @returns ParseResult with success status, data, and error info
 */
export function parseLLMResponse<T extends z.ZodType>(
  rawResponse: string,
  schema: T,
): ParseResult<z.infer<T>> {
  // Step 1: Clean markdown fences
  const cleanedText = removeMarkdownCodeFences(rawResponse);

  if (cleanedText.length === 0) {
    return {
      success: false,
      cleanedText: '',
      error: 'Empty response after cleaning markdown fences',
      errorDetails: {
        stage: 'cleaning',
        originalError: new Error('Empty cleaned text'),
      },
    };
  }

  // Step 2: Parse JSON
  let jsonData: unknown;
  try {
    jsonData = JSON.parse(cleanedText);
  } catch (error) {
    return {
      success: false,
      cleanedText,
      error: `JSON parse error: ${error instanceof Error ? error.message : String(error)}`,
      errorDetails: {
        stage: 'json_parse',
        originalError: error,
      },
    };
  }

  // Step 3: Validate against schema
  const validationResult = schema.safeParse(jsonData);
  if (!validationResult.success) {
    return {
      success: false,
      cleanedText,
      error: `Schema validation error: ${validationResult.error.message}`,
      errorDetails: {
        stage: 'schema_validation',
        originalError: validationResult.error,
      },
    };
  }

  return {
    success: true,
    data: validationResult.data,
    cleanedText,
  };
}

/**
 * Validate input against schema and return typed result
 * @param input - Raw input to validate
 * @param schema - Zod schema to validate against
 * @returns Validation result with typed data
 */
export function validateInput<T extends z.ZodType>(
  input: unknown,
  schema: T,
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const result = schema.safeParse(input);
  if (!result.success) {
    return {
      success: false,
      error: `Input validation error: ${result.error.message}`,
    };
  }
  return {
    success: true,
    data: result.data,
  };
}
