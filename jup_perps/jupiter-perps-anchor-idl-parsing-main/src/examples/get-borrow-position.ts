import { PublicKey } from "@solana/web3.js";
import {
  BORROW_SIZE_PRECISION,
  DOVES_PROGRAM,
  JLP_MINT_PUBKEY,
  JLP_POOL_ACCOUNT_PUBKEY,
  JUPITER_PERPETUALS_PROGRAM,
  JUPITER_PERPETUALS_PROGRAM_ID,
  RPC_CONNECTION,
} from "../constants";
import { BN } from "@coral-xyz/anchor";
import { BorrowPosition, Custody, OraclePrice } from "../types";
import { divCeil } from "../utils";
import { getAssetAmountUsd } from "./calculate-pool-aum";
import { getMint } from "@solana/spl-token";

// The `BorrowPosition` PDA stores the position data for a borrower's onchain position
// Use this to generate the PDA for borrow positions
export function generateBorrowPositionPda({
  walletAddress,
  custody,
}: {
  walletAddress: PublicKey;
  custody: PublicKey;
}) {
  const [position, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("borrow_lend"),
      JLP_POOL_ACCOUNT_PUBKEY.toBuffer(),
      walletAddress.toBuffer(),
      custody.toBuffer(),
    ],
    JUPITER_PERPETUALS_PROGRAM_ID,
  );

  return { position, bump };
}

export function getBorrowTokenAmount(borrowPosition: BorrowPosition) {
  return divCeil(borrowPosition.borrowSize, BORROW_SIZE_PRECISION);
}

export function updateInterestsAccumulated(
  custody: Custody,
  borrowPosition: BorrowPosition,
) {
  // If it's a new position, there's no interests accumulated
  if (
    borrowPosition.borrowSize.eqn(0) ||
    borrowPosition.cumulativeCompoundedInterestSnapshot.eqn(0)
  ) {
    return new BN(0);
  }

  const compoundedInterestIndex =
    custody.borrowsFundingRateState.cumulativeInterestRate;

  const interests = divCeil(
    compoundedInterestIndex
      .sub(borrowPosition.cumulativeCompoundedInterestSnapshot)
      .mul(borrowPosition.borrowSize),
    borrowPosition.cumulativeCompoundedInterestSnapshot,
  );

  return interests;
}

export function formatBorrowPosition({
  borrowPosition,
  custody,
  custodyPrice,
  jlpTokenSupply,
  aumUsd,
}: {
  borrowPosition: BorrowPosition;
  custody: Custody;
  custodyPrice: OraclePrice;
  jlpTokenSupply: BN;
  jlpPrice: OraclePrice;
  aumUsd: BN;
}) {
  const interests = updateInterestsAccumulated(custody, borrowPosition);
  borrowPosition.borrowSize = borrowPosition.borrowSize.add(interests);

  // Scaled to 6 precision as per the USDC mint
  const borrowSizeTokenAmount = getBorrowTokenAmount(borrowPosition);
  // Scaled to 6 precision as per the USDC mint
  const borrowSizeUsd = getAssetAmountUsd(
    custodyPrice,
    borrowSizeTokenAmount,
    custody.decimals,
  );

  // Scaled to 6 precision as per the USDC mint
  const lockedCollateralUsd = aumUsd
    .mul(borrowPosition.lockedCollateral)
    .div(jlpTokenSupply);

  return {
    borrowSize: borrowPosition.borrowSize,
    borrowSizeTokenAmount,
    borrowSizeUsd,
    borrowTokenMint: custody.mint.toString(),
    lockedCollateral: borrowPosition.lockedCollateral,
    lockedCollateralUsd,
  };
}

// Only USDC borrowing is enabled
export async function getBorrowPosition(borrowPositionPubkey: PublicKey) {
  const borrowPosition =
    await JUPITER_PERPETUALS_PROGRAM.account.borrowPosition.fetch(
      borrowPositionPubkey,
    );

  const custody = await JUPITER_PERPETUALS_PROGRAM.account.custody.fetch(
    borrowPosition.custody,
  );

  const oracleAccount = await DOVES_PROGRAM.account.agPriceFeed.fetch(
    custody.dovesAgOracle,
  );

  const oraclePrice = {
    price: oracleAccount.price,
    exponent: oracleAccount.expo,
  } as OraclePrice;

  const pool = await JUPITER_PERPETUALS_PROGRAM.account.pool.fetch(
    JLP_POOL_ACCOUNT_PUBKEY,
  );

  const jlpMint = await getMint(RPC_CONNECTION, JLP_MINT_PUBKEY, "confirmed");

  const formattedBorrowPosition = formatBorrowPosition({
    borrowPosition,
    custody,
    custodyPrice: oraclePrice,
    jlpTokenSupply: new BN(jlpMint.supply.toString()),
    aumUsd: pool.aumUsd,
  });

  return formattedBorrowPosition;
}
