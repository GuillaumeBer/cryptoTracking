// Test script to fetch userFills from Hyperliquid API
// This will show us the exact structure of trade history and fees

const TEST_ADDRESS = '0x3c74c735b5863C0baF52598d8Fd2D59611c8320F';

async function testUserFills() {
  try {
    console.log('Fetching userFills from Hyperliquid...\n');

    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'userFills',
        user: TEST_ADDRESS,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const fills = await response.json();

    console.log(`Total fills: ${fills.length}`);
    console.log('\nFirst 3 fills (if available):\n');

    fills.slice(0, 3).forEach((fill, index) => {
      console.log(`\n--- Fill ${index + 1} ---`);
      console.log(JSON.stringify(fill, null, 2));
    });

    // Analyze fee structure
    console.log('\n\n=== FEE ANALYSIS ===\n');

    const totalFees = fills.reduce((sum, fill) => {
      const fee = parseFloat(fill.fee || '0');
      return sum + fee;
    }, 0);

    console.log(`Total fees paid across ${fills.length} trades: $${totalFees.toFixed(2)}`);

    // Group by coin
    const feesByCoin = {};
    const tradeCountByCoin = {};

    fills.forEach(fill => {
      const coin = fill.coin;
      const fee = parseFloat(fill.fee || '0');

      if (!feesByCoin[coin]) {
        feesByCoin[coin] = 0;
        tradeCountByCoin[coin] = 0;
      }

      feesByCoin[coin] += fee;
      tradeCountByCoin[coin]++;
    });

    console.log('\nFees by coin:');
    Object.entries(feesByCoin).forEach(([coin, totalFee]) => {
      console.log(`  ${coin}: $${totalFee.toFixed(2)} (${tradeCountByCoin[coin]} trades)`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testUserFills();
