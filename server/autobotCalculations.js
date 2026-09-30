/**
 * BSB/server/autobotCalculations.js
 * Centralized Mathematical & Grid Engine - 2026 Exponential & Geometric Suite
 * SRP-Optimized: Live metrics, targets, PnL matrices, and geometric grid generators.
 */

const { 
    AI_MIN_TRADE_AMOUNT, 
    AI_SAFETY_MARGIN,
    MAX_ALLOWED_ORDERS,
    DEFAULT_START_STEP,
    DEFAULT_TARGET_COVERAGE 
} = require('./utils/tradeConstants');

// ==========================================
// 1. HELPERS Y FUNCIONES DE COMPATIBILIDAD
// ==========================================

/**
 * Parsea y sanitiza de forma segura un valor a número flotante.
 */
const parseNumber = (val, defaultValue = 0) => {
    const n = parseFloat(val);
    return isNaN(n) ? defaultValue : n;
};

/**
 * Calcula el monto total requerido para N órdenes exponenciales.
 * sizeVar actúa como factor de multiplicación directo (ej. 2.0).
 * Incluye protección contra desbordamiento (Overflow Protection).
 */
function getExponentialAmount(baseAmount, orderCount, sizeVar) {
    const base = parseNumber(baseAmount);
    const rawCount = parseNumber(orderCount); 
    const sVar = parseNumber(sizeVar);

    if (base <= 0) return 0;

    // Válvula de seguridad contra desbordamiento de órdenes
    const count = Math.min(Math.max(0, rawCount), MAX_ALLOWED_ORDERS);

    if (rawCount > MAX_ALLOWED_ORDERS) {
        console.error(`[SEGURIDAD] Intento de cálculo exponencial con ${rawCount} órdenes. Limitado a ${MAX_ALLOWED_ORDERS}.`);
    }

    const multiplier = sVar > 0 ? sVar : 1;
    return base * Math.pow(multiplier, count);
}

/**
 * Calcula la distancia de precio (step) exponencial para coberturas DCA.
 */
function getExponentialPriceStep(basePriceVarDec, coverageIndex, priceVarIncrement = 0) {
    const baseStep = parseNumber(basePriceVarDec);
    const increment = 1 + (parseNumber(priceVarIncrement) / 100);
    const index = Math.max(0, parseNumber(coverageIndex));
    return baseStep * Math.pow(increment, index);
}

/**
 * Calcula el precio objetivo considerando las comisiones (Maker/Taker) de la plataforma.
 */
function calculateTargetWithFees(entryPrice, targetProfitNet, side = 'long', feeRate = 0.001) {
    const p = parseNumber(entryPrice);
    if (p <= 0) return 0;

    const netProfitDec = parseNumber(targetProfitNet) / 100;
    const totalMarkup = netProfitDec + (feeRate * 2);

    return side === 'long' ? p * (1 + totalMarkup) : p * (1 - totalMarkup);
}

// ==========================================
// 2. LÓGICA GEOMÉTRICA DE REPARTO 2026
// ==========================================

/**
 * Calcula la distribución geométrica óptima del capital asignado.
 */
function calculateDistributedSizes(totalAmount) {
    const amount = parseNumber(totalAmount);
    if (amount < 42.00) return null; // Requiere capital mínimo para distribución multinivel
    
    let n = 1;
    while (n < 10) {
        const nextSum = 6.00 * (Math.pow(2.0, n + 1) - 1);
        if (nextSum > amount) break;
        n++;
    }
    
    let low = 2.0;
    let high = amount;
    let r = 2.0;
    
    if (n > 1) {
        for (let i = 0; i < 60; i++) {
            const mid = (low + high) / 2;
            const sumGeo = 6.00 * (Math.pow(mid, n) - 1) / (mid - 1);
            if (sumGeo < amount) {
                low = mid;
            } else {
                high = mid;
            }
        }
        r = (low + high) / 2;
    }
    
    const finalSizes = [];
    for (let i = 0; i < n; i++) {
        finalSizes.push(6.00 * Math.pow(r, i));
    }
    
    const roundedSizes = finalSizes.map(s => parseFloat(s.toFixed(2)));
    const sumRounded = roundedSizes.reduce((a, b) => a + b, 0);
    const delta = amount - sumRounded;
    roundedSizes[roundedSizes.length - 1] = parseFloat((roundedSizes[roundedSizes.length - 1] + delta).toFixed(2));
    
    return {
        levels: n,
        sizeMultiplier: parseFloat(r.toFixed(4)),
        sizes: roundedSizes
    };
}

/**
 * Determina el factor de expansión de escalón (Step Growth) para cubrir el rango objetivo.
 */
