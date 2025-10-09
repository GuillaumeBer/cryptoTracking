// Try perpMeta or fundingInfo endpoint
const response = await fetch('https://api.hyperliquid.xyz/info', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'metaAndAssetCtxs' })
});

const data = await response.json();
console.log('Full response structure:');
console.log(JSON.stringify(data[0], null, 2).substring(0, 1000));
