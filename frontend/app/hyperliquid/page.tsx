'use client';

import Link from 'next/link';
import { useClientReady } from '@/hooks/useClientReady';
import { OpportunitiesSection } from './components/OpportunitiesSection';
import { PerpConnectorsSection } from './components/PerpConnectorsSection';
import { PositionsSection } from './components/PositionsSection';
import { RecommendationSection } from './components/RecommendationSection';
import { useHyperliquidOpportunities } from './hooks/useHyperliquidOpportunities';
import { useHyperliquidPositions } from './hooks/useHyperliquidPositions';
import { usePerpConnectors } from './hooks/usePerpConnectors';
import type { HyperliquidOpportunityFilters, PerpConnectorMode } from './types';

const DEFAULT_OPPORTUNITY_FILTERS: HyperliquidOpportunityFilters = {
  limit: 12,
  minOpenInterestUsd: 3_000_000,
  minVolumeUsd: 1_000_000,
  direction: 'short',
  sort: 'score',
  notionalUsd: 10_000,
};

export default function HyperliquidPage() {
  const isClient = useClientReady();

  const {
    walletAddress,
    setWalletAddress,
    positions,
    loading: positionsLoading,
    error: positionsError,
    lastUpdate,
    totalNetGain,
    totalNetGainAllTime,
    refresh: refreshPositions,
  } = useHyperliquidPositions(process.env.NEXT_PUBLIC_DEFAULT_EVM_ADDRESS || '');

  const {
    connectors: perpConnectors,
    summaries: perpSummary,
    mode: perpMode,
    loading: perpLoading,
    error: perpError,
    refresh: refreshPerpConnectors,
  } = usePerpConnectors();

  const {
    opportunities,
    totals: opportunityTotals,
    filters: opportunityFilters,
    setFilters: setOpportunityFilters,
    loading: opportunitiesLoading,
    error: opportunitiesError,
    lastUpdated: lastOpportunityFetch,
    refresh: refreshOpportunities,
  } = useHyperliquidOpportunities({
    initialFilters: DEFAULT_OPPORTUNITY_FILTERS,
    connectors: perpConnectors,
  });

  const handlePerpModeChange = (mode: PerpConnectorMode) => {
    if (mode !== perpMode) {
      void refreshPerpConnectors(mode);
    }
  };

  const handlePerpRefresh = () => {
    void refreshPerpConnectors(perpMode);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6 sm:p-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 mb-8 transition-colors duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Back to Home</span>
          </Link>

          <div className="flex flex-col gap-6 mb-8">
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white">Hyperliquid Delta Neutral</h1>
            <p className="text-base text-slate-600 dark:text-slate-300 max-w-3xl">
              Stay on top of funding opportunities, connector performance, and your wallet’s short exposure with a modular dashboard
              designed for quick decisions.
            </p>
          </div>
        </div>

        <RecommendationSection walletAddress={walletAddress} filters={opportunityFilters} />

        <OpportunitiesSection
          filters={opportunityFilters}
          setFilters={setOpportunityFilters}
          totals={opportunityTotals}
          opportunities={opportunities}
          loading={opportunitiesLoading}
          error={opportunitiesError}
          lastUpdated={lastOpportunityFetch}
          onRefresh={() => {
            void refreshOpportunities();
          }}
        />

        <PerpConnectorsSection
          connectors={perpConnectors}
          summaries={perpSummary}
          mode={perpMode}
          loading={perpLoading}
          error={perpError}
          onModeChange={handlePerpModeChange}
          onRefresh={handlePerpRefresh}
        />

        <PositionsSection
          positions={positions}
          loading={positionsLoading}
          error={positionsError}
          lastUpdate={lastUpdate}
          walletAddress={walletAddress}
          onWalletAddressChange={setWalletAddress}
          onRefresh={refreshPositions}
          totalNetGain={totalNetGain}
          totalNetGainAllTime={totalNetGainAllTime}
          isClient={isClient}
        />
      </div>
    </div>
  );
}
