// Test to debug fee calculation in backend
const TEST_ADDRESS = '0x3c74c735b5863C0baF52598d8Fd2D59611c8320F';

async function testFeeCalculation() {
  try {
    // Fetch fills
    const fillsResponse = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'userFills',
        user: TEST_ADDRESS,
      }),
    });

    const fills = await fillsResponse.json();

    const hyperliquidFeesByCoin = {};
    const binanceFeesByCoin = {};
    const tradeCountByCoin = {};
    const BINANCE_SPOT_FEE_RATE = 0.001;

    fills.forEach((fill) => {
      const coin = fill.coin;
      const hyperliquidFee = parseFloat(fill.fee || '0');
      const builderFee = parseFloat(fill.builderFee || '0');
      const totalHyperliquidFee = hyperliquidFee + builderFee;

      const tradeValue = parseFloat(fill.px) * parseFloat(fill.sz);
      const binanceFee = tradeValue * BINANCE_SPOT_FEE_RATE;

      if (!hyperliquidFeesByCoin[coin]) {
        hyperliquidFeesByCoin[coin] = 0;
        binanceFeesByCoin[coin] = 0;
        tradeCountByCoin[coin] = 0;
      }

      hyperliquidFeesByCoin[coin] += totalHyperliquidFee;
      binanceFeesByCoin[coin] += binanceFee;
      tradeCountByCoin[coin]++;
    });

    console.log('=== FEE CALCULATION RESULTS ===\n');
    console.log('hyperliquidFeesByCoin:', JSON.stringify(hyperliquidFeesByCoin, null, 2));
    console.log('\nbinanceFeesByCoin:', JSON.stringify(binanceFeesByCoin, null, 2));
    console.log('\ntradeCountByCoin:', JSON.stringify(tradeCountByCoin, null, 2));

    // Now test how these would be assigned to positions
    console.log('\n\n=== ASSIGNMENT TO POSITIONS ===\n');
    const coins = ['WIF', 'ENA', 'ASTER'];
    coins.forEach(coin => {
      console.log(`\n${coin}:`);
      console.log(`  hyperliquidFees: ${hyperliquidFeesByCoin[coin] || 0}`);
      console.log(`  binanceEquivalentFees: ${binanceFeesByCoin[coin] || 0}`);
      console.log(`  totalFees: ${(hyperliquidFeesByCoin[coin] || 0) + (binanceFeesByCoin[coin] || 0)}`);
      console.log(`  tradeCount: ${tradeCountByCoin[coin] || 0}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

testFeeCalculation();
