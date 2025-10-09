const response = await fetch('http://localhost:3001/api/hyperliquid?address=0x3c74c735b5863C0baF52598d8Fd2D59611c8320F');
const data = await response.json();

console.log('\n=== FIRST POSITION ===\n');
console.log(JSON.stringify(data.data.positions[0], null, 2));

console.log('\n=== CHECKING FOR FEE FIELDS ===\n');
const pos = data.data.positions[0];
console.log('hyperliquidFees:', pos.hyperliquidFees);
console.log('binanceEquivalentFees:', pos.binanceEquivalentFees);
console.log('totalFees:', pos.totalFees);
console.log('tradeCount:', pos.tradeCount);
console.log('netGain:', pos.netGain);
