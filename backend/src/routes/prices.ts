import { Router } from 'express';
import { priceService } from '../services/price-api';
import { asyncHandler } from '../utils/async-handler';
import {
  parseContractAddress,
  parseContractAddressList,
  parsePlatform,
  parseSymbol,
  parseSymbolList,
} from '../utils/request-validators';

const router = Router();

// Get a single token price by symbol
router.get(
  '/token/:symbol',
  asyncHandler(async (req, res) => {
    const symbol = parseSymbol(req.params.symbol);
    const result = await priceService.getTokenPrice(symbol);
    res.json(result);
  })
);

// Get multiple token prices by symbols
router.post(
  '/tokens',
  asyncHandler(async (req, res) => {
    const symbols = parseSymbolList(req.body?.symbols);
    const prices = await priceService.getTokenPrices(symbols);
    res.json(prices);
  })
);

// Get a single token price by contract address
router.get(
  '/contract/:platform/:address',
  asyncHandler(async (req, res) => {
    const platform = parsePlatform(req.params.platform);
    const address = parseContractAddress(req.params.address);
    const result = await priceService.getTokenPriceByContract(platform, address);
    res.json(result);
  })
);

// Get multiple token prices by contract addresses
router.post(
  '/contracts/:platform',
  asyncHandler(async (req, res) => {
    const platform = parsePlatform(req.params.platform);
    const addresses = parseContractAddressList(req.body?.addresses);
    const prices = await priceService.getTokenPricesByContract(platform, addresses);
    res.json(prices);
  })
);

export default router;
