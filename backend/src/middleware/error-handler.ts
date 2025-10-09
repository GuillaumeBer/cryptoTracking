import { NextFunction, Request, Response } from 'express';
import { ApiError, isApiError } from '../utils/api-error';

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function buildErrorResponse(error: ApiError): ErrorResponseBody {
  const payload: ErrorResponseBody = {
    error: {
      code: error.code,
      message: error.message,
    },
  };

  if (typeof error.details !== 'undefined') {
    payload.error.details = error.details;
  }

  return payload;
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): Response<ErrorResponseBody> | void {
  if (isApiError(error)) {
    console.error(`Handled API error for ${req.method} ${req.originalUrl}:`, {
      code: error.code,
      message: error.message,
      details: error.details,
      statusCode: error.statusCode,
    });
    return res.status(error.statusCode).json(buildErrorResponse(error));
  }

  console.error(`Unhandled error for ${req.method} ${req.originalUrl}:`, error);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
