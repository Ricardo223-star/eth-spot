'use strict';

const APP_VERSION = "v1.3";
const APP_DATE = "22/04/2026 10:00";

const CONFIG = {
  symbol: 'ETHUSDT',
  btcSymbol: 'BTCUSDT',
  refreshMs: 60_000,
  timeoutMs: 8_000,
  binanceBases: [
    'https://api.binance.com',
    'https://data-api.binance.vision'
  ]
};

const state = {
  chartCandles: [],
  chartEma21: [],
  chartEma50: [],
  chartEma200: [],
  loading: false
};

const els = {
  ethPrice: document.getElementById('ethPrice'),
  ethChange: document.getElementById('ethChange'),
  updatedAt: document.getElementById('updatedAt'),
  marketState: document.getElementById('marketState'),
  decisionCard: document.getElementById('decisionCard'),
  decisionText: document.getElementById('decisionText'),
  decisionReason: document.getElementById('decisionReason'),
  whyList: document.getElementById('whyList'),
  conclusion: document.getElementById('conclusion'),
  keyData: document.getElementById('keyData'),
  btcBox: document.getElementById('btcBox'),
  planText: document.getElementById('planText'),
  finalNote: document.getElementById('finalNote'),
  refreshBtn: document.getElementById('refreshBtn'),
  appVersion: document.getElementById('appVersion'),
  chart: document.getElementById('chart')
};

