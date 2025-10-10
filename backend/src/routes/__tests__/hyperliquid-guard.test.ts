import {
  calculateGuardedLiquidationPrice,
  getApplicableMarginTableLeverage,
  setLatestMarginTables,
  type HyperliquidMarginTable,
} from '../hyperliquid';

describe('hyperliquid guard helpers', () => {
  beforeEach(() => {
    setLatestMarginTables(null);
  });

  it('returns undefined leverage when no margin tables are cached', () => {
    const leverage = getApplicableMarginTableLeverage(123, 1_000_000);
    expect(leverage).toBeUndefined();
  });

  it('selects the correct tier for a notional size', () => {
    const marginTable: HyperliquidMarginTable = {
      description: 'tiered 10x',
      marginTiers: [
        { lowerBound: 0, maxLeverage: 10 },
        { lowerBound: 3_000_000, maxLeverage: 5 },
      ],
    };

    const tableMap = new Map<number, HyperliquidMarginTable>();
    tableMap.set(51, marginTable);
    setLatestMarginTables(tableMap);

    expect(getApplicableMarginTableLeverage(51, 2_000_000)).toBe(10);
    expect(getApplicableMarginTableLeverage(51, 4_000_000)).toBe(5);
  });

  it('computes guarded liquidation price when collateral covers a 100% move', () => {
    const entryPrice = 100;
    const positionSize = 10; // $1,000 notional
    const collateral = 1_000; // Matches notional for 1× guard

    const liquidationPrice = calculateGuardedLiquidationPrice(entryPrice, positionSize, collateral);
    expect(liquidationPrice).toBeCloseTo(200, 6);
  });
});
