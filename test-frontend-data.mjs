const response = await fetch('http://localhost:3001/api/hyperliquid?address=0x3c74c735b5863C0baF52598d8Fd2D59611c8320F');
const data = await response.json();

if (data.data?.positions?.[0]?.fundingRate) {
  const fr = data.data.positions[0].fundingRate;
  console.log('Funding Rate Data:');
  console.log('  Current Rate APR:', fr.currentRateApr);
  console.log('  Avg 7d APR:', fr.avgRate7dApr);
  console.log('  History length:', fr.history.length);
  console.log('  First history item:', fr.history[0]);
  console.log('  Last history item:', fr.history[fr.history.length - 1]);
  console.log('\nAll history rateApr values:');
  fr.history.forEach((h, i) => {
    console.log(`  [${i}] ${new Date(h.time).toLocaleDateString()}: ${h.rateApr}% APR`);
  });
} else {
  console.log('ERROR: No funding rate data in response');
}