function calculateStepGrow(levels) {
    const n = parseInt(levels, 10);
    const numSteps = n - 1;
    if (numSteps <= 0) return 1.0;
    
    let low = 0.1;
    let high = 5.0;
    
    for (let i = 0; i < 60; i++) {
        const mid = (low + high) / 2;
        let prod = 1.0;
        let invalid = false;
        
        for (let j = 0; j < numSteps; j++) {
            const step = DEFAULT_START_STEP * Math.pow(mid, j);
            if (step >= 1.0) { invalid = true; break; }
            prod *= (1.0 - step);
        }
        
        if (invalid) { high = mid; continue; }
        
        const actualCoverage = 1.0 - prod;
        if (actualCoverage < DEFAULT_TARGET_COVERAGE) { low = mid; } else { high = mid; }
    }
    
    return parseFloat(((low + high) / 2).toFixed(4));
}

/**
 * Genera la grilla matemática completa de niveles de precio y órdenes de cobertura.
 */
function generateAutobotGrid(amount, initialPrice, side = 'long') {
    const p = parseNumber(initialPrice);
    if (p <= 0) return null;

    const sizeData = calculateDistributedSizes(amount);
    if (!sizeData) return null;
    
    const n = sizeData.levels;
    const sizes = sizeData.sizes;
    const gridStepMultiplier = calculateStepGrow(n);
    
    const orders = [];
    let currentPrice = p;
    
    orders.push({
        orderNumber: 1,
        sizeUSDT: sizes[0],
        price: parseFloat(currentPrice.toFixed(2)),
        distanceFromPrevious: "0.00%"
    });
    
    for (let i = 1; i < n; i++) {
        const currentStep = DEFAULT_START_STEP * Math.pow(gridStepMultiplier, i - 1);
        if (String(side).toLowerCase() === 'long') {
            currentPrice = currentPrice * (1.0 - currentStep);
        } else {
            currentPrice = currentPrice * (1.0 + currentStep);
        }
        
        orders.push({
            orderNumber: i + 1,
            sizeUSDT: sizes[i],
            price: parseFloat(currentPrice.toFixed(2)),
            distanceFromPrevious: (currentStep * 100).toFixed(2) + "%"
        });
    }
    
    const totalCoverage = Math.abs((p - currentPrice) / p) * 100;
    
    return {
        totalAmountAllocated: parseNumber(amount),
        totalLevels: n,
        sizeMultiplier: sizeData.sizeMultiplier,
        priceStepMultiplier: gridStepMultiplier,
        realCoveragePct: totalCoverage.toFixed(2) + "%",
        orders: orders
    };
}

// ==========================================
// 3. CAPAS DE INTERFAZ Y CÁLCULO DE COBERTURA
// ==========================================

function calculateLongCoverage(totalAmount, entryPrice, purchaseUsdt, priceVar, sizeVar, occ, priceStepInc) {
    const currentPrice = parseNumber(entryPrice, 1);
    const allocated = parseNumber(totalAmount) || parseNumber(purchaseUsdt) || 50;
    const grid = generateAutobotGrid(allocated, currentPrice, 'long');
    
    if (!grid || grid.orders.length === 0) {
        return { coveragePrice: parseFloat((currentPrice * 0.82).toFixed(2)), numberOfOrders: 5 };
    }
    
    const lastOrder = grid.orders[grid.orders.length - 1];
    const remainingOrders = Math.max(0, grid.totalLevels - parseNumber(occ));
    
    return { coveragePrice: lastOrder.price, numberOfOrders: remainingOrders };
}

function calculateShortCoverage(totalAmount, entryPrice, purchaseUsdt, priceVar, sizeVar, occ, priceStepInc) {
    const currentPrice = parseNumber(entryPrice, 1);
    const allocated = parseNumber(totalAmount) || parseNumber(purchaseUsdt) || 50;
    const grid = generateAutobotGrid(allocated, currentPrice, 'short');
    
    if (!grid || grid.orders.length === 0) {
        return { coveragePrice: parseFloat((currentPrice * 1.18).toFixed(2)), numberOfOrders: 5 };
    }
    
    const lastOrder = grid.orders[grid.orders.length - 1];
    const remainingOrders = Math.max(0, grid.totalLevels - parseNumber(occ));
    
    return { coveragePrice: lastOrder.price, numberOfOrders: remainingOrders };
}

