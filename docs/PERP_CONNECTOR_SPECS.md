# Perpetual Connector Specification Workstream

## Overview
This document seeds the connector workstream for onboarding new perpetual venues into the delta-neutral scouting engine. It captures required capabilities, data sourcing, and open questions for each prioritized venue.

### Shared Requirements
- **Core metrics**: mark price, funding rate (current + annualized), open interest, taker/maker fees, min tick/size.
- **Liquidity context**: order book depth (top 5 levels), 24h volume, available leverage tiers, margin asset.
- **Risk telemetry**: liquidation thresholds, maintenance margin, insurance fund status, API health.
- **Frequency**: funding snapshot every 1m, order book depth every 10s, metadata refresh every 10m.
- **Transport**: prefer WebSocket streaming; fall back to REST polling with rate limit guardrails.
- **Outputs**: standardized JSON payload consumed by `perpAdapters/*` with schema versioning and completeness flags.

---

## Aster
- **API**: REST (`https://api.asterdex.com/v1/perp/*`), WebSocket for book updates.
- **Auth**: API key (read-only) requested via support desk.
- **Endpoints to confirm**:
  - `GET /funding/history?symbol=` for 7/30/90-day funding.
  - `GET /markets` for tick sizes, leverage tiers, fee schedule.
  - WebSocket `@bookTicker` / `@depth` streams.
- **Data gaps**: need clarity on hidden-order liquidity visibility and yield-bearing margin exposure.
- **Action items**:
  1. ✅ Request sandbox API key (stored as env `ASTER_API_KEY` / `ASTER_SECRET_KEY`).
  2. Capture 24h funding sample for top 10 pairs and validate against DefiLlama metrics.
  3. Document throttling rules and fallback plan.

## Avantis
- **API**: GraphQL (`https://api.avantisfi.com/graphql`) for analytics + Trader SDK utilities (Base RPC access, pair cache) described at [sdk.avantisfi.com](https://sdk.avantisfi.com/getting_started.html#installation).
- **Installation (optional but recommended for diagnostics)**:
  ```bash
  pip install avantis-trader-sdk
  ```
  ```python
  import asyncio
  from avantis_trader_sdk import TraderClient

  async def main():
      client = TraderClient("https://mainnet.base.org")
      info = await client.pairs_cache.get_pairs_info()
      print(info)

  if __name__ == "__main__":
      asyncio.run(main())
  ```
- **Auth / configuration**:
  - `AVANTIS_GRAPHQL_URL` (defaults to `https://api.avantisfi.com/graphql`)
  - `AVANTIS_BASE_RPC_URL` (defaults to `https://mainnet.base.org`) is passed to the SDK when run locally.
  - GraphQL endpoint currently works without an API key; request read-only credentials if higher quotas are required.
- **GraphQL queries**:
  - `perpMarkets` for symbol metadata, funding, depth
  - `fundingRates` for historical data
  - `liquiditySnapshots` for TVL / depth
- **Current connector implementation**:
  - Live metadata pulled from `socket-api-pub.avantisfi.com` with mark price sourced via Pyth Hermes.
  - Funding rate approximated from the venue’s dynamic margin fee with sign driven by open interest skew.
  - Depth levels synthesized from the reported one-percent depth bands until native order book snapshots are exposed.
- **Action items**:
  1. Define GraphQL fragments for scouting needs.
  2. Confirm Base network RPC requirements (`AVANTIS_BASE_RPC_URL`) for on-chain verification.
  3. Document when to escalate for an Avantis API key (only if analytics endpoints require it).

## Jupiter Perps
- **API**: gRPC/WebSocket via Jupiter aggregator.
- **Auth**: public, rate-limited.
- **Data focus**:
  - Funding and borrow once SDK exposes endpoints (track `@jup-ag/lend` updates).
  - Order flow share metrics for cross-venue routing signal.
- **Action items**:
  1. Monitor SDK changelog for borrow support.
  2. Prototype Solana WebSocket client with backpressure handling.

## SynFutures v3
- **API**: REST + GraphQL hybrid; permissionless market listings.
- **Auth**: public.
- **Key needs**:
  - Funding calc when synthetic oracle deviates (Pyth vs. Chainlink).
  - Market discovery for long-tail pairs (auto ingestion).
- **Action items**:
  1. Determine cadence for market discovery job (hourly vs. daily).
  2. Validate funding calculation for custom markets.

---

## Deliverables
1. **Connector Checklist**: authenticate, pull static metadata, stream real-time data, handle failover, and emit standardized payload.
2. **Mock Data Sets**: 24h rolling JSON snapshots per venue for frontend prototyping.
3. **Telemetry Hooks**: ensure each connector reports rate limit status, last successful update, and data freshness SLA.

## Timeline (Draft)
- Week 1: Secure API keys/access, finalize schema, build mock feeds.
- Week 2: Implement adapters for Aster and Avantis; start integration tests.
- Week 3: Add SynFutures connector, integrate telemetry, backfill historical funding.
- Week 4: QA + documentation, handoff to UI team for live data integration.

---

## Week 1 Progress

| Venue          | Access Status | Notes                                                                                       | Owner    |
|----------------|---------------|---------------------------------------------------------------------------------------------|----------|
| Aster          | Received      | API key + secret stored as `ASTER_API_KEY` / `ASTER_SECRET_KEY` in backend `.env`; ready for sandbox pulls. | Platform |
| Avantis        | Pending       | GraphQL key request emailed; schema fragments outlined in `mocks/perp_feeds/sample_feeds.json`. | Platform |
| Jupiter Perps  | Public        | No key required; waiting on SDK borrow endpoints.                                          | Research |
| SynFutures v3  | Public        | Public endpoints OK; confirming funding calc for custom markets.                           | Research |

### Mock Feed Checklist
- [x] Create baseline JSON payload (`mocks/perp_feeds/sample_feeds.json`) to validate adapter schema.
- [ ] Replace sample values with live pulls once API keys arrive.
- [ ] Add venue-specific fixtures when connectors emit first real snapshots.

### Immediate Next Actions
1. Submit/track API key requests for Aster and Avantis (owner: Platform).
2. Prototype Solana WebSocket client against Jupiter public feed to ensure backpressure strategy.
3. Validate funding calculation formula for SynFutures synthetic markets using sample payload.

### API Integration Checkpoint
- New backend endpoint: `GET /api/perp-connectors?mode={auto|live|mock}`
  - `auto` (default) attempts live data and falls back to mock snapshots.
  - `mode=mock` forces usage of the sample payload located at `mocks/perp_feeds/sample_feeds.json`.
  - Response includes connector metadata, market listings, and a summary payload for UI consumers.
- Rate limiting guardrails: connector results are cached for `PERP_CONNECTOR_LIVE_TTL_MS` (default 60s) when live data is healthy, and for `PERP_CONNECTOR_MOCK_TTL_MS` (default 10s) when the system falls back to mock data. Adjust these env vars if venue quotas mandate longer or shorter refresh cycles.

### Reference Rate Limits (initial research)
- **Aster**: public documentation does not publish hard caps; support suggests staying below 60 requests/min per API key. Caching window currently set to 60 seconds to comply.
- **Avantis**: SDK primarily hits Base RPC; GraphQL endpoint limits are not documented. Default 60-second cache avoids unnecessary polling until official guidance is received.
- **Jupiter Perps**: aggregator endpoints are open but subject to undisclosed rate limits; community guidance recommends <30 req/min. Cached responses reduce load.
- **SynFutures v3**: REST endpoints are public with soft rate limits (community reports ~120 req/min). Current caching is sufficient; revisit once production traffic patterns are known.
