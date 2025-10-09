import { Custody, OraclePrice, Pool } from "../types";
import { BN } from "@coral-xyz/anchor";
import {
  checkedDecimalMul,
  getAssetAmountUsd,
  theoreticallyOwned,
  totalLocked,
} from "./calculate-pool-aum";
import {
  BPS_POWER,
  CUSTODY_PUBKEY,
  JLP_POOL_ACCOUNT_PUBKEY,
  JUPITER_PERPETUALS_PROGRAM,
} from "../constants";
import { subscribeOraclePrices } from "./poll-and-stream-oracle-price-updates";

const ORACLE_EXPONENT_SCALE = -9;
const ORACLE_PRICE_SCALE = new BN(1_000_000_000);

export function getSwapFeeBps({
  custodyIn,
  custodyOut,
  tokenPriceIn,
  tokenPriceOut,
  pool,
  swapUsdAmount,
}: {
  custodyIn: Custody;
  custodyOut: Custody;
  tokenPriceIn: OraclePrice;
  tokenPriceOut: OraclePrice;
  pool: Pool;
  swapUsdAmount: BN;
}) {
  let baseFeeBps: BN;
  let taxFeeBps: BN;
  let multiplier: BN;

  const isStableSwap = custodyIn.isStable && custodyOut.isStable;

  if (isStableSwap) {
    baseFeeBps = pool.fees.stableSwapBps;
    taxFeeBps = pool.fees.stableSwapTaxBps;
    multiplier = pool.fees.stableSwapMultiplier;
  } else {
    baseFeeBps = pool.fees.swapBps;
    taxFeeBps = pool.fees.taxBps;
    multiplier = pool.fees.swapMultiplier;
  }

  const inputFeeBps = getFeeBps({
    custody: custodyIn,
    sizeUsdDelta: swapUsdAmount,
    baseFeeBps,
    taxFeeBps,
    multiplier,
    increment: true,
    pool,
    tokenPrice: tokenPriceIn,
  });

  const outputFeeBps = getFeeBps({
    custody: custodyOut,
    sizeUsdDelta: swapUsdAmount,
    baseFeeBps,
    taxFeeBps,
    multiplier,
    increment: false,
    pool,
    tokenPrice: tokenPriceOut,
  });

  return BN.max(inputFeeBps, outputFeeBps);
}

export function getFeeBps({
  custody,
  sizeUsdDelta,
  baseFeeBps,
  taxFeeBps,
  multiplier,
  increment,
  pool,
  tokenPrice,
}: {
  custody: Custody;
  sizeUsdDelta: BN;
  baseFeeBps: BN;
  taxFeeBps: BN;
  multiplier: BN;
  increment: boolean;
  pool: Pool;
  tokenPrice: OraclePrice;
}) {
  let initialUsd: BN;

  if (custody.isStable) {
    const currentAmount = theoreticallyOwned(custody);
    initialUsd = getAssetAmountUsd(tokenPrice, currentAmount, custody.decimals);
  } else {
    const currentAmount = theoreticallyOwned(custody).sub(totalLocked(custody));
    initialUsd = getAssetAmountUsd(
      tokenPrice,
      currentAmount,
      custody.decimals
    ).add(custody.assets.guaranteedUsd);
  }

  const targetUsd = pool.aumUsd.mul(custody.targetRatioBps).div(BPS_POWER);

  if (targetUsd.eqn(0)) {
    return new BN(0);
  }

  const initialDiffUsd = initialUsd.sub(targetUsd).abs();
  const vTradeSize = new BN(multiplier).mul(sizeUsdDelta);

  let nextUsd = new BN(0);
  if (increment) {
    nextUsd = initialUsd.add(vTradeSize);
  } else {
    nextUsd = BN.max(new BN(0), initialUsd.sub(vTradeSize));
  }

  const nextDiffUsd = nextUsd.sub(targetUsd).abs();

  // If the diff between target amount and current amount is less than the initial diff, that means
  // the swap is causing the current amount to go towards the target amount, so we discount it
  if (nextDiffUsd.lt(initialDiffUsd)) {
    const rebateBps = taxFeeBps.mul(new BN(initialDiffUsd)).div(targetUsd);
    return BN.max(baseFeeBps.sub(rebateBps), new BN(0));
  } else {
    const avgDiffUsd = initialDiffUsd.add(nextDiffUsd).divn(2);
    const taxBps = taxFeeBps.mul(BN.min(avgDiffUsd, targetUsd)).div(targetUsd);
    return baseFeeBps.add(taxBps);
  }
}

