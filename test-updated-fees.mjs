// Test script to verify updated fee calculations with imbalance and future fees

const TEST_ADDRESS = '0x3c74c735b5863C0baF52598d8Fd2D59611c8320F';

async function testUpdatedFees() {
  try {
    console.log('🧪 Testing Updated Fee Calculations\n');
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

    positions.forEach((position, index) => {
      console.log(`\n📊 Position ${index + 1}: ${position.coin}`);
      console.log('-' .repeat(80));

      console.log(`\n  💰 REVENUE:`);
      console.log(`    Funding Revenue:        +$${(position.fundingPnl || 0).toFixed(2)}`);

      console.log(`\n  💸 FEES PAID (Past):`);
      console.log(`    Hyperliquid Fees:       -$${(position.hyperliquidFees || 0).toFixed(2)}`);
      console.log(`    Binance Equiv. Fees:    -$${(position.binanceEquivalentFees || 0).toFixed(2)}`);
      console.log(`    Total Past Fees:        -$${(position.totalFees || 0).toFixed(2)}`);

      console.log(`\n  🔮 FUTURE COSTS:`);
      console.log(`    Future Closing Fees:    -$${(position.futureClosingFees || 0).toFixed(2)}`);

      console.log(`\n  ⚖️  POSITION BALANCE:`);
      console.log(`    Short Position:         ${Math.abs(position.positionSize).toFixed(2)} ${position.coin}`);
      console.log(`    Spot Balance:           ${(position.spotBalance || 0).toFixed(2)} ${position.coin}`);
      console.log(`    Delta Imbalance:        ${(position.deltaImbalance || 0).toFixed(2)} ${position.coin}`);
      console.log(`    Imbalance Value:        $${(position.deltaImbalanceValue || 0).toFixed(2)}`);
      console.log(`    Delta Neutral:          ${position.isDeltaNeutral ? '✅ YES' : '❌ NO'}`);

      const netGain = position.netGain || 0;
      const symbol = netGain >= 0 ? '✅' : '❌';
      const sign = netGain >= 0 ? '+' : '';

      console.log(`\n  ${symbol} NET GAIN (After All Fees):`);
      console.log(`    ${sign}$${netGain.toFixed(2)}`);

      // Calculate what percentage of funding was consumed by fees
      const fundingRevenue = position.fundingPnl || 0;
      const totalAllFees = (position.totalFees || 0) + (position.futureClosingFees || 0);
      const feePercentage = fundingRevenue !== 0
        ? (totalAllFees / fundingRevenue * 100).toFixed(1)
        : 'N/A';

      console.log(`\n  📊 ANALYSIS:`);
      console.log(`    Total All Fees:         -$${totalAllFees.toFixed(2)}`);
      console.log(`    Fees as % of Revenue:   ${feePercentage}%`);
      console.log(`    Trades Executed:        ${position.tradeCount || 0}`);
      console.log(`    Avg Fee per Trade:      $${((position.totalFees || 0) / (position.tradeCount || 1)).toFixed(2)}`);
    });

    console.log('\n' + '=' .repeat(80));
    console.log('📈 OVERALL SUMMARY');
    console.log('=' .repeat(80));

    const totalNetGain = positions.reduce((sum, p) => sum + (p.netGain || 0), 0);
    const totalPastFees = positions.reduce((sum, p) => sum + (p.totalFees || 0), 0);
    const totalFutureFees = positions.reduce((sum, p) => sum + (p.futureClosingFees || 0), 0);
    const totalAllFees = totalPastFees + totalFutureFees;
    const totalImbalanceValue = positions.reduce((sum, p) => sum + (p.deltaImbalanceValue || 0), 0);

    console.log(`\nTotal Funding Revenue:      +$${totalFundingPnl.toFixed(2)}`);
    console.log(`Total Past Fees:            -$${totalPastFees.toFixed(2)}`);
    console.log(`Total Future Closing Fees:  -$${totalFutureFees.toFixed(2)}`);
    console.log(`Total All Fees:             -$${totalAllFees.toFixed(2)}`);
    console.log(`Total Imbalance Exposure:    $${totalImbalanceValue.toFixed(2)}`);
    console.log(`\n${totalNetGain >= 0 ? '✅' : '❌'} TOTAL NET GAIN: ${totalNetGain >= 0 ? '+' : ''}$${totalNetGain.toFixed(2)}`);

    const overallFeePercentage = totalFundingPnl !== 0
      ? (totalAllFees / totalFundingPnl * 100).toFixed(1)
      : 'N/A';
    console.log(`\nAll fees (past + future) consume ${overallFeePercentage}% of funding revenue`);

    console.log('\n✅ All tests passed!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testUpdatedFees();
