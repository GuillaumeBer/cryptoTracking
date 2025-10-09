import { Custody, OraclePrice, Pool } from "../types";
import { BN } from "@coral-xyz/anchor";
import { checkedDecimalMul, getAssetAmountUsd } from "./calculate-pool-aum";
import {
  CUSTODY_PUBKEY,
  JLP_MINT_PUBKEY,
  JLP_POOL_ACCOUNT_PUBKEY,
  JUPITER_PERPETUALS_PROGRAM,
  RPC_CONNECTION,
  USDC_DECIMALS,
} from "../constants";
import { subscribeOraclePrices } from "./poll-and-stream-oracle-price-updates";
import { collectSwapFees, getFeeBps } from "./calculate-swap-amount-and-fee";
import { getMint } from "@solana/spl-token";
import Decimal from "decimal.js";

export const getTokenAmount = (
  oracle: OraclePrice,
  assetAmountUsd: BN,
  tokenDecimals: number
) => {
  if (oracle.price.eqn(0) || assetAmountUsd.eqn(0)) return new BN(0);

  return checkedDecimalMul(
    assetAmountUsd,
    -USDC_DECIMALS,
    oracle.price,
    oracle.exponent,
    -tokenDecimals
  );
};

export const checkedDecimalDiv = (
  coefficient1: BN,
  exponent1: number,
  coefficient2: BN,
  exponent2: number,
  targetExponent: number
) => {
  if (coefficient2.eqn(0)) throw "MathOverflow: Division by zero";
  if (coefficient1.eqn(0)) return new BN(0);

  let scaleFactor = 0;
  let targetPower = exponent1 - exponent2 - targetExponent;
  if (exponent1 > 0) {
    scaleFactor += exponent1;
    targetPower -= exponent1;
  }
  if (exponent2 < 0) {
    scaleFactor -= exponent2;
    targetPower += exponent2;
  }
  if (targetExponent < 0) {
    scaleFactor -= targetExponent;
    targetPower += targetExponent;
  }

  const scaledCoeff1 =
    scaleFactor > 0
      ? new Decimal(coefficient1.toString()).mul(Decimal.pow(10, scaleFactor))
      : new Decimal(coefficient1.toString());

  const dividend = scaledCoeff1.div(new Decimal(coefficient2.toString()));
  const result =
    targetPower >= 0
      ? dividend.mul(Decimal.pow(10, targetPower))
      : dividend.div(Decimal.pow(10, -targetPower));

  return new BN(result.toDP(0).toString());
};

// Mint JLP
export function getAddLiquidityFeeBps({
  pool,
  custody,
  usdDelta,
  tokenPrice,
}: {
  pool: Pool;
  custody: Custody;
  usdDelta: BN;
  tokenPrice: OraclePrice;
}) {
  return getFeeBps({
    custody,
    sizeUsdDelta: usdDelta,
    baseFeeBps: pool.fees.addRemoveLiquidityBps,
    taxFeeBps: pool.fees.taxBps,
    multiplier: pool.fees.swapMultiplier,
    increment: true,
    pool,
    tokenPrice,
  });
}

// Burn JLP
export function getRemoveLiquidityFeeBps({
  pool,
  custody,
  usdDelta,
  tokenPrice,
}: {
  pool: Pool;
  custody: Custody;
  usdDelta: BN;
  tokenPrice: OraclePrice;
}) {
  return getFeeBps({
    custody,
    sizeUsdDelta: usdDelta,
    baseFeeBps: pool.fees.addRemoveLiquidityBps,
    taxFeeBps: pool.fees.taxBps,
    multiplier: pool.fees.swapMultiplier,
    increment: false,
    pool,
    tokenPrice,
  });
}

// Example deposit SOL to mint JLP with fee calculations
export const calculateMintJlp = async () => {
  const oraclePrices = await subscribeOraclePrices();
  const pool = await JUPITER_PERPETUALS_PROGRAM.account.pool.fetch(
    JLP_POOL_ACCOUNT_PUBKEY
  );

  // SOL as input
  const inputCustody = await JUPITER_PERPETUALS_PROGRAM.account.custody.fetch(
    CUSTODY_PUBKEY.SOL
  );
  const inputCustodyPrice = oraclePrices[inputCustody.mint.toString()];
  const inputTokenAmount = new BN(1_000_000_000); // 1 SOL
  const inputTokenAmountUsd = getAssetAmountUsd(
    inputCustodyPrice,
    inputTokenAmount,
    inputCustody.decimals
  );

  const mintFeeBps = getAddLiquidityFeeBps({
    pool,
    custody: inputCustody,
    usdDelta: inputTokenAmountUsd,
    tokenPrice: inputCustodyPrice,
  });

  const depositTokenAmountAfterFee = collectSwapFees({
    tokenAmount: inputTokenAmount,
    feeBps: mintFeeBps,
  });

  const mintAmountUsd = getAssetAmountUsd(
    inputCustodyPrice,
    depositTokenAmountAfterFee,
    inputCustody.decimals
  );

  const jlpMint = await getMint(RPC_CONNECTION, JLP_MINT_PUBKEY, "confirmed");
  const mintTokenAmount = mintAmountUsd
    .mul(new BN(jlpMint.supply.toString()))
    .div(pool.aumUsd);

  console.log("SOL Deposit amount (lamports):", inputTokenAmount.toString());
  console.log("Mint Fee (bps):", mintFeeBps.toString());
  console.log("JLP mint amount USD (after fees):", mintAmountUsd.toString());
  console.log(
    "JLP mint token amount (after fees):",
    mintTokenAmount.toString()
  );
};

// Example burn JLP to redeem JLP with fee calculations
export const calculateBurnJlp = async () => {
  const oraclePrices = await subscribeOraclePrices();
  const pool = await JUPITER_PERPETUALS_PROGRAM.account.pool.fetch(
    JLP_POOL_ACCOUNT_PUBKEY
  );

  // Redeem SOL
  const outputCustody = await JUPITER_PERPETUALS_PROGRAM.account.custody.fetch(
    CUSTODY_PUBKEY.SOL
  );
  const outputCustodyPrice = oraclePrices[outputCustody.mint.toString()];
  const jlpMint = await getMint(RPC_CONNECTION, JLP_MINT_PUBKEY, "confirmed");
  const inputBurnTokenAmount = new BN(1_000_000); // Burn 1 JLP
  const burnAmountUsd = pool.aumUsd
    .mul(inputBurnTokenAmount)
    .div(new BN(jlpMint.supply.toString()));
  const burnTokenAmount = getTokenAmount(
    outputCustodyPrice,
    burnAmountUsd,
    outputCustody.decimals
  );

  const burnFeeBps = getRemoveLiquidityFeeBps({
    pool,
    custody: outputCustody,
    usdDelta: burnAmountUsd,
    tokenPrice: outputCustodyPrice,
  });

  const burnTokenAmountAfterFee = collectSwapFees({
    tokenAmount: burnTokenAmount,
    feeBps: burnFeeBps,
  });

  console.log("JLP Burn amount:", inputBurnTokenAmount.toString());
  console.log("Burn Fee (bps):", burnFeeBps.toString());
  console.log(
    "JLP Burn amount (after fees):",
    burnTokenAmountAfterFee.toString()
  );
};