export function getSwapAmount({
  tokenInPrice,
  tokenOutPrice,
  custodyIn,
  custodyOut,
  amountIn,
}: {
  tokenInPrice: OraclePrice;
  tokenOutPrice: OraclePrice;
  custodyIn: Custody;
  custodyOut: Custody;
  amountIn: BN;
}) {
  const swapPrice = getSwapPrice({ tokenInPrice, tokenOutPrice });

  return checkedDecimalMul(
    amountIn,
    -custodyIn.decimals,
    swapPrice.price,
    swapPrice.exponent,
    -custodyOut.decimals
  );
}

export function getSwapPrice({
  tokenInPrice,
  tokenOutPrice,
}: {
  tokenInPrice: OraclePrice;
  tokenOutPrice: OraclePrice;
}) {
  return {
    price: tokenInPrice.price.mul(ORACLE_PRICE_SCALE).div(tokenOutPrice.price),
    exponent:
      tokenInPrice.exponent + ORACLE_EXPONENT_SCALE - tokenOutPrice.exponent,
  };
}

export function collectSwapFees({
  tokenAmount,
  feeBps,
}: {
  tokenAmount: BN;
  feeBps: BN;
}) {
  const feeTokenAmount = tokenAmount.mul(feeBps).div(BPS_POWER);
  return BN.max(new BN(0), tokenAmount.sub(feeTokenAmount));
}

// Example usage of swapping from 1 SOL to USDC
async function main() {
  const oraclePrices = await subscribeOraclePrices();
  const pool = await JUPITER_PERPETUALS_PROGRAM.account.pool.fetch(
    JLP_POOL_ACCOUNT_PUBKEY
  );

  // SOL as input
  const inputCustody = await JUPITER_PERPETUALS_PROGRAM.account.custody.fetch(
    CUSTODY_PUBKEY.SOL
  );
  // USDC as output
  const outputCustody = await JUPITER_PERPETUALS_PROGRAM.account.custody.fetch(
    CUSTODY_PUBKEY.USDC
  );
  const inputCustodyPrice = oraclePrices[inputCustody.mint.toString()];
  const outputCustodyPrice = oraclePrices[outputCustody.mint.toString()];
  const inputTokenAmount = new BN(1_000_000_000); // 1 SOL

  const amountOut = getSwapAmount({
    tokenInPrice: inputCustodyPrice,
    tokenOutPrice: outputCustodyPrice,
    custodyIn: inputCustody,
    custodyOut: outputCustody,
    amountIn: inputTokenAmount,
  });

  const swapUsdAmount = getAssetAmountUsd(
    inputCustodyPrice,
    inputTokenAmount,
    inputCustody.decimals
  );

  const swapFeeBps = getSwapFeeBps({
    custodyIn: inputCustody,
    custodyOut: outputCustody,
    tokenPriceIn: inputCustodyPrice,
    tokenPriceOut: outputCustodyPrice,
    pool,
    swapUsdAmount,
  });

  const amountOutAfterFees = collectSwapFees({
    tokenAmount: amountOut,
    feeBps: swapFeeBps,
  });

  console.log("SOL Swap amount in (lamports):", inputTokenAmount.toString());
  console.log("Swap Fee (bps):", swapFeeBps.toString());
  console.log("USDC Amount Out (before fees):", amountOut.toString());
  console.log("USDC Amount Out (after fees):", amountOutAfterFees.toString());
}