if (els.appVersion) {
  els.appVersion.textContent = `${APP_VERSION} · ${APP_DATE}`;
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return '--';
  return `US$ ${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, 2)}%`;
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function setLoading(isLoading) {
  state.loading = isLoading;
  if (els.refreshBtn) {
    els.refreshBtn.disabled = isLoading;
    els.refreshBtn.textContent = isLoading ? 'Actualizando' : 'Actualizar';
  }
}

async function fetchJson(path) {
  let lastError;

  for (const base of CONFIG.binanceBases) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);

    try {
      const response = await fetch(`${base}${path}`, {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
    }
  }

  throw lastError || new Error('No se pudieron obtener datos');
}

function parseKlines(raw) {
  const now = Date.now();
  return raw
    .map(item => ({
      openTime: Number(item[0]),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
      closeTime: Number(item[6])
    }))
    .filter(candle => candle.closeTime <= now)
    .filter(candle => Number.isFinite(candle.close));
}

function ema(values, period) {
  const result = new Array(values.length).fill(null);
  if (values.length < period) return result;

  const multiplier = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }

  let previous = sum / period;
  result[period - 1] = previous;

  for (let i = period; i < values.length; i++) {
    previous = values[i] * multiplier + previous * (1 - multiplier);
    result[i] = previous;
  }

  return result;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function analyzeCandles(candles) {
  const closes = candles.map(candle => candle.close);
  const volumes = candles.map(candle => candle.volume);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const lastIndex = candles.length - 1;
  const last = candles[lastIndex];
  const volumeAvg20 = average(volumes.slice(-21, -1));
  const rsi14 = rsi(closes, 14);
  const recentBase = candles[Math.max(0, candles.length - 7)]?.close;
  const recentChange = recentBase ? ((last.close - recentBase) / recentBase) * 100 : 0;

  return {
    candles,
    closes,
    ema21,
    ema50,
    ema200,
    last,
    price: last.close,
    ema21Last: ema21[lastIndex],
    ema50Last: ema50[lastIndex],
    ema200Last: ema200[lastIndex],
    rsi: rsi14,
    volume: last.volume,
    volumeAvg20,
    volumeRatio: volumeAvg20 ? last.volume / volumeAvg20 : null,
    recentChange,
    dist21: ema21[lastIndex] ? ((last.close - ema21[lastIndex]) / ema21[lastIndex]) * 100 : null,
    dist50: ema50[lastIndex] ? ((last.close - ema50[lastIndex]) / ema50[lastIndex]) * 100 : null,
    dist200: ema200[lastIndex] ? ((last.close - ema200[lastIndex]) / ema200[lastIndex]) * 100 : null
  };
}

function volumeStatus(ratio) {
  if (!Number.isFinite(ratio)) return 'sin dato';
  if (ratio >= 1.25) return 'alto';
  if (ratio >= 0.8) return 'normal';
  return 'bajo';
}

function trendFrom(data) {
  const { price, ema21Last, ema50Last, ema200Last } = data;
  if (![price, ema21Last, ema50Last, ema200Last].every(Number.isFinite)) {
    return 'neutral';
  }

  const spread = (Math.max(ema21Last, ema50Last, ema200Last) - Math.min(ema21Last, ema50Last, ema200Last)) / price * 100;
  if (spread < 0.75) return 'neutral';
  if (price > ema50Last && ema21Last >= ema50Last * 0.997 && ema50Last >= ema200Last * 0.995) return 'alcista';
  if (price < ema50Last || ema50Last < ema200Last * 0.995) return 'bajista';
  return 'neutral';
}

function btcContext(btc1h, btc4h) {
  const trend1h = trendFrom(btc1h);
  const trend4h = trendFrom(btc4h);
  const rsiValue = btc1h.rsi;
  const weak = trend1h === 'bajista' || trend4h === 'bajista' || rsiValue < 42;
  const strong = trend1h === 'alcista' && trend4h !== 'bajista' && rsiValue >= 48 && rsiValue <= 68;
  const trend = weak ? 'bajista' : strong ? 'alcista' : 'neutral';
  const stateText = strong ? 'fuerte' : weak ? 'débil' : 'dudoso';
  return { trend, stateText, rsi: rsiValue, weak, strong };
}

function buildDecision(eth1h, eth4h, eth15m, btc, ticker) {
  const trend1h = trendFrom(eth1h);
  const trend4h = trendFrom(eth4h);
  const trend15m = trendFrom(eth15m);
  const volume = volumeStatus(eth1h.volumeRatio);
  const rsiValue = eth1h.rsi;

  const priceAboveEma50 = eth1h.price > eth1h.ema50Last;
  const ema21NearOrAbove50 = eth1h.ema21Last >= eth1h.ema50Last * 0.997;
  const ema50Supports = eth1h.ema50Last >= eth1h.ema200Last * 0.995;
  const idealRsi = rsiValue >= 40 && rsiValue <= 60;
  const rsiHigh = rsiValue > 65;
  const overbought = rsiValue > 70;
  const rsiLow = rsiValue < 35;
  const nearEma21 = Math.abs(eth1h.dist21) <= 1.4;
  const extended = eth1h.dist21 > 2.8 || eth1h.recentChange > 3.2;
  const veryExtended = eth1h.dist21 > 4.2;
  const volumeOk = volume === 'normal' || volume === 'alto';
  const volumeLow = volume === 'bajo';
  const btcOk = !btc.weak;
  const contextOk = trend4h !== 'bajista';
  const support15m = trend15m !== 'bajista' || eth15m.price >= eth15m.ema50Last;
  const lateral = trend1h === 'neutral' && Math.abs(eth1h.dist50) < 1.1;
  const bullishButExtended = trend1h === 'alcista' && priceAboveEma50 && ema21NearOrAbove50 && contextOk && (extended || rsiHigh);
  const takeProfitContext = trend1h === 'alcista' && overbought && (veryExtended || eth1h.recentChange > 4.2);
  const recentHighs = eth1h.candles.slice(-12).map(candle => candle.high).filter(Number.isFinite);
  const recentHigh = recentHighs.length ? Math.max(...recentHighs) : eth1h.price;
  const zoneLow = eth1h.ema21Last * 0.992;
  const zoneHigh = Math.min(eth1h.ema21Last * 1.012, eth1h.price * 1.004);
  const pullbackHigh = eth1h.ema21Last * 1.006;

  const noBuyReasons = [];
  if (!priceAboveEma50) noBuyReasons.push('precio debajo de EMA50');
  if (!ema50Supports) noBuyReasons.push('EMA50 debajo o demasiado pegada a EMA200');
  if (btc.weak) noBuyReasons.push('BTC débil');
  if (trend4h === 'bajista') noBuyReasons.push('4h bajista');
  if (overbought && extended) noBuyReasons.push('RSI alto con precio extendido');
  if (lateral && volumeLow) noBuyReasons.push('mercado lateral con volumen bajo');

  let action = 'ESPERAR';
  let cardClass = 'wait';
  let reason = 'No hay ventaja clara para comprar ahora.';
  let conclusion = 'Conviene no apurarse hasta tener una zona mejor.';
  let finalNote = 'Esperar mejor oportunidad.';

  const canBuy =
    priceAboveEma50 &&
    ema21NearOrAbove50 &&
    ema50Supports &&
    idealRsi &&
    nearEma21 &&
    volumeOk &&
    btcOk &&
    contextOk &&
    support15m &&
    !extended;

  if (canBuy) {
    action = 'COMPRAR';
    cardClass = 'buy';
    reason = 'Pullback cerca de EMA21 con tendencia y RSI razonables.';
    conclusion = 'Condiciones razonables para compra en spot.';
    finalNote = 'Condiciones aceptables.';
  } else if (takeProfitContext) {
    action = 'VENDER / TOMAR GANANCIA';
    cardClass = 'no-buy';
    reason = 'Tendencia alcista, pero RSI alto y precio demasiado extendido. Zona de posible corrección.';
    conclusion = 'Para nuevas compras no hay buena relación riesgo/precio; para quien ya está adentro, conviene proteger ganancia.';
    finalNote = 'Precio extendido, no perseguir la suba.';
  } else if (bullishButExtended) {
    action = 'ESPERAR PULLBACK';
    cardClass = 'wait';
    reason = `Tendencia alcista, pero el precio está extendido. Conviene esperar retroceso.\nZona de pullback: ${formatPrice(zoneLow)} - ${formatPrice(pullbackHigh)}.\nO entrada agresiva si rompe ${formatPrice(recentHigh)} con volumen.`;
    conclusion = 'La estructura acompaña, pero la entrada actual llega tarde.';
    finalNote = 'Esperar pullback antes de comprar.';
  } else if (noBuyReasons.length >= 2 || !priceAboveEma50 || (!ema50Supports && btc.weak)) {
    action = 'ESPERAR';
    cardClass = 'wait';
    reason = `Mercado débil para compra: ${noBuyReasons.slice(0, 3).join(', ')}. Mejor no operar.`;
    conclusion = 'No hay estructura suficiente para compra spot.';
    finalNote = 'Hoy no conviene apurarse.';
  } else if (veryExtended || rsiHigh || volumeLow || lateral || !nearEma21 || !btc.strong) {
    action = 'ESPERAR';
    cardClass = 'wait';
    if (veryExtended) reason = 'Precio muy alejado de EMA21, zona de cautela.';
    else if (rsiHigh) reason = 'RSI alto; conviene esperar corrección.';
    else if (volumeLow) reason = 'Volumen bajo, falta confirmación.';
    else if (lateral) reason = 'Mercado lateral sin ventaja clara.';
    else if (!nearEma21) reason = 'Precio lejos de EMA21; mejor esperar zona de pullback.';
    else reason = 'BTC no confirma con fuerza suficiente.';
    conclusion = 'Hay elementos positivos, pero no alcanza para comprar con claridad.';
    finalNote = 'Esperar mejor oportunidad.';
  }

  let plan = 'Esperar una zona mas clara antes de comprar.';
  if (action === 'COMPRAR') {
    plan = `Compra razonable cerca de ${formatPrice(zoneLow)} - ${formatPrice(zoneHigh)}. Mantener prudencia si aparece vela fuerte en contra.`;
  } else if (action === 'ESPERAR PULLBACK') {
    plan = `Zona de pullback: ${formatPrice(zoneLow)} - ${formatPrice(pullbackHigh)}. O entrada agresiva si rompe ${formatPrice(recentHigh)} con volumen.`;
  } else if (action === 'VENDER / TOMAR GANANCIA') {
    plan = `Precio extendido. Evitar compras nuevas y vigilar posible corrección hacia EMA21: ${formatPrice(zoneLow)} - ${formatPrice(pullbackHigh)}.`;
  } else if (action === 'ESPERAR') {
    if (extended || rsiHigh) {
      plan = `Esperar retroceso hacia EMA21: zona aproximada ${formatPrice(zoneLow)} - ${formatPrice(pullbackHigh)}. Precio extendido ahora.`;
    } else {
      plan = `Esperar confirmación cerca de EMA21 o recuperación con volumen. Zona a vigilar: ${formatPrice(zoneLow)} - ${formatPrice(zoneHigh)}.`;
    }
  } else {
    plan = `Sin zona de compra confiable. Vigilar recuperación sobre EMA50 (${formatPrice(eth1h.ema50Last)}) y BTC mas firme.`;
  }

  const why = [
    `Tendencia 1h: ${trend1h} (EMA21 ${formatPrice(eth1h.ema21Last)}, EMA50 ${formatPrice(eth1h.ema50Last)}, EMA200 ${formatPrice(eth1h.ema200Last)}).`,
    `RSI: ${formatNumber(rsiValue, 1)} (${rsiLow ? 'posible rebote, con cuidado' : idealRsi ? 'zona ideal' : overbought ? 'sobrecompra' : 'fuera de zona ideal'}).`,
    `Precio vs EMAs: ${formatPercent(eth1h.dist21)} de EMA21, ${formatPercent(eth1h.dist50)} de EMA50 y ${formatPercent(eth1h.dist200)} de EMA200.`,
    `Volumen: ${volume} (${formatNumber(eth1h.volumeRatio || 0, 2)}x del promedio de 20 velas).`,
    `Contexto BTC: ${btc.trend} (${btc.stateText}), RSI ${formatNumber(btc.rsi, 1)}.`,
    `Apoyo 4h/15m: 4h ${trend4h}, 15m ${trend15m}.`
  ];

  return {
    action,
    cardClass,
    reason,
    conclusion,
    finalNote,
    plan,
    why,
    trend1h,
    trend4h,
    trend15m,
    volume,
    ticker
  };
}

function renderDecision(decision) {
  const longLabel = decision.action.length > 14 ? ' long-label' : '';
  els.decisionCard.className = `decision-card ${decision.cardClass}${longLabel}`;
  const icon = decision.action === 'COMPRAR' ? '🟢' : decision.action === 'VENDER / TOMAR GANANCIA' ? '🔴' : '🟡';
  els.decisionText.textContent = `${icon} ${decision.action}`;
  els.decisionReason.textContent = decision.reason;
  els.marketState.textContent = decision.trend1h.charAt(0).toUpperCase() + decision.trend1h.slice(1);
  els.whyList.innerHTML = decision.why.map(item => `<li>${item}</li>`).join('');
  els.conclusion.textContent = decision.conclusion;
  els.planText.textContent = decision.plan;
  els.finalNote.textContent = decision.finalNote;
}

function renderKeyData(eth1h, ticker) {
  const change24 = Number(ticker.priceChangePercent);
  const rows = [
    ['Precio', formatPrice(Number(ticker.lastPrice) || eth1h.price)],
    ['EMA 21', formatPrice(eth1h.ema21Last)],
    ['EMA 50', formatPrice(eth1h.ema50Last)],
    ['EMA 200', formatPrice(eth1h.ema200Last)],
    ['RSI', formatNumber(eth1h.rsi, 1)],
    ['Dist. EMA21', formatPercent(eth1h.dist21)],
    ['Dist. EMA50', formatPercent(eth1h.dist50)],
    ['Dist. EMA200', formatPercent(eth1h.dist200)],
    ['Variacion 24h', formatPercent(change24)]
  ];

  els.keyData.innerHTML = rows
    .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
    .join('');
}

function renderBtc(btc) {
  const warning = btc.weak ? ' ⚠️' : '';
  els.btcBox.innerHTML = `
    <strong>BTC: ${btc.trend.charAt(0).toUpperCase() + btc.trend.slice(1)} (${btc.stateText})${warning}</strong>
    <span>RSI ${formatNumber(btc.rsi, 1)}. Se usa solo como filtro de contexto, no como protagonista.</span>
  `;
}

function drawChart() {
  const canvas = els.chart;
  if (!canvas || !state.chartCandles.length) return;

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 720;
  const cssHeight = Math.max(360, Math.round(cssWidth * 0.72));
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const candles = state.chartCandles.slice(-72);
  const startIndex = state.chartCandles.length - candles.length;
  const ema21 = state.chartEma21.slice(startIndex);
  const ema50 = state.chartEma50.slice(startIndex);
  const ema200 = state.chartEma200.slice(startIndex);
  const width = cssWidth;
  const height = cssHeight;
  const pad = { top: 16, right: 12, bottom: 82, left: 12 };
  const chartH = height - pad.top - pad.bottom;
  const volumeTop = height - 64;
  const volumeH = 46;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#08120f';
  ctx.fillRect(0, 0, width, height);

  const values = candles.flatMap(c => [c.high, c.low])
    .concat(ema21, ema50, ema200)
    .filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const maxVolume = Math.max(...candles.map(c => c.volume), 1);

  const xStep = (width - pad.left - pad.right) / candles.length;
  const candleW = Math.max(3, Math.min(9, xStep * 0.58));
  const y = value => pad.top + (max - value) / range * chartH;
  const x = index => pad.left + index * xStep + xStep / 2;

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yy = pad.top + chartH * (i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.left, yy);
    ctx.lineTo(width - pad.right, yy);
    ctx.stroke();
  }

  candles.forEach((candle, index) => {
    const xx = x(index);
    const up = candle.close >= candle.open;
    const color = up ? '#25d985' : '#ff5d6c';
    const top = y(Math.max(candle.open, candle.close));
    const bottom = y(Math.min(candle.open, candle.close));
    const bodyH = Math.max(1, bottom - top);
    const volH = candle.volume / maxVolume * volumeH;

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(xx, y(candle.high));
    ctx.lineTo(xx, y(candle.low));
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(xx - candleW / 2, top, candleW, bodyH);

    ctx.fillStyle = up ? 'rgba(37,217,133,0.35)' : 'rgba(255,93,108,0.35)';
    ctx.fillRect(xx - candleW / 2, volumeTop + volumeH - volH, candleW, volH);
  });

  function drawLine(valuesLine, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    valuesLine.forEach((value, index) => {
      if (!Number.isFinite(value)) return;
      const xx = x(index);
      const yy = y(value);
      if (!started) {
        ctx.moveTo(xx, yy);
        started = true;
      } else {
        ctx.lineTo(xx, yy);
      }
    });
    ctx.stroke();
  }

  drawLine(ema21, '#f3a23a');
  drawLine(ema50, '#a985ff');
  drawLine(ema200, '#6ec8ff');

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.fillText(formatPrice(candles[candles.length - 1].close), pad.left, height - 14);
}

