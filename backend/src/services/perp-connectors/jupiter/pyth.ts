import { Buffer } from 'buffer';

export enum PriceStatus {
  Unknown = 0,
  Trading = 1,
  Halted = 2,
  Auction = 3,
  Ignored = 4,
}

interface PriceInfo {
  price: number | null;
  confidence: number | null;
  status: PriceStatus;
  publishSlot: number;
}

export interface PythPriceData extends PriceInfo {
  exponent: number;
}

const PYTH_MAGIC = 0xa1b2c3d4;
const ACCOUNT_TYPE_PRICE = 3;

export function parsePythPriceData(data: Buffer): PythPriceData {
  if (data.length < 240) {
    throw new Error('Pyth price account data is too small');
  }

  const magic = data.readUInt32LE(0);
  if (magic !== PYTH_MAGIC) {
    throw new Error(`Invalid Pyth account magic: ${magic.toString(16)}`);
  }

  const accountType = data.readUInt32LE(8);
  if (accountType !== ACCOUNT_TYPE_PRICE) {
    throw new Error(`Unexpected Pyth account type: ${accountType}`);
  }

  const exponent = data.readInt32LE(20);
  const aggregate = parsePriceInfo(data.subarray(208, 240), exponent);

  return {
    exponent,
    price: aggregate.price,
    confidence: aggregate.confidence,
    status: aggregate.status,
    publishSlot: aggregate.publishSlot,
  };
}

function parsePriceInfo(buffer: Buffer, exponent: number): PriceInfo {
  if (buffer.length < 32) {
    throw new Error('Pyth price info segment is too small');
  }

  const priceComponent = buffer.readBigInt64LE(0);
  const confidenceComponent = buffer.readBigUInt64LE(8);
  const status = buffer.readUInt32LE(16);
  const publishSlot = Number(buffer.readBigUInt64LE(24));

  const factor = Math.pow(10, exponent);
  const price =
    priceComponent === BigInt(0) ? null : Number(priceComponent) * factor;
  const confidence =
    confidenceComponent === BigInt(0) ? null : Number(confidenceComponent) * factor;

  return {
    price,
    confidence,
    status: status as PriceStatus,
    publishSlot,
  };
}