function calculateLongTargets(lastPrice, config, currentOrderCount) {
    const p = parseNumber(lastPrice);
    const priceVarDec = parseNumber(config?.price_var) / 100;
    const priceVarInc = parseNumber(config?.price_step_inc);
    const profitPercent = parseNumber(config?.profit_percent || config?.trigger);
    const sizeVar = parseNumber(config?.size_var);
    const purchaseUsdt = parseNumber(config?.purchaseUsdt);
    
    const currentStep = getExponentialPriceStep(priceVarDec, currentOrderCount, priceVarInc);

    return {
        ltprice: calculateTargetWithFees(p, profitPercent, 'long', 0.001),
        nextCoveragePrice: parseFloat((p * (1 - currentStep)).toFixed(2)),
        requiredCoverageAmount: getExponentialAmount(purchaseUsdt, currentOrderCount, sizeVar)
    };
}

function calculateShortTargets(lastPrice, config, currentOrderCount) {
    const p = parseNumber(lastPrice);
    const conf = config || {}; 
    
    const priceVarDec = parseNumber(conf.price_var) / 100;
    const priceVarInc = parseNumber(conf.price_step_inc);
    const profitPercent = parseNumber(conf.profit_percent || conf.trigger);
    const sizeVar = parseNumber(conf.size_var);
    const purchaseUsdt = parseNumber(conf.purchaseUsdt);

    const currentStep = getExponentialPriceStep(priceVarDec, currentOrderCount, priceVarInc);

    return {
        stprice: calculateTargetWithFees(p, profitPercent, 'short', 0.001),
        nextCoveragePrice: parseFloat((p * (1 + currentStep)).toFixed(2)),
        requiredCoverageAmount: getExponentialAmount(purchaseUsdt, currentOrderCount, sizeVar)
    };
}

/**
 * Calcula la ganancia/pérdida no realizada (Floating PnL) en USDT.
 */
function calculatePotentialProfit(ppc, ac, currentPrice, side) {
    const avgPrice = parseNumber(ppc);
    const capital = parseNumber(ac);
    const price = parseNumber(currentPrice);

    if (avgPrice <= 0 || capital <= 0 || price <= 0) return 0;

    let profitPct = 0;
    if (side === 'long' || side === 'ai') {
        profitPct = (price - avgPrice) / avgPrice;
    } else if (side === 'short') {
        profitPct = (avgPrice - price) / avgPrice;
    }

    return parseFloat((profitPct * capital).toFixed(4));
}

// ==========================================
// 4. CENTRALIZACIÓN DE CÁLCULOS EN VIVO (SRP)
// ==========================================

/**
 * Evalúa y calcula las métricas en tiempo real consumidas en cada tick por autobotLogic.js
 */
function calculateLiveBotMetrics(botState, currentPrice) {
    const metrics = {};
    const price = parseNumber(currentPrice);

    if (!botState || price <= 0) return metrics;

    // --- EVALUACIÓN DE MATRIZ LONG ---
    if (botState.lstate !== 'STOPPED' && botState.config?.long) {
        const entryPriceRef = (botState.locc || 0) > 0 ? (botState.llep || price) : price;
        const longCov = calculateLongCoverage(
            botState.config.long.amountUsdt, 
            entryPriceRef, 
            botState.config.long.purchaseUsdt, 
            parseNumber(botState.config.long.price_var) / 100, 
            parseNumber(botState.config.long.size_var), 
            botState.locc || 0, 
            parseNumber(botState.config.long.price_step_inc)
        );
        
        metrics.lcoverage = longCov.coveragePrice;
        metrics.lnorder = longCov.numberOfOrders;
        metrics.lprofit = (botState.lppc || 0) > 0 
            ? calculatePotentialProfit(botState.lppc, botState.lai || 0, price, 'long') 
            : 0;
    }

    // --- EVALUACIÓN DE MATRIZ SHORT ---
    if (botState.sstate !== 'STOPPED' && botState.config?.short) {
        const entryPriceRef = (botState.socc || 0) > 0 ? (botState.slep || price) : price;
        const shortCov = calculateShortCoverage(
            botState.config.short.amountUsdt, 
            entryPriceRef, 
            botState.config.short.purchaseUsdt, 
            parseNumber(botState.config.short.price_var) / 100, 
            parseNumber(botState.config.short.size_var), 
            botState.socc || 0, 
            parseNumber(botState.config.short.price_step_inc)
        );
        
        metrics.scoverage = shortCov.coveragePrice;
        metrics.snorder = shortCov.numberOfOrders;
        metrics.sprofit = (botState.sppc || 0) > 0 
            ? calculatePotentialProfit(botState.sppc, botState.sai || 0, price, 'short') 
            : 0;
    }

    return metrics;
}

// ==========================================
// EXPORTS
// ==========================================
module.exports = {
    parseNumber,
    getExponentialAmount,
    calculateLongTargets,
    calculateShortTargets,
    calculateLongCoverage,
    calculateShortCoverage,
    calculatePotentialProfit,
    calculateDistributedSizes,
    calculateStepGrow,
    generateAutobotGrid,
    calculateLiveBotMetrics
};