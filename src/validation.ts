import { z } from "zod";

/**
 * Formats Zod validation errors into a user-friendly error message
 */
export function formatZodError(error: z.ZodError): string {
  const errors = error.issues.map((err: z.core.$ZodIssue) => {
    const path = err.path.length > 0 ? `${err.path.join(".")}: ` : "";
    return `${path}${err.message}`;
  });
  return errors.join("; ");
}

/**
 * Serializes data for Server-Sent Events (SSE)
 */
export function toData(data: unknown): string {
  return JSON.stringify(data);
}

/**
 * Base class for application errors with HTTP status codes
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common application error types
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = "Internal server error") {
    super(message, 500, "INTERNAL_SERVER_ERROR");
    this.name = "InternalServerError";
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Formats any error into a consistent error response
 */
export function formatError(error: unknown): {
  message: string;
  statusCode: number;
  code?: string;
} {
  if (isAppError(error)) {
    return {
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
    };
  }

  if (error instanceof z.ZodError) {
    return {
      message: formatZodError(error),
      statusCode: 400,
      code: "VALIDATION_ERROR",
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      statusCode: 500,
      code: "INTERNAL_ERROR",
    };
  }

  return {
    message: String(error),
    statusCode: 500,
    code: "UNKNOWN_ERROR",
  };
}
