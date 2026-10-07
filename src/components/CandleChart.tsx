import React, { useRef, useEffect, useState } from 'react';
import { Candle, SwingPoint, LiquidityZone, OrderBlock, FairValueGap } from '../types/market';
import { Eye, EyeOff, ZoomIn, ZoomOut, RotateCcw, Radio, AlertCircle, Zap, Terminal, ShieldAlert, Download } from 'lucide-react';

interface CandleChartProps {
  candles: Candle[];
  swings?: SwingPoint[];
  liquidityZones?: LiquidityZone[];
  orderBlocks?: OrderBlock[];
  fvgs?: FairValueGap[];
  queenSignals?: Array<{ timestamp: number; direction: string; price: number }>;
  height?: number;
  onOpenExtensionModal?: () => void;
  onOpenLogs?: () => void;
}

export const CandleChart: React.FC<CandleChartProps> = ({
  candles,
  swings = [],
  liquidityZones = [],
  orderBlocks = [],
  fvgs = [],
  queenSignals = [],
  height = 420,
  onOpenExtensionModal,
  onOpenLogs
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Overlay Visibility Toggles
  const [showOB, setShowOB] = useState(true);
  const [showFVG, setShowFVG] = useState(true);
  const [showLiquidity, setShowLiquidity] = useState(true);
  const [showStructure, setShowStructure] = useState(true);
  const [showQueenSignals, setShowQueenSignals] = useState(true);

  // Zoom & Pan
  const [visibleCount, setVisibleCount] = useState(55);
  const [hoverData, setHoverData] = useState<{
    x: number;
    y: number;
    candle: Candle | null;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles || candles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const chartHeight = rect.height;

    // Slice candles to visible viewport
    const displayCandles = candles.slice(-visibleCount);
    if (displayCandles.length === 0) return;

    // Determine price range with 10% padding
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    displayCandles.forEach((c) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    });

    // Also factor active OBs / FVGs if shown
    if (showOB) {
      orderBlocks.forEach((ob) => {
        if (!ob.mitigated) {
          if (ob.low < minPrice && ob.low > minPrice * 0.98) minPrice = ob.low;
          if (ob.high > maxPrice && ob.high < maxPrice * 1.02) maxPrice = ob.high;
        }
      });
    }

    const pricePadding = (maxPrice - minPrice) * 0.08 || 0.0005;
    minPrice -= pricePadding;
    maxPrice += pricePadding;
    const priceRange = maxPrice - minPrice;

    // Coordinate conversion
    const paddingRight = 65;
    const paddingBottom = 24;
    const plotWidth = width - paddingRight;
    const plotHeight = chartHeight - paddingBottom;

    const getY = (price: number) => {
      return plotHeight - ((price - minPrice) / priceRange) * plotHeight;
    };

    const candleWidth = Math.max(3, (plotWidth / displayCandles.length) * 0.7);
    const candleSpacing = plotWidth / displayCandles.length;

    // Clear background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, chartHeight);

    // Draw Price Grid Lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);

    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const price = minPrice + (priceRange / steps) * i;
      const y = getY(price);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotWidth, y);
      ctx.stroke();

      // Price Label
      ctx.fillStyle = '#64748b';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(price.toFixed(5), plotWidth + 6, y + 3);
    }
    ctx.setLineDash([]);

    // 1. Draw Fair Value Gaps (FVG) Shading
    if (showFVG) {
      fvgs.forEach((f) => {
        if (f.mitigated) return;
        const yTop = getY(f.upper);
        const yBottom = getY(f.lower);
        const h = Math.abs(yBottom - yTop);

        ctx.fillStyle = f.type === 'BULLISH' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(251, 146, 60, 0.12)';
        ctx.strokeStyle = f.type === 'BULLISH' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(251, 146, 60, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);

        ctx.fillRect(0, Math.min(yTop, yBottom), plotWidth, h);
        ctx.strokeRect(0, Math.min(yTop, yBottom), plotWidth, h);

        ctx.setLineDash([]);
        ctx.fillStyle = f.type === 'BULLISH' ? '#38bdf8' : '#fb923c';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(`${f.type === 'BULLISH' ? '+FVG' : '-FVG'}`, 8, Math.min(yTop, yBottom) + 12);
      });
    }

    // 2. Draw Order Blocks (OB)
    if (showOB) {
      orderBlocks.forEach((ob) => {
        if (ob.mitigated) return;
        const yTop = getY(ob.high);
        const yBottom = getY(ob.low);
        const h = Math.max(3, Math.abs(yBottom - yTop));

        ctx.fillStyle = ob.type === 'BULLISH' ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)';
        ctx.strokeStyle = ob.type === 'BULLISH' ? '#10b981' : '#ef4444';
        ctx.lineWidth = 1;

        ctx.fillRect(0, Math.min(yTop, yBottom), plotWidth, h);
        ctx.strokeRect(0, Math.min(yTop, yBottom), plotWidth, h);

        ctx.fillStyle = ob.type === 'BULLISH' ? '#10b981' : '#ef4444';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(`${ob.type === 'BULLISH' ? 'BULL OB' : 'BEAR OB'} (${ob.displacementScore}x)`, 65, Math.min(yTop, yBottom) + 10);
      });
    }

    // 3. Draw Liquidity Zones (EQH / EQL / BSL / SSL)
    if (showLiquidity) {
      liquidityZones.forEach((z) => {
        const y = getY(z.price);
        if (y < 0 || y > plotHeight) return;

        ctx.strokeStyle = z.swept ? '#64748b' : z.type.includes('HIGH') || z.type === 'BUY_SIDE' ? '#38bdf8' : '#eab308';
        ctx.lineWidth = z.swept ? 1 : 1.5;
        ctx.setLineDash(z.swept ? [2, 2] : [4, 4]);

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(plotWidth, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle = z.swept ? '#64748b' : z.type.includes('HIGH') || z.type === 'BUY_SIDE' ? '#38bdf8' : '#eab308';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText(`${z.type}${z.swept ? ' (SWEPT)' : ' [POOL]'}`, plotWidth - 110, y - 3);
      });
    }

    // 4. Draw Candlesticks
    displayCandles.forEach((c, idx) => {
      const x = idx * candleSpacing + candleSpacing / 2;
      const isUp = c.close >= c.open;
      const bodyTop = getY(Math.max(c.open, c.close));
      const bodyBottom = getY(Math.min(c.open, c.close));
      const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);

      const wickHigh = getY(c.high);
      const wickLow = getY(c.low);

      // Wick
      ctx.strokeStyle = isUp ? '#10b981' : '#ef4444';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, wickHigh);
      ctx.lineTo(x, wickLow);
      ctx.stroke();

      // Body
      ctx.fillStyle = isUp ? '#10b981' : '#ef4444';
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    });

    // 5. Draw Market Structure Swings & BOS/CHoCH
    if (showStructure && swings.length > 0) {
      const firstVisibleTs = displayCandles[0].timestamp;
      const visibleSwings = swings.filter((s) => s.timestamp >= firstVisibleTs);

      visibleSwings.forEach((s) => {
        // Find candle index
        const cIdx = displayCandles.findIndex((c) => Math.abs(c.timestamp - s.timestamp) < 60000);
        if (cIdx === -1) return;

        const x = cIdx * candleSpacing + candleSpacing / 2;
        const y = getY(s.price);

        ctx.fillStyle = s.type === 'HIGH' ? '#f43f5e' : '#10b981';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();

        if (s.classification) {
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(s.classification, x, s.type === 'HIGH' ? y - 6 : y + 12);
        }
      });
    }

    // 6. Draw Queen Signals on Chart
    if (showQueenSignals && queenSignals.length > 0) {
      const firstTs = displayCandles[0].timestamp;
      queenSignals.forEach((sig) => {
        if (sig.timestamp < firstTs) return;
        const cIdx = displayCandles.findIndex((c) => Math.abs(c.timestamp - sig.timestamp) < 60000);
        if (cIdx === -1) return;

        const x = cIdx * candleSpacing + candleSpacing / 2;
        const y = getY(sig.price);

        const isUp = sig.direction === 'UP';
        ctx.fillStyle = isUp ? '#10b981' : '#ef4444';
        ctx.beginPath();
        if (isUp) {
          // Up triangle
          ctx.moveTo(x, y - 8);
          ctx.lineTo(x - 6, y + 2);
          ctx.lineTo(x + 6, y + 2);
        } else {
          // Down triangle
          ctx.moveTo(x, y + 8);
          ctx.lineTo(x - 6, y - 2);
          ctx.lineTo(x + 6, y - 2);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`QUEEN ${sig.direction}`, x, isUp ? y - 11 : y + 18);
      });
    }

    // 7. Draw Crosshair Hover if active
    if (hoverData && hoverData.candle) {
      ctx.strokeStyle = '#475569';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(hoverData.x, 0);
      ctx.lineTo(hoverData.x, plotHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, hoverData.y);
      ctx.lineTo(plotWidth, hoverData.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [candles, visibleCount, showOB, showFVG, showLiquidity, showStructure, showQueenSignals, hoverData, swings, liquidityZones, orderBlocks, fvgs, queenSignals]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const plotWidth = rect.width - 65;
    const displayCandles = candles.slice(-visibleCount);
    const candleSpacing = plotWidth / displayCandles.length;
    const idx = Math.floor(x / candleSpacing);

    if (idx >= 0 && idx < displayCandles.length) {
      setHoverData({
        x,
        y,
        candle: displayCandles[idx]
      });
    } else {
      setHoverData(null);
    }
  };

  const handleMouseLeave = () => setHoverData(null);

  return (
    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl overflow-hidden flex flex-col">
      {/* Chart Top Toolbar */}
      <div className="bg-zinc-900/90 px-3 py-1.5 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 font-medium">OVERLAYS:</span>
          {/* Toggle Order Blocks */}
          <button
            onClick={() => setShowOB(!showOB)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
              showOB ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {showOB ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>Order Blocks</span>
          </button>

          {/* Toggle FVG */}
          <button
            onClick={() => setShowFVG(!showFVG)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
              showFVG ? 'bg-sky-950 text-sky-400 border border-sky-800' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {showFVG ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>FVG</span>
          </button>

          {/* Toggle Liquidity */}
          <button
            onClick={() => setShowLiquidity(!showLiquidity)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
              showLiquidity ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {showLiquidity ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>Liquidity Pools</span>
          </button>

          {/* Toggle Structure */}
          <button
            onClick={() => setShowStructure(!showStructure)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
              showStructure ? 'bg-purple-950 text-purple-400 border border-purple-800' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {showStructure ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>Structure / Swings</span>
          </button>

          {/* Toggle Queen Flags */}
          <button
            onClick={() => setShowQueenSignals(!showQueenSignals)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
              showQueenSignals ? 'bg-indigo-950 text-indigo-300 border border-indigo-800' : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {showQueenSignals ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>Queen Signals</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setVisibleCount((prev) => Math.min(120, prev + 15))}
            className="p-1 text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setVisibleCount((prev) => Math.max(25, prev - 15))}
            className="p-1 text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setVisibleCount(55)}
            className="p-1 text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded"
            title="Reset Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Candle Hover HUD bar */}
      {hoverData?.candle && (
        <div className="bg-zinc-900/60 px-4 py-1 text-[11px] font-mono text-zinc-400 flex items-center gap-4 border-b border-zinc-800/50">
          <span>O: <strong className="text-zinc-200">{hoverData.candle.open.toFixed(5)}</strong></span>
          <span>H: <strong className="text-emerald-400">{hoverData.candle.high.toFixed(5)}</strong></span>
          <span>L: <strong className="text-rose-400">{hoverData.candle.low.toFixed(5)}</strong></span>
          <span>C: <strong className="text-zinc-200">{hoverData.candle.close.toFixed(5)}</strong></span>
          <span>Vol: <strong className="text-zinc-300">{hoverData.candle.volume}</strong></span>
          <span>Time: <strong className="text-zinc-400">{new Date(hoverData.candle.timestamp).toLocaleTimeString()}</strong></span>
        </div>
      )}

      {/* Canvas Area or Zero-Simulation Waiting State */}
      <div className="relative w-full" style={{ height: `${height}px` }}>
        {candles.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 text-center p-6 space-y-4 select-none border-t border-zinc-900">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 shadow-inner">
                <Radio className="w-8 h-8 text-sky-400 animate-pulse" />
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 border-2 border-zinc-950"></span>
              </span>
            </div>

            <div className="space-y-1.5 max-w-lg">
              <div className="text-sm font-bold tracking-wider text-zinc-100 flex items-center justify-center gap-2">
                <span>AWAITING REAL-TIME QUOTEX STREAM</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800 font-mono font-bold">
                  ZERO SIMULATION
                </span>
              </div>
              <p className="text-xs text-rose-300/90 leading-relaxed font-mono">
                রিয়েল-টাইম এক্সটেনশন কানেক্ট না হওয়া পর্যন্ত কোনো সিমুলেটেড বা কৃত্রিম ক্যান্ডেল চার্টে প্রদর্শিত হবে না।
              </p>
              <p className="text-[11px] text-zinc-500 max-w-md mx-auto">
                Chart is blank per zero-simulation policy. Open Quotex in a Chrome tab with the OTC Swarm Queen extension enabled to stream true live market quotes.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-mono pt-1">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>1. Extension Ready</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>2. Open Quotex Tab</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-500">
                <span className="w-2 h-2 rounded-full bg-zinc-600" />
                <span>3. Live Candlesticks</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <a
                href="/api/extension/download"
                download="otc-swarm-queen-extension.zip"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md shadow-emerald-950/60 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>DOWNLOAD EXTENSION (.ZIP)</span>
              </a>

              {onOpenExtensionModal && (
                <button
                  onClick={onOpenExtensionModal}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 text-xs font-bold transition-colors cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-sky-400" />
                  <span>How to Install</span>
                </button>
              )}

              {onOpenLogs && (
                <button
                  onClick={onOpenLogs}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                  <span>View Error Logs</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="w-full h-full block cursor-crosshair"
          />
        )}
      </div>
    </div>
  );
};
