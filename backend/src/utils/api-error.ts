export interface ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
}

export function createApiError(
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

export function isApiError(error: unknown): error is ApiError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as Partial<ApiError>;
  return typeof candidate.statusCode === 'number' && typeof candidate.code === 'string';
}
