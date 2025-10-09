import { BN } from "@coral-xyz/anchor";
import Decimal from "decimal.js";

import { divCeil } from "../utils";
import { BPS_POWER } from "../constants";
import { Custody } from "../types";

export enum TradePoolType {
  Increase = "Increase",
  Decrease = "Decrease",
}

export const getBaseFeeUsd = (baseFeeBps: BN, amount: BN) => {
  if (amount.eqn(0)) {
    return new BN(0);
  }

  return amount.mul(baseFeeBps).div(BPS_POWER);
};

export const getLinearPriceImpactFeeBps = (
  tradeSizeUsd: BN,
  tradeImpactFeeScalar: BN
) => {
  return tradeImpactFeeScalar.eqn(0)
    ? new BN(0)
    : divCeil(tradeSizeUsd.mul(BPS_POWER), tradeImpactFeeScalar);
};

export function calculateDeltaImbalance(
  priceImpactBuffer: {
    openInterest: BN[];
    lastUpdated: BN;
    feeFactor: BN;
    maxFeeBps: BN;
    exponent: number;
    deltaImbalanceThresholdDecimal: BN;
  },
  currentTime: number,
  newOpenInterest: BN,
  tradeType: TradePoolType
): BN {
  const currentIdx = currentTime % 60;
  const lastUpdatedIdx = priceImpactBuffer.lastUpdated.toNumber() % 60;

  const amount =
    tradeType === TradePoolType.Increase
      ? newOpenInterest
      : newOpenInterest.neg();

  const updatedOpenInterest = [...priceImpactBuffer.openInterest];

  // No values OR more than 1 minute
  if (
    priceImpactBuffer.lastUpdated.lten(0) ||
    new BN(currentTime).sub(priceImpactBuffer.lastUpdated).gten(60)
  ) {
    return amount;
  }

  if (lastUpdatedIdx === currentIdx) {
    updatedOpenInterest[currentIdx] =
      updatedOpenInterest[currentIdx].add(amount);
  } else {
    updatedOpenInterest[currentIdx] = amount;
  }

  // Set outdated values to 0
  if (currentIdx > lastUpdatedIdx) {
    // Clean from last_updated_idx+1 to current_idx
    updatedOpenInterest.fill(new BN(0), lastUpdatedIdx + 1, currentIdx);
  } else if (currentIdx < lastUpdatedIdx) {
    // Clean from last_updated_idx+1 to end
    updatedOpenInterest.fill(
      new BN(0),
      lastUpdatedIdx + 1,
      updatedOpenInterest.length
    );
    // Clean from start to current_idx
    updatedOpenInterest.fill(new BN(0), 0, currentIdx);
  }

  // Calculate the sum of all values in the array
  return updatedOpenInterest.reduce((acc, val) => acc.add(val), new BN(0));
}

export const getAdditivePriceImpactFeeBps = (
  baseFeeBps: BN,
  amount: BN,
  tradePoolType: TradePoolType,
  custody: Custody,
  curtime: BN
) => {
  if (amount.eqn(0)) {
    return {
      positionFeeUsd: new BN(0),
      priceImpactFeeUsd: new BN(0),
    };
  }

  const priceImpactBuffer = custody.priceImpactBuffer;
  const linearImpactFeeCoefficientBps = getLinearPriceImpactFeeBps(
    amount,
    custody.pricing.tradeImpactFeeScalar
  );
  const totalBaseFeeBps = linearImpactFeeCoefficientBps.add(baseFeeBps);
  const linearImpactFeeUsd = divCeil(
    amount.mul(linearImpactFeeCoefficientBps),
    BPS_POWER
  );
  let positionFeeUsd = divCeil(amount.mul(totalBaseFeeBps), BPS_POWER);

  if (custody.priceImpactBuffer.feeFactor.eq(new BN(0))) {
    return {
      positionFeeUsd,
      priceImpactFeeUsd: linearImpactFeeUsd,
    };
  }

  const deltaImbalanceDecimal = calculateDeltaImbalance(
    priceImpactBuffer,
    curtime.toNumber(),
    amount,
    tradePoolType
  ).abs();

  if (
    deltaImbalanceDecimal.lte(priceImpactBuffer.deltaImbalanceThresholdDecimal)
  ) {
    return {
      positionFeeUsd,
      priceImpactFeeUsd: linearImpactFeeUsd,
    };
  }

  const deltaImbalanceAmountDecimal =
    new (deltaImbalanceDecimal.toString().div)(
      new Decimal(priceImpactBuffer.deltaImbalanceThresholdDecimal.toString())
    )
      .pow(priceImpactBuffer.exponent)
      .ceil();
  const deltaImbalanceAmount = new BN(deltaImbalanceAmountDecimal.toString());

  const priceImpactFeeBps = divCeil(
    deltaImbalanceAmount,
    priceImpactBuffer.feeFactor
  );
  const totalFeeBps = totalBaseFeeBps.add(priceImpactFeeBps);
  const cappedTotalFeeBps = BN.min(totalFeeBps, priceImpactBuffer.maxFeeBps);

  positionFeeUsd = divCeil(amount.mul(cappedTotalFeeBps), BPS_POWER);
  const baseFeeUsd = getBaseFeeUsd(baseFeeBps, amount);
  const priceImpactFeeUsd = positionFeeUsd.sub(baseFeeUsd);

  return { positionFeeUsd, priceImpactFeeUsd };
};
