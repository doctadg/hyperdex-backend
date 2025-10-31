import { TOKEN_CONFIG } from '../config/TOKEN_CONFIG';

//Get token Decimal
export function getTokenInfo(
  network: keyof typeof TOKEN_CONFIG,
  symbol: keyof (typeof TOKEN_CONFIG)[typeof network]
) {
  const token = TOKEN_CONFIG[network][symbol];
  if (!token)
    throw new Error(`Token ${String(symbol)} not configured for ${network}`);
  return token;
}
