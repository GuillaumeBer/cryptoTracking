'use client';

import { useState, useEffect } from 'react';
import { MorphoResponse, ChainPositions, MorphoPosition } from './types/morpho';
import { AaveResponse, AaveChainPositions, AavePosition } from './types/aave';

export default function Home() {
  const [walletAddress, setWalletAddress] = useState('0x3c74c735b5863C0baF52598d8Fd2D59611c8320F');
  const [morphoData, setMorphoData] = useState<MorphoResponse | null>(null);
  const [aaveData, setAaveData] = useState<AaveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchPositions = async () => {
    if (!walletAddress) {
      setError('Please enter a wallet address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch both Morpho and AAVE data in parallel
      const [morphoResponse, aaveResponse] = await Promise.all([
        fetch(`http://localhost:3001/api/morpho?address=${walletAddress}`),
        fetch(`http://localhost:3001/api/aave?address=${walletAddress}`)
      ]);

      const morphoResult = await morphoResponse.json();
      const aaveResult = await aaveResponse.json();

      if (morphoResult.success) {
        setMorphoData(morphoResult);
      }

      if (aaveResult.success) {
        setAaveData(aaveResult);
      }

      if (!morphoResult.success && !aaveResult.success) {
        setError('Failed to fetch positions from both protocols');
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
    if (walletAddress) {
      fetchPositions();
      const interval = setInterval(fetchPositions, 60000); // 60 seconds
      return () => clearInterval(interval);
    }
  }, [walletAddress]);

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

  const getRiskLevel = (currentLTV: number, lltv: number) => {
    const ratio = currentLTV / lltv;
    if (ratio >= 0.95) return { level: 'critical', color: 'bg-red-600', textColor: 'text-red-600' };
    if (ratio >= 0.85) return { level: 'high', color: 'bg-orange-500', textColor: 'text-orange-500' };
    if (ratio >= 0.70) return { level: 'medium', color: 'bg-yellow-500', textColor: 'text-yellow-500' };
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
    const riskLevel = getRiskLevel(currentLTV, lltvDecimal);

    return (
      <div
        key={`${chainName}-${position.market.uniqueKey}`}
        className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg p-6 hover:shadow-lg transition-shadow"
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {position.market.loanAsset.symbol}
            </h3>
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

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">Borrow APY</span>
            <span className="font-mono text-sm font-medium text-red-600 dark:text-red-400">
              {formatPercentage(position.market.state.borrowApy)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">Collateral</span>
            <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
              {formatNumber(parseFloat(position.collateral) / Math.pow(10, position.market.collateralAsset.decimals), 6)} {position.market.collateralAsset.symbol}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">Collateral Value</span>
            <span className="font-mono text-sm font-medium text-green-600 dark:text-green-400">
              ${formatNumber(position.collateralUsd)}
            </span>
          </div>

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
    const riskLevel = getRiskLevel(currentLTV, lltv);

    return (
      <div
        key={`${chainName}-aave-${position.asset}`}
        className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-lg p-6 hover:shadow-lg transition-shadow"
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {position.asset}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{chainName} - AAVE</p>
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
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {formatNumber(collateral.amount, 6)} {collateral.symbol}
                    </span>
                    <span className="font-mono text-xs text-green-600 dark:text-green-400">
                      ${formatNumber(collateral.amountUsd)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

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
  const renderAaveChainPositions = (chainData: AaveChainPositions) => {
    if (chainData.positions.length === 0) {
      return null;
    }

    const totalBorrowed = chainData.positions.reduce(
      (sum, pos) => sum + pos.borrowAmountUsd,
      0
    );

    return (
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-purple-600 dark:text-purple-400">
            AAVE - {chainData.chainName}
          </h3>
          <div className="text-right">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Borrowed</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">
              ${formatNumber(totalBorrowed)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {chainData.positions.map((position) =>
            renderAavePositionCard(position, chainData.chainName)
          )}
        </div>
      </div>
    );
  };

  const renderChainPositions = (chainData: ChainPositions) => {
    if (chainData.positions.length === 0) {
      return null;
    }

    const totalBorrowed = chainData.positions.reduce(
      (sum, pos) => sum + pos.borrowAssetsUsd,
      0
    );

    return (
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400">
            Morpho - {chainData.chainName}
          </h3>
          <div className="text-right">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Borrowed</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">
              ${formatNumber(totalBorrowed)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {chainData.positions.map((position) =>
            renderPositionCard(position, chainData.chainName)
          )}
        </div>
      </div>
    );
  };

  // Calculate grand total from both Morpho and AAVE
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

  const grandTotal = morphoTotal + aaveTotal;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              DeFi Borrowed Positions
            </h1>
            {(morphoData?.data || aaveData?.data) && (
              <div className="text-right bg-white dark:bg-[#1a1a1a] border-2 border-red-200 dark:border-red-800 rounded-xl px-6 py-4 shadow-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Borrowed (All Chains)</p>
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                  ${formatNumber(grandTotal)}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="Enter wallet address"
              className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={fetchPositions}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              {loading ? 'Loading...' : 'Fetch Positions'}
            </button>
          </div>

          {lastUpdate && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Last updated: {lastUpdate.toLocaleTimeString()} (Auto-refresh every minute)
            </p>
          )}
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}

        {loading && !morphoData && !aaveData && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading positions...</p>
          </div>
        )}

        {(morphoData?.data || aaveData?.data) && (
          <div className="space-y-8">
            {/* Arbitrum Section */}
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Arbitrum</h2>
              {morphoData?.data && renderChainPositions(morphoData.data.arbitrum)}
              {aaveData?.data && renderAaveChainPositions(aaveData.data.arbitrum)}
            </div>

            {/* Base Section */}
            {aaveData?.data && aaveData.data.base.positions.length > 0 && (
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Base</h2>
                {renderAaveChainPositions(aaveData.data.base)}
              </div>
            )}

            {/* Polygon Section */}
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Polygon</h2>
              {morphoData?.data && renderChainPositions(morphoData.data.polygon)}
            </div>

            {/* Avalanche Section */}
            {aaveData?.data && aaveData.data.avalanche.positions.length > 0 && (
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Avalanche</h2>
                {renderAaveChainPositions(aaveData.data.avalanche)}
              </div>
            )}

            {/* BNB Chain Section */}
            {aaveData?.data && aaveData.data.bnb.positions.length > 0 && (
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">BNB Chain</h2>
                {renderAaveChainPositions(aaveData.data.bnb)}
              </div>
            )}

            {/* Sonic Section */}
            {aaveData?.data && aaveData.data.sonic.positions.length > 0 && (
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Sonic</h2>
                {renderAaveChainPositions(aaveData.data.sonic)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
