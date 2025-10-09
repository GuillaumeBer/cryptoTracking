import asyncio
from avantis_trader_sdk import TraderClient

async def main():
    provider_url = "https://mainnet.base.org"
    client = TraderClient(provider_url)
    print("Fetching Avantis perp pairs via SDK...")
    pairs = await client.pairs_cache.get_pairs_info()
    for symbol, info in list(pairs.items())[:5]:
        print(symbol, info)

if __name__ == "__main__":
    asyncio.run(main())
