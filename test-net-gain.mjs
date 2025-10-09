const response = await fetch('http://localhost:3001/api/hyperliquid?address=0x3c74c735b5863C0baF52598d8Fd2D59611c8320F');
const data = await response.json();

console.log('\n=== NET GAIN ANALYSIS ===\n');

const positions = data.data.positions;

positions.forEach(pos => {
  console.log(`\n${pos.coin}:`);
  console.log(`  Funding PnL: $${pos.fundingPnl?.toFixed(2) || 0}`);
  console.log(`  Hyperliquid Fees: -$${pos.hyperliquidFees?.toFixed(2) || 0}`);
  console.log(`  Binance Fees: -$${pos.binanceEquivalentFees?.toFixed(2) || 0}`);
  console.log(`  Future Closing Fees: -$${pos.futureClosingFees?.toFixed(2) || 0}`);
  console.log(`  Net Gain: ${pos.netGain >= 0 ? '+' : ''}$${pos.netGain?.toFixed(2) || 0}`);
  console.log(`  Status: ${pos.netGain >= 0 ? '✅ GAIN' : '❌ LOSS'}`);
});

const totalNetGain = positions.reduce((sum, pos) => sum + (pos.netGain || 0), 0);
console.log(`\n\n📊 TOTAL NET ${totalNetGain >= 0 ? 'GAIN' : 'LOSS'}: ${totalNetGain >= 0 ? '+' : ''}$${totalNetGain.toFixed(2)}`);
