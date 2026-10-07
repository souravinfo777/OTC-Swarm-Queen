export interface AssetConfig {
  id: string;
  name: string;
  basePrice: number;
  pipSize: number;
  volatility: number;
  payout: number;
}

/**
 * Quotex OTC asset directory. Kept as display/metadata only — every price and candle
 * in the app originates from the live Quotex extension feed (zero-simulation policy).
 */
export const SUPPORTED_ASSETS: AssetConfig[] = [
  { id: 'USDINR-OTC', name: 'USD/INR (OTC)', basePrice: 83.450, pipSize: 0.001, volatility: 0.015, payout: 0.93 },
  { id: 'USDPHP-OTC', name: 'USD/PHP (OTC)', basePrice: 56.420, pipSize: 0.001, volatility: 0.02, payout: 0.92 },
  { id: 'USDEGP-OTC', name: 'USD/EGP (OTC)', basePrice: 48.650, pipSize: 0.001, volatility: 0.025, payout: 0.91 },
  { id: 'USDIDR-OTC', name: 'USD/IDR (OTC)', basePrice: 16240.0, pipSize: 0.1, volatility: 4.5, payout: 0.90 },
  { id: 'USDNGN-OTC', name: 'USD/NGN (OTC)', basePrice: 1610.5, pipSize: 0.1, volatility: 1.5, payout: 0.87 },
  { id: 'CADCHF-OTC', name: 'CAD/CHF (OTC)', basePrice: 0.58750, pipSize: 0.00001, volatility: 0.0002, payout: 0.88 },
  { id: 'NZDJPY-OTC', name: 'NZD/JPY (OTC)', basePrice: 88.973, pipSize: 0.001, volatility: 0.015, payout: 0.85 },
  { id: 'EURUSD-OTC', name: 'EUR/USD (OTC)', basePrice: 1.08450, pipSize: 0.0001, volatility: 0.00012, payout: 0.85 },
  { id: 'GBPUSD-OTC', name: 'GBP/USD (OTC)', basePrice: 1.29650, pipSize: 0.0001, volatility: 0.00018, payout: 0.84 },
  { id: 'USDPKR-OTC', name: 'USD/PKR (OTC)', basePrice: 278.40, pipSize: 0.01, volatility: 0.05, payout: 0.82 },
  { id: 'USDTRY-OTC', name: 'USD/TRY (OTC)', basePrice: 34.120, pipSize: 0.001, volatility: 0.015, payout: 0.81 },
  { id: 'BTCUSD-OTC', name: 'BTC/USD (OTC)', basePrice: 66450.0, pipSize: 1.0, volatility: 45.0, payout: 0.80 },
  { id: 'ETHUSD-OTC', name: 'ETH/USD (OTC)', basePrice: 3450.0, pipSize: 0.1, volatility: 5.0, payout: 0.79 },
  { id: 'USDBRL-OTC', name: 'USD/BRL (OTC)', basePrice: 0.20233, pipSize: 0.00001, volatility: 0.0002, payout: 0.77 },
  { id: 'USDBDT-OTC', name: 'USD/BDT (OTC)', basePrice: 127.860, pipSize: 0.001, volatility: 0.045, payout: 0.77 },
  { id: 'USDARS-OTC', name: 'USD/ARS (OTC)', basePrice: 965.50, pipSize: 0.01, volatility: 0.25, payout: 0.77 },
  { id: 'USDMXN-OTC', name: 'USD/MXN (OTC)', basePrice: 19.340, pipSize: 0.001, volatility: 0.005, payout: 0.77 },
  { id: 'GBPNZD-OTC', name: 'GBP/NZD (OTC)', basePrice: 2.1340, pipSize: 0.0001, volatility: 0.0005, payout: 0.76 },
  { id: 'EURNZD-OTC', name: 'EUR/NZD (OTC)', basePrice: 1.7750, pipSize: 0.0001, volatility: 0.0003, payout: 0.69 },
  { id: 'AUDNZD-OTC', name: 'AUD/NZD (OTC)', basePrice: 1.0920, pipSize: 0.0001, volatility: 0.0003, payout: 0.66 },
  { id: 'USDZAR-OTC', name: 'USD/ZAR (OTC)', basePrice: 17.850, pipSize: 0.001, volatility: 0.01, payout: 0.64 }
];

export const findAsset = (assetIdOrName: string): AssetConfig =>
  SUPPORTED_ASSETS.find((a) => a.id === assetIdOrName || a.name === assetIdOrName) || SUPPORTED_ASSETS[0];
