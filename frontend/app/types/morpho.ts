export interface MorphoAsset {
  address: string;
  symbol: string;
  decimals: number;
}

export interface MorphoMarketState {
  borrowApy: number;
  supplyApy: number;
  netBorrowApy: number | null;
  netSupplyApy: number | null;
  weeklyBorrowApy: number | null;
  weeklyNetBorrowApy: number | null;
}

export interface MorphoMarket {
  uniqueKey: string;
  lltv: number;
  loanAsset: MorphoAsset;
  collateralAsset: MorphoAsset;
  state: MorphoMarketState;
}

export interface MorphoPosition {
  market: MorphoMarket;
  borrowAssets: string;
  borrowAssetsUsd: number;
  borrowShares: string;
  collateral: string;
  collateralUsd: number;
  supplyAssets: string;
  supplyAssetsUsd: number;
  supplyShares: string;
  healthFactor: number | null;
  priceSource: string;
}

export interface ChainPositions {
  chainId: number;
  chainName: string;
  positions: MorphoPosition[];
}

export interface MorphoResponse {
  success: boolean;
  data?: {
    arbitrum: ChainPositions;
    polygon: ChainPositions;
  };
  error?: string;
}
