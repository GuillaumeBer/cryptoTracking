import { createApiError } from './api-error';

const SYMBOL_REGEX = /^[A-Za-z0-9$._\-\/]+$/;
const PLATFORM_REGEX = /^[A-Za-z0-9\-]+$/;
const CONTRACT_ADDRESS_REGEX = /^[A-Za-z0-9:_\-]+$/;

function ensureString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw createApiError(400, 'INVALID_TYPE', `${field} must be a string`, { field });
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw createApiError(400, 'INVALID_VALUE', `${field} cannot be empty`, { field });
  }

  return trimmed;
}

export function parseSymbol(value: unknown, field = 'symbol'): string {
  const symbol = ensureString(value, field);

  if (symbol.length > 64) {
    throw createApiError(400, 'INVALID_TOKEN_SYMBOL', `${field} must be 64 characters or fewer`, { field });
  }

  if (!SYMBOL_REGEX.test(symbol)) {
    throw createApiError(400, 'INVALID_TOKEN_SYMBOL', `${field} contains invalid characters`, { field });
  }

  return symbol;
}

export function parseSymbolList(value: unknown, field = 'symbols', maxLength = 50): string[] {
  if (!Array.isArray(value)) {
    throw createApiError(400, 'INVALID_TOKEN_SYMBOLS', `${field} must be an array of symbols`, { field });
  }

  if (value.length === 0) {
    throw createApiError(400, 'INVALID_TOKEN_SYMBOLS', `${field} must contain at least one symbol`, { field });
  }

  if (value.length > maxLength) {
    throw createApiError(400, 'INVALID_TOKEN_SYMBOLS', `${field} cannot contain more than ${maxLength} symbols`, {
      field,
      maxLength,
    });
  }

  const sanitized: string[] = [];
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    const symbol = parseSymbol(entry, `${field}[${index}]`);
    if (!seen.has(symbol)) {
      seen.add(symbol);
      sanitized.push(symbol);
    }
  });

  return sanitized;
}

export function parsePlatform(value: unknown, field = 'platform'): string {
  const platform = ensureString(value, field).toLowerCase();

  if (platform.length > 64) {
    throw createApiError(400, 'INVALID_PLATFORM', `${field} must be 64 characters or fewer`, { field });
  }

  if (!PLATFORM_REGEX.test(platform)) {
    throw createApiError(400, 'INVALID_PLATFORM', `${field} contains invalid characters`, { field });
  }

  return platform;
}

export function parseContractAddress(value: unknown, field = 'address'): string {
  const address = ensureString(value, field);

  if (address.length > 256) {
    throw createApiError(400, 'INVALID_CONTRACT_ADDRESS', `${field} must be 256 characters or fewer`, { field });
  }

  if (!CONTRACT_ADDRESS_REGEX.test(address)) {
    throw createApiError(400, 'INVALID_CONTRACT_ADDRESS', `${field} contains invalid characters`, { field });
  }

  return address;
}

export function parseContractAddressList(value: unknown, field = 'addresses', maxLength = 100): string[] {
  if (!Array.isArray(value)) {
    throw createApiError(400, 'INVALID_CONTRACT_ADDRESSES', `${field} must be an array of addresses`, { field });
  }

  if (value.length === 0) {
    throw createApiError(400, 'INVALID_CONTRACT_ADDRESSES', `${field} must contain at least one address`, { field });
  }

  if (value.length > maxLength) {
    throw createApiError(
      400,
      'INVALID_CONTRACT_ADDRESSES',
      `${field} cannot contain more than ${maxLength} addresses`,
      { field, maxLength }
    );
  }

  const sanitized: string[] = [];
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    const address = parseContractAddress(entry, `${field}[${index}]`);
    if (!seen.has(address)) {
      seen.add(address);
      sanitized.push(address);
    }
  });

  return sanitized;
}
