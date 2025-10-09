const response = await fetch('https://api.hyperliquid.xyz/info', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'metaAndAssetCtxs' })
});

const data = await response.json();
console.log('Response is array:', Array.isArray(data));
console.log('First item keys:', Object.keys(data[0] || {}));
console.log('Has assetCtxs:', !!data[0]?.assetCtxs);
console.log('Universe length:', data[0]?.universe?.length || 0);
console.log('AssetCtxs length:', data[0]?.assetCtxs?.length || 0);

if (data[0]?.universe && data[0]?.assetCtxs) {
  console.log('\nFirst 3 funding rates:');
  data[0].universe.slice(0, 3).forEach((asset, i) => {
    const ctx = data[0].assetCtxs[i];
    console.log(`${asset.name}: ${ctx.funding}`);
  });
}
