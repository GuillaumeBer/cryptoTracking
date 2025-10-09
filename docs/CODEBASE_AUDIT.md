# Full Codebase Audit & Improvement Opportunities

## Scope & Methodology
- Reviewed backend Express services, price orchestration layer, and protocol-specific routes under `backend/src`.
- Analyzed Next.js front-end entry points, Hyperliquid dashboard implementation, and shared API utilities under `frontend/app` and `frontend/lib`.
- Surveyed developer tooling (tests, scripts, and docs) at the repository root and within package manifests.

## Backend Observations & Recommendations

### 1. Harden request validation and error handling
- Several route handlers trust query or body parameters without schema validation and only surface a generic 500 on failure (e.g., `/api/prices` endpoints). Introduce a validation layer (Zod/Yup/celebrate) and consistent error responses with error codes to aid clients.【F:backend/src/routes/prices.ts†L7-L55】
- Wrap shared dependencies (Binance, CoinGecko, protocol GraphQL endpoints) with retry + circuit breaking to prevent the server from crashing on upstream instability, and log structured context to improve observability.【F:backend/src/index.ts†L17-L50】【F:backend/src/routes/morpho.ts†L91-L192】

### 2. Factor out duplicated portfolio math & service calls
- Morpho, Aave, Jupiter, and Hyperliquid routes repeat health-factor and USD conversion logic. Extract shared calculators (collateral ratios, APR normalization) into `backend/src/services/portfolio-math.ts` and reuse to keep risk logic consistent.【F:backend/src/routes/morpho.ts†L130-L169】
- Provide a typed response model per protocol under `backend/src/types` to avoid ad-hoc inline interfaces and keep the API contract centralized.【F:backend/src/routes/morpho.ts†L12-L48】

### 3. Make price orchestration configurable & cache-aware
- `priceService` currently hardcodes Binance/CoinGecko symbol maps and fallback prices in code. Externalize to config (JSON/YAML) or environment-driven tables, and add TTL-based caching to prevent redundant API hits in hot paths like the Hyperliquid funding calculators.【F:backend/src/services/price-api/index.ts†L18-L119】
- Add metrics (hit rate, fallback usage) so regression in liquidity sources is visible during deployments.【F:backend/src/services/price-api/index.ts†L90-L118】

### 4. Strengthen connector abstraction boundaries
- The perp connector router manually maps query params to context instead of delegating to connector definitions. Promote a `PerpConnectorManager` that validates requested mode, enforces connector capabilities, and surfaces partial failures with connector-level status fields.【F:backend/src/routes/perp-connectors.ts†L7-L40】
- Document connector capabilities (supported auth, fetch intervals, rate limits) alongside mocks to accelerate live onboarding.

## Frontend Observations & Recommendations

### 1. Modularize oversized pages
- `HyperliquidPage` combines data fetching, filter state, table rendering, and analytics into a 1200+ line component, which makes memoization and testing difficult. Split into hooks (`useHyperliquidPositions`, `usePerpOpportunities`), reusable UI atoms (filters, summary cards), and suspense-friendly data containers.【F:frontend/app/hyperliquid/page.tsx†L1-L200】
- Extract shared layout primitives (card shells, gradient headers) from `frontend/app/page.tsx` to a `@/components` directory to reuse across dashboards and reduce duplication.【F:frontend/app/page.tsx†L7-L67】

### 2. Standardize API data typing & loading states
- Frontend relies on local interfaces that drift from backend response shapes (e.g., Hyperliquid opportunities vs. backend connectors). Create OpenAPI/TypeScript SDK generation or share `@/types/api` generated from backend TypeScript definitions to keep parity.【F:frontend/app/hyperliquid/page.tsx†L7-L149】【F:frontend/lib/api-config.ts†L6-L35】
- Introduce skeleton loaders and error boundaries around API calls so partial failures do not blank the entire dashboard.

### 3. Improve configuration ergonomics
- `API_BASE_URL` is read directly from `process.env` at runtime. Use Next.js runtime config or `env.mjs` schema validation to surface misconfiguration during build-time and prevent leaking server URLs into the client bundle accidentally.【F:frontend/lib/api-config.ts†L6-L35】

## Testing, Tooling & DX

### 1. Unify scattered `.mjs` scripts into automated suites
- Numerous root-level test scripts (`test-*.mjs`) are manual harnesses and bypass CI. Convert them into Jest or Vitest suites colocated with services, and wire them into `npm test` so regressions run automatically.【F:test-api.mjs†L1-L200】
- Add contract tests for price fallbacks and connector mocks to guard integration points.

### 2. Expand backend test harness
- Jest config exists but no unit/integration tests are present. Start with service-level tests (price service caching, Morpho GraphQL parsing) and snapshot API responses using Supertest.【F:backend/jest.config.js†L1-L6】

### 3. Establish linting & formatting gates
- Ensure `frontend` and `backend` share a lint config (ESLint + Prettier), add `pnpm lint`/`npm run lint` scripts, and set up Git hooks (Husky + lint-staged) to enforce style consistency.

## Documentation & Operations
- Update `ARCHITECTURE.md` with the current connector pipeline and Hyperliquid UI data flow, including sequence diagrams for price aggregation.
- Provide an onboarding checklist (env vars, API keys, local mock toggles) in `README.md` to reduce setup friction.
- Introduce runbooks for rate-limit errors and connector outages so on-call engineers have step-by-step mitigations.

## Prioritized Next Steps
1. **Backend resilience**: ship validation, retry, and caching layers for price/protocol routes.
2. **Frontend modularity**: refactor Hyperliquid dashboard into composable hooks/components with shared types.
3. **Testing discipline**: migrate `.mjs` harnesses into Jest, add CI smoke tests, and enable lint formatting checks.
4. **Documentation**: align architecture docs with connector roadmap and publish operational playbooks.

These steps will stabilize current features while preparing the codebase for new perp venues, additional dashboards, and automated analytics.
