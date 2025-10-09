const response = await fetch('http://localhost:3001/api/hyperliquid?address=0x3c74c735b5863C0baF52598d8Fd2D59611c8320F');
const data = await response.json();

console.log('Success:', data.success);
console.log('Positions:', data.data?.positions?.length || 0);

if (data.data?.positions?.[0]) {
  const pos = data.data.positions[0];
  console.log('\nFirst position:', pos.coin);
  console.log('Has fundingRate:', !!pos.fundingRate);

  if (pos.fundingRate) {
    console.log('Current rate APR:', pos.fundingRate.currentRateApr);
    console.log('7d avg APR:', pos.fundingRate.avgRate7dApr);
    console.log('History length:', pos.fundingRate.history?.length || 0);
    console.log('Estimated daily revenue:', pos.fundingRate.estimatedDailyRevenue);
  } else {
    console.log('ERROR: No funding rate data!');
  }
}
