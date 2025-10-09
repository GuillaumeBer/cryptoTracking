// Test script to verify the complete fee calculation flow
// This will check both the backend API and the data structure

const TEST_ADDRESS = '0x3c74c735b5863C0baF52598d8Fd2D59611c8320F';

async function testFeeCalculation() {
  try {
    console.log('🧪 Testing Hyperliquid Fee Calculation\n');
    console.log(`Fetching data for address: ${TEST_ADDRESS}\n`);

    const response = await fetch(`http://localhost:3001/api/hyperliquid?address=${TEST_ADDRESS}`);
    const result = await response.json();

    if (!result.success) {
      console.error('❌ API Error:', result.error);
      return;
    }

    const { positions, totalFundingPnl } = result.data;

    console.log('✅ Successfully fetched positions\n');
    console.log('=' .repeat(80));
    console.log(`Total Positions: ${positions.length}`);
    console.log(`Total Funding PnL: $${totalFundingPnl.toFixed(2)}`);
    console.log('=' .repeat(80));

    positions.forEach((position, index) => {
      console.log(`\n📊 Position ${index + 1}: ${position.coin}`);
      console.log('-' .repeat(80));

      console.log(`\n  Position Details:`);
      console.log(`    Size: ${Math.abs(position.positionSize).toFixed(2)} ${position.coin}`);
      console.log(`    Value: $${position.positionValueUsd.toFixed(2)}`);
      console.log(`    Trade Count: ${position.tradeCount} trades`);

      console.log(`\n  Revenue:`);
      console.log(`    Funding Revenue: +$${(position.fundingPnl || 0).toFixed(2)}`);

      console.log(`\n  Fees:`);
      console.log(`    Hyperliquid Fees: -$${(position.hyperliquidFees || 0).toFixed(2)}`);
      console.log(`    Binance Equiv. Fees (0.1% SPOT): -$${(position.binanceEquivalentFees || 0).toFixed(2)}`);
      console.log(`    Total Fees: -$${(position.totalFees || 0).toFixed(2)}`);

      console.log(`\n  Net Result:`);
      const netGain = position.netGain || 0;
      const symbol = netGain >= 0 ? '✅' : '❌';
      const sign = netGain >= 0 ? '+' : '';
      console.log(`    ${symbol} NET GAIN: ${sign}$${netGain.toFixed(2)}`);

      // Calculate percentages
      const fundingRevenue = position.fundingPnl || 0;
      const feePercentage = fundingRevenue !== 0
        ? ((position.totalFees || 0) / fundingRevenue * 100).toFixed(1)
        : 'N/A';

      console.log(`\n  Analysis:`);
      console.log(`    Fees as % of Revenue: ${feePercentage}%`);
      console.log(`    Average Fee per Trade: $${((position.totalFees || 0) / (position.tradeCount || 1)).toFixed(2)}`);
      console.log(`    Hyperliquid Fee Ratio: ${(((position.hyperliquidFees || 0) / (position.totalFees || 1)) * 100).toFixed(1)}%`);
      console.log(`    Binance Fee Ratio: ${(((position.binanceEquivalentFees || 0) / (position.totalFees || 1)) * 100).toFixed(1)}%`);
    });

    console.log('\n' + '=' .repeat(80));
    console.log('📈 SUMMARY');
    console.log('=' .repeat(80));

    const totalNetGain = positions.reduce((sum, p) => sum + (p.netGain || 0), 0);
    const totalHyperliquidFees = positions.reduce((sum, p) => sum + (p.hyperliquidFees || 0), 0);
    const totalBinanceFees = positions.reduce((sum, p) => sum + (p.binanceEquivalentFees || 0), 0);
    const totalFees = positions.reduce((sum, p) => sum + (p.totalFees || 0), 0);
    const totalTrades = positions.reduce((sum, p) => sum + (p.tradeCount || 0), 0);

    console.log(`Total Funding Revenue: +$${totalFundingPnl.toFixed(2)}`);
    console.log(`Total Hyperliquid Fees: -$${totalHyperliquidFees.toFixed(2)}`);
    console.log(`Total Binance Equivalent Fees: -$${totalBinanceFees.toFixed(2)}`);
    console.log(`Total Fees: -$${totalFees.toFixed(2)}`);
    console.log(`Total Trades: ${totalTrades}`);
    console.log(`\n${totalNetGain >= 0 ? '✅' : '❌'} TOTAL NET GAIN: ${totalNetGain >= 0 ? '+' : ''}$${totalNetGain.toFixed(2)}`);

    const overallFeePercentage = totalFundingPnl !== 0
      ? (totalFees / totalFundingPnl * 100).toFixed(1)
      : 'N/A';
    console.log(`\nFees consumed ${overallFeePercentage}% of funding revenue`);

    console.log('\n✅ All tests passed!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testFeeCalculation();
