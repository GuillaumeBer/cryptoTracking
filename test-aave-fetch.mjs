const GRAPH_API_KEY = 'dec44da04027010f04ba25886c2d62ab';
const walletAddress = '0x3c74c735b5863C0baF52598d8Fd2D59611c8320F';
const subgraphUrl = `https://gateway-arbitrum.network.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/DLuE98kEb5pQNXAcKFQGQgfSQ57Xdou4jnVbAEqMfy3B`;

const query = `
  query GetUserReserves($userAddress: String!) {
    userReserves(where: { user: $userAddress }) {
      currentVariableDebt
      currentStableDebt
      currentTotalDebt
      reserve {
        symbol
        name
        decimals
      }
    }
  }
`;

async function test() {
  console.log('Testing AAVE fetch...');
  console.log('Wallet:', walletAddress);
  console.log('Wallet (lowercase):', walletAddress.toLowerCase());

  const response = await fetch(subgraphUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        userAddress: walletAddress.toLowerCase(),
      },
    }),
  });

  const data = await response.json();
  console.log('\nResponse:', JSON.stringify(data, null, 2));

  if (data.data?.userReserves) {
    console.log('\n✅ Found', data.data.userReserves.length, 'reserves');
    data.data.userReserves.forEach(r => {
      console.log(`  - ${r.reserve.symbol}: debt=${r.currentTotalDebt}`);
    });
  } else {
    console.log('\n❌ No userReserves in response');
  }
}

test().catch(console.error);
