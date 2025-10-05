export interface JupiterPosition {
  asset: string;
  assetName: string;
  type: 'supply' | 'borrow';
  amount: number;
  amountUsd: number;
  apy: number;
  shares: string;
  decimals: number;
  priceUsd: number;
}

export interface JupiterChainPositions {
  chainId: number;
  chainName: string;
  protocol: string;
  supplyPositions: JupiterPosition[];
  borrowPositions: JupiterPosition[];
  totalSupplied: number;
  totalBorrowed: number;
  healthFactor: number | null;
  note?: string;
}

export interface JupiterResponse {
  success: boolean;
  data?: {
    solana: JupiterChainPositions;
  };
  error?: string;
}
