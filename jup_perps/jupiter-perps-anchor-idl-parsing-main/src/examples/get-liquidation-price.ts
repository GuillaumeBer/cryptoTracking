import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  BPS_POWER,
  JUPITER_PERPETUALS_PROGRAM,
  RATE_POWER,
  USDC_DECIMALS,
} from "../constants";
import { BNToUSDRepresentation } from "../utils";

export const divCeil = (a: BN, b: BN) => {
  var dm = a.divmod(b);
  // Fast case - exact division
  if (dm.mod.isZero()) return dm.div;
  // Round up
  return dm.div.ltn(0) ? dm.div.isubn(1) : dm.div.iaddn(1);
};

export async function getLiquidationPrice(positionPubkey: PublicKey) {
  const position =
    await JUPITER_PERPETUALS_PROGRAM.account.position.fetch(positionPubkey);

  const custody = await JUPITER_PERPETUALS_PROGRAM.account.custody.fetch(
    position.custody,
  );

  const collateralCustody =
    await JUPITER_PERPETUALS_PROGRAM.account.custody.fetch(
      position.collateralCustody,
    );

  const priceImpactFeeBps = divCeil(
    position.sizeUsd.mul(BPS_POWER),
    custody.pricing.tradeImpactFeeScalar,
  );
  const baseFeeBps = custody.decreasePositionBps;
  const totalFeeBps = baseFeeBps.add(priceImpactFeeBps);

  const closeFeeUsd = position.sizeUsd.mul(totalFeeBps).div(BPS_POWER);

  const borrowFeeUsd = collateralCustody.fundingRateState.cumulativeInterestRate
    .sub(position.cumulativeInterestSnapshot)
    .mul(position.sizeUsd)
    .div(RATE_POWER);

  const totalFeeUsd = closeFeeUsd.add(borrowFeeUsd);

  const maxLossUsd = position.sizeUsd
    .mul(BPS_POWER)
    .div(custody.pricing.maxLeverage)
    .add(totalFeeUsd);

  const marginUsd = position.collateralUsd;

  let maxPriceDiff = maxLossUsd.sub(marginUsd).abs();
  maxPriceDiff = maxPriceDiff.mul(position.price).div(position.sizeUsd);

  const liquidationPrice = (() => {
    if (position.side.long) {
      if (maxLossUsd.gt(marginUsd)) {
        return position.price.add(maxPriceDiff);
      } else {
        return position.price.sub(maxPriceDiff);
      }
    } else {
      if (maxLossUsd.gt(marginUsd)) {
        return position.price.sub(maxPriceDiff);
      } else {
        return position.price.add(maxPriceDiff);
      }
    }
  })();

  console.log(
    "Liquidation price ($): ",
    BNToUSDRepresentation(liquidationPrice, USDC_DECIMALS),
  );
}
