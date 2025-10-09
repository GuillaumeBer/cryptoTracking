// Full AAVE test mimicking backend logic

const GRAPH_API_KEY = 'dec44da04027010f04ba25886c2d62ab';
const walletAddress = '0x3c74c735b5863C0baF52598d8Fd2D59611c8320F';
const subgraphUrl = `https://gateway-arbitrum.network.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/DLuE98kEb5pQNXAcKFQGQgfSQ57Xdou4jnVbAEqMfy3B`;

const query = `
  query GetUserReserves($userAddress: String!) {
    userReserves(where: { user: $userAddress }) {
      currentVariableDebt
      currentStableDebt
      currentTotalDebt
      principalStableDebt
      scaledVariableDebt
      stableBorrowRate
      liquidityRate
      usageAsCollateralEnabledOnUser
      currentATokenBalance
      reserve {
        symbol
        name
        decimals
        reserveLiquidationThreshold
        baseLTVasCollateral
        variableBorrowRate
      }
    }
  }
`;

async function fetchAaveData() {
  const response = await fetch(subgraphUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: { userAddress: walletAddress.toLowerCase() },
    }),
  });

  const data = await response.json();

  if (data.data.userReserves) {
    return {
      id: walletAddress,
      reserves: data.data.userReserves
    };
  }
  return null;
}

async function processPositions(userData) {
  if (!userData?.reserves) {
    console.log('❌ No userData or reserves');
    return [];
  }

  console.log(`✅ Processing ${userData.reserves.length} reserves`);

  const borrowedReserves = userData.reserves.filter(r => parseFloat(r.currentTotalDebt) > 0);
  console.log(`✅ Found ${borrowedReserves.length} borrowed reserves`);

  borrowedReserves.forEach(r => {
    console.log(`   - ${r.reserve.symbol}: debt=${r.currentTotalDebt}`);
  });

  return borrowedReserves.map(reserve => ({
    asset: reserve.reserve.symbol,
    borrowAmount: reserve.currentTotalDebt,
    borrowAmountFormatted: parseFloat(reserve.currentTotalDebt) / Math.pow(10, reserve.reserve.decimals),
  }));
}

async function test() {
  console.log('🔍 Fetching AAVE data...\n');

  const userData = await fetchAaveData();
  console.log('Fetched user data:', userData ? `${userData.reserves.length} reserves` : 'null\n');

  const positions = await processPositions(userData);
  console.log(`\n📊 Result: ${positions.length} positions`);
  console.log(JSON.stringify(positions, null, 2));
}

test().catch(console.error);
