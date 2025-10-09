import { BN } from "@coral-xyz/anchor";
import { divCeil } from "../utils";
import { Custody, OraclePrice } from "../types";
import { USDC_DECIMALS } from "../constants";

/* Constants */

export const RATE_DECIMALS = 9;
export const RATE_POWER = new BN(10).pow(new BN(RATE_DECIMALS));
export const DEBT_POWER = RATE_POWER;

/* Math helpers */

export const checkedDecimalMul = (
  coefficient1: BN,
  exponent1: number,
  coefficient2: BN,
  exponent2: number,
  targetExponent: number,
) => {
  if (coefficient1.eqn(0) || coefficient2.eqn(0)) return new BN(0);

  let targetPower = exponent1 + exponent2 - targetExponent;

  if (targetPower >= 0) {
    return coefficient1
      .mul(coefficient2)
      .mul(new BN(Math.pow(10, targetPower)));
  } else {
    return coefficient1
      .mul(coefficient2)
      .div(new BN(Math.pow(10, -targetPower)));
  }
};

// Formats the oracle price to a target exponent
export function getPrice(oraclePrice: OraclePrice, targetExponent: number): BN {
  if (targetExponent === oraclePrice.exponent) {
    return { ...oraclePrice };
  }

  const delta = targetExponent - oraclePrice.exponent;

  if (delta > 0) {
    return {
      price: oraclePrice.price.div(new BN(10).pow(new BN(delta))),
      exponent: targetExponent,
    };
  } else {
    return {
      price: oraclePrice.price.mul(new BN(10).pow(new BN(Math.abs(delta)))),
      exponent: targetExponent,
    };
  }
}

// The contract uses this as a safety mechanism for stablecoin depegs
export function getOraclePriceForStable(oraclePrice: OraclePrice) {
  const oneUsd = new BN(10).pow(new BN(Math.abs(oraclePrice.exponent)));
  const maxPrice = BN.max(oneUsd, oraclePrice.price);

  return {
    price: maxPrice,
    exponent: oraclePrice.exponent,
  };
}

// Returns the USD value (scaled to the USDC decimals) given an oracle price and token amount
export const getAssetAmountUsd = (
  oracle: OraclePrice,
  tokenAmount: BN,
  tokenDecimals: number,
): BN => {
  if (tokenAmount.eqn(0) || oracle.price.eqn(0)) {
    return new BN(0);
  }

  return checkedDecimalMul(
    tokenAmount,
    -tokenDecimals,
    oracle.price,
    oracle.exponent,
    -USDC_DECIMALS,
  );
};

/* State helpers */

// Returns the amount borrowed from the custody minus interests accrued (i.e. the pure debt)
export function getDebt(custody: Custody) {
  return divCeil(
    BN.max(custody.debt.sub(custody.borrowLendInterestsAccured), new BN(0)),
    DEBT_POWER,
  );
}

// Returns the "true" owned token amount by the custody as the borrowed tokens are not stored in `custody.owned`
export function theoreticallyOwned(custody: Custody) {
  return custody.assets.owned.add(getDebt(custody));
}

// Returns the "true" locked token amount by the custody as the borrowed tokens are not stored in `custody.locked`
export function totalLocked(custody: Custody) {
  return custody.assets.locked.add(getDebt(custody));
}

export function getGlobalShortPnl(custody: Custody, price: BN) {
  const averagePrice = custody.assets.globalShortAveragePrices;
  const priceDelta = averagePrice.sub(price).abs();
  const tradersPnlDelta = custody.assets.globalShortSizes
    .mul(priceDelta)
    .div(averagePrice);

  // if true, pool lost, trader profit
  // if false, pool profit, trader lost
  const tradersHasProfit = averagePrice.gt(price);

  return {
    tradersPnlDelta,
    tradersHasProfit,
  };
}

/* Main */

// Returns the assets under management for a given custody in the pool
export function getAssetUnderManagementUsdForCustody(
  custody: Custody,
  // An OraclePrice object can be constructed by fetching the price of the token scaled to the token's decimals, like so:
  // USDC OraclePrice object:
  //
  // {
  //   price: new BN(10000000),
  //   exponent: -6 // since USDC has 6 decimals
  // }
  //
  custodyPrice: OraclePrice,
) {
  const owned = theoreticallyOwned(custody);

  if (custody.isStable) {
    const aumUsd = getAssetAmountUsd(
      getOraclePriceForStable(custodyPrice as OraclePrice),
      owned,
      custody.decimals,
    );

    return aumUsd;
  } else {
    let tradersPnlDelta = new BN(0);
    let tradersHasProfit = false;
    let aumUsd = custody.assets.guaranteedUsd;

    const netAssetsToken = BN.max(new BN(0), owned.sub(custody.assets.locked));
    const netAssetsUsd = getAssetAmountUsd(
      custodyPrice,
      netAssetsToken,
      custody.decimals,
    );
    aumUsd = aumUsd.add(netAssetsUsd);

    if (custody.assets.globalShortSizes.gtn(0)) {
      ({ tradersPnlDelta, tradersHasProfit } = getGlobalShortPnl(
        custody,
        getPrice(custodyPrice, -USDC_DECIMALS),
      ));

      if (tradersHasProfit) {
        aumUsd = BN.max(new BN(0), aumUsd.sub(tradersPnlDelta));
      } else {
        aumUsd = aumUsd.add(tradersPnlDelta);
      }
    }

    return aumUsd;
  }
}