async function loadData() {
  if (state.loading) return;
  setLoading(true);

  try {
    const [
      eth15Raw,
      eth1Raw,
      eth4Raw,
      btc1Raw,
      btc4Raw,
      ethTicker,
      btcTicker
    ] = await Promise.all([
      fetchJson(`/api/v3/klines?symbol=${CONFIG.symbol}&interval=15m&limit=260`),
      fetchJson(`/api/v3/klines?symbol=${CONFIG.symbol}&interval=1h&limit=260`),
      fetchJson(`/api/v3/klines?symbol=${CONFIG.symbol}&interval=4h&limit=260`),
      fetchJson(`/api/v3/klines?symbol=${CONFIG.btcSymbol}&interval=1h&limit=260`),
      fetchJson(`/api/v3/klines?symbol=${CONFIG.btcSymbol}&interval=4h&limit=260`),
      fetchJson(`/api/v3/ticker/24hr?symbol=${CONFIG.symbol}`),
      fetchJson(`/api/v3/ticker/24hr?symbol=${CONFIG.btcSymbol}`)
    ]);

    const eth15m = analyzeCandles(parseKlines(eth15Raw));
    const eth1h = analyzeCandles(parseKlines(eth1Raw));
    const eth4h = analyzeCandles(parseKlines(eth4Raw));
    const btc1h = analyzeCandles(parseKlines(btc1Raw));
    const btc4h = analyzeCandles(parseKlines(btc4Raw));
    const btc = btcContext(btc1h, btc4h);
    const decision = buildDecision(eth1h, eth4h, eth15m, btc, ethTicker);

    state.chartCandles = eth1h.candles;
    state.chartEma21 = eth1h.ema21;
    state.chartEma50 = eth1h.ema50;
    state.chartEma200 = eth1h.ema200;

    const price = Number(ethTicker.lastPrice) || eth1h.price;
    const change24 = Number(ethTicker.priceChangePercent);
    els.ethPrice.textContent = formatPrice(price);
    els.ethChange.innerHTML = `24h <span class="${change24 >= 0 ? 'positive' : 'negative'}">${formatPercent(change24)}</span>`;
    els.updatedAt.textContent = formatTime();

    renderDecision(decision);
    renderKeyData(eth1h, ethTicker);
    renderBtc({ ...btc, ticker: btcTicker });
    drawChart();
  } catch (error) {
    showError(error);
  } finally {
    setLoading(false);
  }
}

function showError(error) {
  els.updatedAt.textContent = formatTime();
  els.marketState.textContent = 'Sin datos';
  els.decisionCard.className = 'decision-card wait';
  els.decisionText.textContent = '🟡 ESPERAR';
  els.decisionReason.textContent = 'No se pudieron cargar datos actuales. Mejor no operar con informacion incompleta.';
  els.whyList.innerHTML = `
    <li class="error-state">Fallo de datos: ${error?.message || 'error desconocido'}.</li>
    <li>La app no inventa señales cuando Binance no responde.</li>
  `;
  els.conclusion.textContent = 'Sin datos confiables, la decision prudente es no comprar.';
  els.planText.textContent = 'Reintentar actualizacion o abrir Binance/TradingView para confirmar manualmente.';
  els.finalNote.textContent = 'No operar sin datos.';
}

els.refreshBtn?.addEventListener('click', loadData);
window.addEventListener('resize', drawChart);

loadData();
setInterval(loadData, CONFIG.refreshMs);
