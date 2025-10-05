'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MorphoResponse, MorphoPosition } from '../types/morpho';
import { AaveResponse, AavePosition } from '../types/aave';
import { JupiterResponse, JupiterPosition } from '../types/jupiter';
import { endpoints } from '@/lib/api-config';

type SortOption = 'healthFactor' | 'borrowed' | 'collateral' | 'risk';
type FilterProtocol = 'all' | 'morpho' | 'aave' | 'jupiter';

export default function BorrowingPage() {
  const [walletAddress, setWalletAddress] = useState('');
  const [solanaAddress, setSolanaAddress] = useState('');
  const [morphoData, setMorphoData] = useState<MorphoResponse | null>(null);
  const [aaveData, setAaveData] = useState<AaveResponse | null>(null);
  const [jupiterData, setJupiterData] = useState<JupiterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Filters and sorting
  const [sortBy, setSortBy] = useState<SortOption>('healthFactor');
  const [filterProtocol, setFilterProtocol] = useState<FilterProtocol>('all');
  const [filterChain, setFilterChain] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchPositions = async () => {
    if (!walletAddress && !solanaAddress) {
      setError('Please enter at least one wallet address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const promises = [];

      // Fetch EVM protocols if EVM address is provided
      if (walletAddress) {
        promises.push(
          fetch(endpoints.morpho(walletAddress)),
          fetch(endpoints.aave(walletAddress))
        );
      } else {
        promises.push(Promise.resolve(null), Promise.resolve(null));
      }

      // Fetch Jupiter if Solana address is provided
      if (solanaAddress) {
        promises.push(
          fetch(endpoints.jupiter(solanaAddress))
        );
      } else {
        promises.push(Promise.resolve(null));
      }

      const [morphoResponse, aaveResponse, jupiterResponse] = await Promise.all(promises);

      if (morphoResponse) {
        const morphoResult = await morphoResponse.json();
        if (morphoResult.success) {
          setMorphoData(morphoResult);
        }
      } else {
        setMorphoData(null);
      }

      if (aaveResponse) {
        const aaveResult = await aaveResponse.json();
        if (aaveResult.success) {
          setAaveData(aaveResult);
        }
      } else {
        setAaveData(null);
      }

      if (jupiterResponse) {
        const jupiterResult = await jupiterResponse.json();
        if (jupiterResult.success) {
          setJupiterData(jupiterResult);
        }
      } else {
        setJupiterData(null);
      }

      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every minute
  useEffect(() => {
    if (walletAddress || solanaAddress) {
      fetchPositions();
      const interval = setInterval(fetchPositions, 60000); // 60 seconds
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, solanaAddress]);

  const formatNumber = (value: number, decimals: number = 2) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${formatNumber(value * 100, 2)}%`;
  };

  const formatSimplePercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const calculateLTV = (borrowUsd: number, collateralUsd: number) => {
    if (collateralUsd === 0) return 0;
    return borrowUsd / collateralUsd;
  };

  const getRiskLevelFromHealthFactor = (healthFactor: number | null) => {
    if (healthFactor === null) return { level: 'safe', color: 'bg-green-500', textColor: 'text-green-500' };
    if (healthFactor < 1.05) return { level: 'critical', color: 'bg-red-600', textColor: 'text-red-600' };
    if (healthFactor < 1.25) return { level: 'high', color: 'bg-orange-500', textColor: 'text-orange-500' };
    if (healthFactor < 1.5) return { level: 'medium', color: 'bg-yellow-500', textColor: 'text-yellow-500' };
    return { level: 'safe', color: 'bg-green-500', textColor: 'text-green-500' };
  };

  const renderPositionCard = (position: MorphoPosition, chainName: string) => {
    const currentLTV = calculateLTV(position.borrowAssetsUsd, position.collateralUsd);

    // LLTV comes as a huge number (e.g., 860000000000000000 for 86%)
    // We need to divide by 10^18 to get the decimal value
    const lltvDecimal = position.market.lltv / 1e18;

    const ltvPercentage = currentLTV * 100;
    const lltvPercentage = lltvDecimal * 100;
    const ltvRatio = (currentLTV / lltvDecimal) * 100;
    const riskLevel = getRiskLevelFromHealthFactor(position.healthFactor);

    return (
      <div
        className="bg-gradient-to-br from-white to-gray-50 dark:from-[#1a1a1a] dark:to-[#0f0f0f] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300"
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {position.market.loanAsset.symbol}
              </h3>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                Morpho
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{chainName}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 dark:text-gray-400">Borrowed</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">
              ${formatNumber(position.borrowAssetsUsd)}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">Borrow Amount</span>
            <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
              {formatNumber(parseFloat(position.borrowAssets) / Math.pow(10, position.market.loanAsset.decimals), 6)} {position.market.loanAsset.symbol}
            </span>
          </div>

          <div className="space-y-2">
            {/* Use weekly average if available, otherwise instant */}
            {position.market.state.weeklyBorrowApy !== null ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Borrow APY (7d avg)</span>
                  <span className="font-mono text-sm font-medium text-red-600 dark:text-red-400">
                    {formatPercentage(position.market.state.weeklyBorrowApy)}
                  </span>
                </div>

                {position.market.state.weeklyNetBorrowApy !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Net Borrow APY (7d avg)</span>
                    <span className={`font-mono text-sm font-bold ${position.market.state.weeklyNetBorrowApy < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatPercentage(position.market.state.weeklyNetBorrowApy)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Borrow APY</span>
                  <span className="font-mono text-sm font-medium text-red-600 dark:text-red-400">
                    {formatPercentage(position.market.state.borrowApy)}
                  </span>
                </div>

                {position.market.state.netBorrowApy !== null && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Net Borrow APY</span>
                    <span className={`font-mono text-sm font-bold ${position.market.state.netBorrowApy < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatPercentage(position.market.state.netBorrowApy)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">Collateral</span>
            <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
              {formatNumber(parseFloat(position.collateral) / Math.pow(10, position.market.collateralAsset.decimals), 6)} {position.market.collateralAsset.symbol}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Collateral Value</span>
              <span className="font-mono text-sm font-medium text-green-600 dark:text-green-400">
                ${formatNumber(position.collateralUsd)}
              </span>
            </div>
            <div className="flex justify-end">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                position.priceSource === 'morpho-api' ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' :
                'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}>
                {position.priceSource}
              </span>
            </div>
          </div>

          {/* Health Factor */}
          {position.healthFactor !== null && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Health Factor</span>
                <span className={`font-mono text-lg font-bold ${riskLevel.textColor}`}>
                  {formatNumber(position.healthFactor, 2)}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Liquidation occurs when health factor {'<'} 1.0
              </p>
            </div>
          )}

          {/* LTV vs LLTV Visual Indicator */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Liquidation Risk</span>
              <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${riskLevel.color} text-white`}>
                {riskLevel.level}
              </span>
            </div>

            <div className="space-y-3">
              {/* Visual Progress Bar */}
              <div className="relative w-full h-10 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden shadow-inner">
                {/* Current LTV Bar */}
                <div
                  className={`absolute top-0 left-0 h-full ${riskLevel.color} transition-all duration-500 ease-out`}
                  style={{ width: `${Math.min(ltvRatio, 100)}%` }}
                >
                  {/* Inner glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white opacity-20"></div>
                </div>

                {/* Percentage Display Inside Bar */}
                <div className="absolute inset-0 flex items-center px-3">
                  <span className="text-sm font-bold text-white drop-shadow-lg z-10">
                    {formatSimplePercentage(ltvPercentage)}
                  </span>
                </div>

                {/* Max Threshold Marker */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-700 dark:text-gray-200">
                  Max: {formatSimplePercentage(lltvPercentage)}
                </div>
              </div>
            </div>
          </div>

          {parseFloat(position.supplyAssets) > 0 && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Supply Amount</span>
                  <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                    {formatNumber(parseFloat(position.supplyAssets) / Math.pow(10, position.market.loanAsset.decimals), 6)} {position.market.loanAsset.symbol}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Supply Value</span>
                  <span className="font-mono text-sm font-medium text-green-600 dark:text-green-400">
                    ${formatNumber(position.supplyAssetsUsd)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Supply APY</span>
                  <span className="font-mono text-sm font-medium text-green-600 dark:text-green-400">
                    {formatPercentage(position.market.state.supplyApy)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // AAVE Position Card Renderer
  const renderAavePositionCard = (position: AavePosition, chainName: string) => {
    const currentLTV = calculateLTV(position.borrowAmountUsd, position.collateralAmountUsd);
    const lltv = position.liquidationThreshold;
    const ltvPercentage = currentLTV * 100;
    const lltvPercentage = lltv * 100;
    const ltvRatio = (currentLTV / lltv) * 100;
    const riskLevel = getRiskLevelFromHealthFactor(position.healthFactor);

    return (
      <div
        className="bg-gradient-to-br from-white to-gray-50 dark:from-[#1a1a1a] dark:to-[#0f0f0f] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300"
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {position.asset}
              </h3>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                AAVE
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{chainName}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 dark:text-gray-400">Borrowed</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">
              ${formatNumber(position.borrowAmountUsd)}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">Borrow Amount</span>
            <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
              {formatNumber(position.borrowAmountFormatted, 6)} {position.asset}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">Borrow APY</span>
            <span className="font-mono text-sm font-medium text-red-600 dark:text-red-400">
              {formatSimplePercentage(position.borrowRateFormatted * 100)}
            </span>
          </div>

          {/* Collateral Assets */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Collateral</span>
              <span className="font-mono text-sm font-bold text-green-600 dark:text-green-400">
                ${formatNumber(position.collateralAmountUsd)}
              </span>
            </div>

            {position.collateralAssets && position.collateralAssets.length > 0 && (
              <div className="space-y-2 mt-2 pl-3 border-l-2 border-green-500 dark:border-green-600">
                {position.collateralAssets.map((collateral, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {formatNumber(collateral.amount, 6)} {collateral.symbol}
                      </span>
                      <span className="font-mono text-xs text-green-600 dark:text-green-400">
                        ${formatNumber(collateral.amountUsd)}
                      </span>
                    </div>
                    <div className="flex justify-end">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        collateral.priceSource === 'binance' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200' :
                        collateral.priceSource === 'coingecko' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
                        collateral.priceSource === 'fallback' ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200' :
                        'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                        {collateral.priceSource}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Health Factor */}
          {position.healthFactor !== null && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Health Factor</span>
                <span className={`font-mono text-lg font-bold ${riskLevel.textColor}`}>
                  {formatNumber(position.healthFactor, 2)}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Liquidation occurs when health factor {'<'} 1.0
              </p>
            </div>
          )}

          {/* LTV vs LLTV Visual Indicator */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Liquidation Risk</span>
              <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${riskLevel.color} text-white`}>
                {riskLevel.level}
              </span>
            </div>

            <div className="space-y-3">
              <div className="relative w-full h-10 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden shadow-inner">
                <div
                  className={`absolute top-0 left-0 h-full ${riskLevel.color} transition-all duration-500 ease-out`}
                  style={{ width: `${Math.min(ltvRatio, 100)}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white opacity-20"></div>
                </div>

                <div className="absolute inset-0 flex items-center px-3">
                  <span className="text-sm font-bold text-white drop-shadow-lg z-10">
                    {formatSimplePercentage(ltvPercentage)}
                  </span>
                </div>

                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-700 dark:text-gray-200">
                  Max: {formatSimplePercentage(lltvPercentage)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // AAVE Chain Positions Renderer
  // Calculate grand total from Morpho, AAVE and Jupiter
  const morphoTotal = morphoData?.data
    ? (morphoData.data.arbitrum.positions.reduce((sum, pos) => sum + pos.borrowAssetsUsd, 0) +
       morphoData.data.polygon.positions.reduce((sum, pos) => sum + pos.borrowAssetsUsd, 0))
    : 0;

  const aaveTotal = aaveData?.data
    ? (aaveData.data.arbitrum.positions.reduce((sum, pos) => sum + pos.borrowAmountUsd, 0) +
       aaveData.data.base.positions.reduce((sum, pos) => sum + pos.borrowAmountUsd, 0) +
       aaveData.data.avalanche.positions.reduce((sum, pos) => sum + pos.borrowAmountUsd, 0) +
       aaveData.data.bnb.positions.reduce((sum, pos) => sum + pos.borrowAmountUsd, 0) +
       aaveData.data.sonic.positions.reduce((sum, pos) => sum + pos.borrowAmountUsd, 0))
    : 0;

  const jupiterTotal = jupiterData?.data?.solana?.totalBorrowed || 0;

  const grandTotal = morphoTotal + aaveTotal + jupiterTotal;

  // Get all unique chains
  const getAllChains = () => {
    const chains = new Set<string>();
    if (morphoData?.data) {
      chains.add(morphoData.data.arbitrum.chainName);
      chains.add(morphoData.data.polygon.chainName);
    }
    if (aaveData?.data) {
      chains.add(aaveData.data.arbitrum.chainName);
      chains.add(aaveData.data.base.chainName);
      chains.add(aaveData.data.avalanche.chainName);
      chains.add(aaveData.data.bnb.chainName);
      chains.add(aaveData.data.sonic.chainName);
    }
    if (jupiterData?.data?.solana) {
      chains.add(jupiterData.data.solana.chainName);
    }
    return Array.from(chains).sort();
  };

  // Aggregate all positions from all chains and protocols
  const getAllPositions = () => {
    const allPositions: Array<{
      type: 'morpho' | 'aave' | 'jupiter';
      chainName: string;
      position: MorphoPosition | AavePosition | JupiterPosition;
      healthFactor: number | null;
      borrowedUsd: number;
      collateralUsd: number;
      asset: string;
    }> = [];

    // Add Morpho positions
    if (morphoData?.data) {
      morphoData.data.arbitrum.positions.forEach(pos => {
        allPositions.push({
          type: 'morpho',
          chainName: morphoData.data!.arbitrum.chainName,
          position: pos,
          healthFactor: pos.healthFactor,
          borrowedUsd: pos.borrowAssetsUsd,
          collateralUsd: pos.collateralUsd,
          asset: pos.market.loanAsset.symbol,
        });
      });
      morphoData.data.polygon.positions.forEach(pos => {
        allPositions.push({
          type: 'morpho',
          chainName: morphoData.data!.polygon.chainName,
          position: pos,
          healthFactor: pos.healthFactor,
          borrowedUsd: pos.borrowAssetsUsd,
          collateralUsd: pos.collateralUsd,
          asset: pos.market.loanAsset.symbol,
        });
      });
    }

    // Add AAVE positions
    if (aaveData?.data) {
      aaveData.data.arbitrum.positions.forEach(pos => {
        allPositions.push({
          type: 'aave',
          chainName: aaveData.data!.arbitrum.chainName,
          position: pos,
          healthFactor: pos.healthFactor,
          borrowedUsd: pos.borrowAmountUsd,
          collateralUsd: pos.collateralAmountUsd,
          asset: pos.asset,
        });
      });
      aaveData.data.base.positions.forEach(pos => {
        allPositions.push({
          type: 'aave',
          chainName: aaveData.data!.base.chainName,
          position: pos,
          healthFactor: pos.healthFactor,
          borrowedUsd: pos.borrowAmountUsd,
          collateralUsd: pos.collateralAmountUsd,
          asset: pos.asset,
        });
      });
      aaveData.data.avalanche.positions.forEach(pos => {
        allPositions.push({
          type: 'aave',
          chainName: aaveData.data!.avalanche.chainName,
          position: pos,
          healthFactor: pos.healthFactor,
          borrowedUsd: pos.borrowAmountUsd,
          collateralUsd: pos.collateralAmountUsd,
          asset: pos.asset,
        });
      });
      aaveData.data.bnb.positions.forEach(pos => {
        allPositions.push({
          type: 'aave',
          chainName: aaveData.data!.bnb.chainName,
          position: pos,
          healthFactor: pos.healthFactor,
          borrowedUsd: pos.borrowAmountUsd,
          collateralUsd: pos.collateralAmountUsd,
          asset: pos.asset,
        });
      });
      aaveData.data.sonic.positions.forEach(pos => {
        allPositions.push({
          type: 'aave',
          chainName: aaveData.data!.sonic.chainName,
          position: pos,
          healthFactor: pos.healthFactor,
          borrowedUsd: pos.borrowAmountUsd,
          collateralUsd: pos.collateralAmountUsd,
          asset: pos.asset,
        });
      });
    }

    // Add Jupiter positions
    if (jupiterData?.data?.solana) {
      jupiterData.data.solana.borrowPositions.forEach(pos => {
        allPositions.push({
          type: 'jupiter',
          chainName: jupiterData.data!.solana.chainName,
          position: pos,
          healthFactor: jupiterData.data!.solana.healthFactor,
          borrowedUsd: pos.amountUsd,
          collateralUsd: jupiterData.data!.solana.totalSupplied,
          asset: pos.asset,
        });
      });
    }

    // Filter by protocol
    let filtered = allPositions;
    if (filterProtocol !== 'all') {
      filtered = filtered.filter(p => p.type === filterProtocol);
    }

    // Filter by chain
    if (filterChain !== 'all') {
      filtered = filtered.filter(p => p.chainName === filterChain);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(p =>
        p.asset.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.chainName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort positions
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'healthFactor':
          if (a.healthFactor === null) return 1;
          if (b.healthFactor === null) return -1;
          return a.healthFactor - b.healthFactor;
        case 'borrowed':
          return b.borrowedUsd - a.borrowedUsd;
        case 'collateral':
          return b.collateralUsd - a.collateralUsd;
        case 'risk': {
          const getRisk = (hf: number | null) => {
            if (hf === null) return 0;
            if (hf < 1.05) return 4;
            if (hf < 1.25) return 3;
            if (hf < 1.5) return 2;
            return 1;
          };
          return getRisk(b.healthFactor) - getRisk(a.healthFactor);
        }
        default:
          return 0;
      }
    });

    return sorted;
  };

  const allPositions = getAllPositions();
  const availableChains = getAllChains();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-[#0a0a0a] dark:to-[#1a1a1a] p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Back Button */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>

          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-6">
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
              Borrowing Positions
            </h1>
            {(morphoData?.data || aaveData?.data || jupiterData?.data) && (
              <div className="bg-gradient-to-br from-white to-gray-50 dark:from-[#1a1a1a] dark:to-[#0f0f0f] border border-red-200 dark:border-red-800 rounded-2xl px-6 py-4 shadow-xl">
                <p className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1 font-semibold">Total Borrowed</p>
                <p className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-red-600 to-pink-600 dark:from-red-400 dark:to-pink-400 bg-clip-text text-transparent">
                  ${formatNumber(grandTotal)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{allPositions.length} position{allPositions.length !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>

          {/* Wallet Input */}
          <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-gray-800">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">EVM Address (Morpho, AAVE)</label>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#0f0f0f] text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Solana Address (Jupiter)</label>
                <input
                  type="text"
                  value={solanaAddress}
                  onChange={(e) => setSolanaAddress(e.target.value)}
                  placeholder="Solana address..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#0f0f0f] text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
            <button
              onClick={fetchPositions}
              disabled={loading}
              className="w-full px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-xl transition-all shadow-md hover:shadow-lg disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading...
                </span>
              ) : 'Fetch All Positions'}
            </button>

            {lastUpdate && (
              <div className="flex items-center gap-2 mt-3 text-xs text-gray-500 dark:text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Last updated: {lastUpdate.toLocaleTimeString()} • Auto-refresh: 60s
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl shadow-md">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-800 dark:text-red-300 font-medium">{error}</p>
            </div>
          </div>
        )}

        {loading && !morphoData && !aaveData && !jupiterData && (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-gray-200 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400"></div>
            <p className="mt-6 text-lg text-gray-600 dark:text-gray-400 font-medium">Loading positions...</p>
          </div>
        )}

        {(morphoData?.data || aaveData?.data || jupiterData?.data) && (
          <div className="space-y-6">
            {/* Filters and Sorting */}
            <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-lg p-6 border border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters & Sorting
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Search */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Search Asset</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ETH, USDC..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#0f0f0f] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Protocol Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Protocol</label>
                  <select
                    value={filterProtocol}
                    onChange={(e) => setFilterProtocol(e.target.value as FilterProtocol)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#0f0f0f] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="all">All Protocols</option>
                    <option value="morpho">Morpho</option>
                    <option value="aave">AAVE</option>
                    <option value="jupiter">Jupiter</option>
                  </select>
                </div>

                {/* Chain Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Chain</label>
                  <select
                    value={filterChain}
                    onChange={(e) => setFilterChain(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#0f0f0f] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="all">All Chains</option>
                    {availableChains.map(chain => (
                      <option key={chain} value={chain}>{chain}</option>
                    ))}
                  </select>
                </div>

                {/* Sort By */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-[#0f0f0f] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="healthFactor">Health Factor ↑</option>
                    <option value="risk">Risk Level ↓</option>
                    <option value="borrowed">Borrowed Amount ↓</option>
                    <option value="collateral">Collateral Amount ↓</option>
                  </select>
                </div>
              </div>

              {/* Active Filters Summary */}
              {(filterProtocol !== 'all' || filterChain !== 'all' || searchTerm) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {filterProtocol !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-xs font-medium">
                      {filterProtocol}
                      <button onClick={() => setFilterProtocol('all')} className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  )}
                  {filterChain !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-xs font-medium">
                      {filterChain}
                      <button onClick={() => setFilterChain('all')} className="hover:bg-purple-200 dark:hover:bg-purple-800 rounded-full p-0.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  )}
                  {searchTerm && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-xs font-medium">
                      Search: {searchTerm}
                      <button onClick={() => setSearchTerm('')} className="hover:bg-green-200 dark:hover:bg-green-800 rounded-full p-0.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setFilterProtocol('all');
                      setFilterChain('all');
                      setSearchTerm('');
                    }}
                    className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {/* Positions Grid */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {allPositions.length === 0 ? 'No positions found' : `${allPositions.length} Position${allPositions.length !== 1 ? 's' : ''}`}
                </h2>
                {allPositions.length > 0 && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Showing {allPositions.length} of {getAllPositions().length} total
                  </span>
                )}
              </div>

              {allPositions.length === 0 ? (
                <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-lg p-12 text-center border border-gray-200 dark:border-gray-800">
                  <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">No positions match your filters</p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Try adjusting your search criteria</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {allPositions.map((item, index) => {
                    if (item.type === 'morpho') {
                      return (
                        <div key={`all-morpho-${item.chainName}-${(item.position as MorphoPosition).market.uniqueKey}-${index}`}>
                          {renderPositionCard(item.position as MorphoPosition, item.chainName)}
                        </div>
                      );
                    } else if (item.type === 'aave') {
                      return (
                        <div key={`all-aave-${item.chainName}-${(item.position as AavePosition).asset}-${index}`}>
                          {renderAavePositionCard(item.position as AavePosition, item.chainName)}
                        </div>
                      );
                    } else {
                      // Jupiter position
                      const jupiterPos = item.position as JupiterPosition;
                      return (
                        <div key={`all-jupiter-${item.chainName}-${jupiterPos.asset}-${index}`}>
                          <div className="bg-gradient-to-br from-white to-gray-50 dark:from-[#1a1a1a] dark:to-[#0f0f0f] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {jupiterPos.asset}
                                  </h3>
                                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                                    Jupiter
                                  </span>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{item.chainName}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-gray-500 dark:text-gray-400">Borrowed</p>
                                <p className="text-xl font-bold text-red-600 dark:text-red-400">
                                  ${formatNumber(jupiterPos.amountUsd)}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600 dark:text-gray-400">Borrow Amount</span>
                                <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                                  {formatNumber(jupiterPos.amount, 6)} {jupiterPos.asset}
                                </span>
                              </div>

                              <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600 dark:text-gray-400">Borrow APY</span>
                                <span className="font-mono text-sm font-medium text-red-600 dark:text-red-400">
                                  {formatNumber(jupiterPos.apy, 2)}%
                                </span>
                              </div>

                              {item.healthFactor !== null && (
                                <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Health Factor</span>
                                    <span className={`font-mono text-lg font-bold ${
                                      item.healthFactor < 1.05 ? 'text-red-600 dark:text-red-400' :
                                      item.healthFactor < 1.25 ? 'text-orange-500 dark:text-orange-400' :
                                      item.healthFactor < 1.5 ? 'text-yellow-500 dark:text-yellow-400' :
                                      'text-green-500 dark:text-green-400'
                                    }`}>
                                      {formatNumber(item.healthFactor, 2)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Liquidation occurs when health factor {'<'} 1.0
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
