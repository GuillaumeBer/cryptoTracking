// Try meta endpoint
const response = await fetch('https://api.hyperliquid.xyz/info', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'meta' })
});

const data = await response.json();
console.log('Meta response keys:', Object.keys(data));
console.log('Has universe:', !!data.universe);
console.log('Universe length:', data.universe?.length || 0);

if (data.universe) {
  console.log('\nFirst 3 assets with funding:');
  data.universe.slice(0, 3).forEach(asset => {
    console.log(JSON.stringify(asset, null, 2));
  });
}
