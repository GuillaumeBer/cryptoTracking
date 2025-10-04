export interface CollateralAsset {
  symbol: string;
  name: string;
  amount: number;
  amountUsd: number;
}

export interface AavePosition {
  asset: string;
  assetName: string;
  borrowAmount: string;
  borrowAmountFormatted: number;
  borrowAmountUsd: number;
  variableDebt: string;
  stableDebt: string;
  borrowRate: string;
  borrowRateFormatted: number;
  collateralAmount: string;
  collateralAmountFormatted: number;
  collateralAmountUsd: number;
  collateralAssets: CollateralAsset[];
  decimals: number;
  liquidationThreshold: number;
  maxLTV: number;
  usageAsCollateral: boolean;
}

export interface AaveChainPositions {
  chainId: number;
  chainName: string;
  positions: AavePosition[];
}

export interface AaveResponse {
  success: boolean;
  data?: {
    arbitrum: AaveChainPositions;
    base: AaveChainPositions;
    avalanche: AaveChainPositions;
    bnb: AaveChainPositions;
    sonic: AaveChainPositions;
  };
  error?: string;
}
