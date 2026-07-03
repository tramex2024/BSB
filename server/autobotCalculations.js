/**
 * ARCHIVO COMPLETO: autobotCalculations.js
 * Integración total: Lógica Exponencial 2026 + Funciones de Compatibilidad Legacy
 * Optimización: Centralización de Métricas de Cobertura en Vivo (SRP)
 */

// ==========================================
// 1. HELPERS Y FUNCIONES DE COMPATIBILIDAD
// ==========================================

const parseNumber = (val) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

/**
 * Calcula el monto total requerido para N órdenes exponenciales.
 * Incluye protección contra desbordamiento (Overflow Protection).
 */
function getExponentialAmount(baseAmount, orderCount, sizeVar) {
    const base = parseNumber(baseAmount);
    const rawCount = parseNumber(orderCount); 
    const sVar = parseNumber(sizeVar);

    // 1. Validación base
    if (base <= 0) return 0;

    // 2. VÁLVULA DE SEGURIDAD (Safety Valve)
    // Definimos un límite lógico de niveles. Si el sistema intenta calcular 
    // más de 50 niveles, es un error de estado o de persistencia.
    const MAX_ALLOWED_ORDERS = 50; 
    const count = Math.min(rawCount, MAX_ALLOWED_ORDERS);

    // Logging de alerta para auditoría si detectamos datos basura
    if (rawCount > MAX_ALLOWED_ORDERS) {
        console.error(`[SEGURIDAD] Intento de cálculo exponencial con ${rawCount} órdenes. Limitado a ${MAX_ALLOWED_ORDERS}.`);
    }

    const multiplier = 1 + (sVar / 100);
    
    // 3. Cálculo protegido
    return base * Math.pow(multiplier, count);
}

function getExponentialPriceStep(basePriceVarDec, coverageIndex, priceVarIncrement = 0) {
    const baseStep = parseNumber(basePriceVarDec);
    const increment = 1 + (parseNumber(priceVarIncrement) / 100);
    return baseStep * Math.pow(increment, coverageIndex);
}

function calculateTargetWithFees(entryPrice, targetProfitNet, side = 'long', feeRate = 0.001) {
    const p = parseNumber(entryPrice);
    const netProfitDec = parseNumber(targetProfitNet) / 100;
    const totalMarkup = netProfitDec + (feeRate * 2);

    return side === 'long' ? p * (1 + totalMarkup) : p * (1 - totalMarkup);
}

// ==========================================
// 2. LÓGICA GEOMÉTRICA 2026
// ==========================================

function calculateDistributedSizes(totalAmount) {
    const amount = parseFloat(totalAmount);
    if (amount < 42.00) return null;
    
    let n = 1;
    while (n < 10) {
        let nextSum = 6.00 * (Math.pow(2.0, n + 1) - 1);
        if (nextSum > amount) break;
        n++;
    }
    
    let low = 2.0;
    let high = amount;
    let r = 2.0;
    
    if (n > 1) {
        for (let i = 0; i < 60; i++) {
            let mid = (low + high) / 2;
            let sumGeo = 6.00 * (Math.pow(mid, n) - 1) / (mid - 1);
            if (sumGeo < amount) {
                low = mid;
            } else {
                high = mid;
            }
        }
        r = (low + high) / 2;
    }
    
    let finalSizes = [];
    for (let i = 0; i < n; i++) {
        finalSizes.push(6.00 * Math.pow(r, i));
    }
    
    let roundedSizes = finalSizes.map(s => parseFloat(s.toFixed(2)));
    let sumRounded = roundedSizes.reduce((a, b) => a + b, 0);
    let delta = amount - sumRounded;
    roundedSizes[roundedSizes.length - 1] = parseFloat((roundedSizes[roundedSizes.length - 1] + delta).toFixed(2));
    
    return {
        levels: n,
        sizeMultiplier: parseFloat(r.toFixed(4)),
        sizes: roundedSizes
    };
}

function calculateStepGrow(levels) {
    const n = parseInt(levels);
    const numSteps = n - 1;
    if (numSteps <= 0) return 1.0;

    const TARGET_COVERAGE = 0.18;
    const START_STEP = 0.015;
    
    let low = 0.1;
    let high = 5.0;
    
    for (let i = 0; i < 60; i++) {
        let mid = (low + high) / 2;
        let prod = 1.0;
        let invalid = false;
        
        for (let j = 0; j < numSteps; j++) {
            let step = START_STEP * Math.pow(mid, j);
            if (step >= 1.0) { invalid = true; break; }
            prod *= (1.0 - step);
        }
        
        if (invalid) { high = mid; continue; }
        
        let actualCoverage = 1.0 - prod;
        if (actualCoverage < TARGET_COVERAGE) { low = mid; } else { high = mid; }
    }
    
    return parseFloat(((low + high) / 2).toFixed(4));
}

function generateAutobotGrid(amount, initialPrice, side = 'long') {
    const sizeData = calculateDistributedSizes(amount);
    if (!sizeData) return null;
    
    const n = sizeData.levels;
    const sizes = sizeData.sizes;
    const gridStepMultiplier = calculateStepGrow(n);
    
    let orders = [];
    let currentPrice = parseFloat(initialPrice);
    
    orders.push({
        orderNumber: 1,
        sizeUSDT: sizes[0],
        price: parseFloat(currentPrice.toFixed(2)),
        distanceFromPrevious: "0.00%"
    });
    
    const START_STEP = 0.015;
    for (let i = 1; i < n; i++) {
        let currentStep = START_STEP * Math.pow(gridStepMultiplier, i - 1);
        if (side.toLowerCase() === 'long') {
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
    
    const totalCoverage = Math.abs((initialPrice - currentPrice) / initialPrice) * 100;
    
    return {
        totalAmountAllocated: amount,
        totalLevels: n,
        sizeMultiplier: sizeData.sizeMultiplier,
        priceStepMultiplier: gridStepMultiplier,
        realCoveragePct: totalCoverage.toFixed(2) + "%",
        orders: orders
    };
}

// ==========================================
// 3. CAPAS DE INTERFAZ Y CICLOS CORREGIDAS
// ==========================================

function calculateLongCoverage(totalAmount, entryPrice, purchaseUsdt, priceVar, sizeVar, occ, priceStepInc) {
    const currentPrice = parseFloat(entryPrice) || 1;
    // Usamos el presupuesto inicial total asignado para fijar la geometría real de la malla
    const grid = generateAutobotGrid(totalAmount || purchaseUsdt || 50, currentPrice, 'long');
    
    if (!grid || grid.orders.length === 0) {
        return { coveragePrice: currentPrice * 0.82, numberOfOrders: 5 };
    }
    
    const lastOrder = grid.orders[grid.orders.length - 1];
    // Dynamic MaxSO: Restamos las órdenes vivas (occ) del total de niveles diseñado
    const remainingOrders = Math.max(0, grid.totalLevels - parseNumber(occ));
    
    return { coveragePrice: lastOrder.price, numberOfOrders: remainingOrders };
}

function calculateShortCoverage(totalAmount, entryPrice, purchaseUsdt, priceVar, sizeVar, occ, priceStepInc) {
    const currentPrice = parseFloat(entryPrice) || 1;
    // Usamos el presupuesto inicial total asignado para fijar la geometría real de la malla
    const grid = generateAutobotGrid(totalAmount || purchaseUsdt || 50, currentPrice, 'short');
    
    if (!grid || grid.orders.length === 0) {
        return { coveragePrice: currentPrice * 1.18, numberOfOrders: 5 };
    }
    
    const lastOrder = grid.orders[grid.orders.length - 1];
    // Dynamic MaxSO: Restamos las órdenes vivas (occ) del total de niveles diseñado
    const remainingOrders = Math.max(0, grid.totalLevels - parseNumber(occ));
    
    return { coveragePrice: lastOrder.price, numberOfOrders: remainingOrders };
}

function calculateLongTargets(lastPrice, config, currentOrderCount) {
    const p = parseNumber(lastPrice);
    const priceVarDec = parseNumber(config?.price_var || 0) / 100;
    const priceVarInc = parseNumber(config?.price_step_inc || 0);
    const profitPercent = parseNumber(config?.profit_percent || config?.trigger || 0);
    const sizeVar = parseNumber(config?.size_var || 0);
    const purchaseUsdt = parseNumber(config?.purchaseUsdt || 0);
    
    const feeRate = 0.001;
    const currentStep = getExponentialPriceStep(priceVarDec, currentOrderCount, priceVarInc);

    return {
        ltprice: calculateTargetWithFees(p, profitPercent, 'long', feeRate),
        nextCoveragePrice: p * (1 - currentStep),
        requiredCoverageAmount: getExponentialAmount(purchaseUsdt, currentOrderCount, sizeVar)
    };
}

function calculateShortTargets(lastPrice, config, currentOrderCount) {
    const p = parseNumber(lastPrice);
    const conf = config || {}; 
    
    const priceVarDec = parseNumber(conf.price_var) / 100;
    const priceVarInc = parseNumber(conf.price_step_inc || 0);
    const profitPercent = parseNumber(conf.profit_percent || conf.trigger || 0);
    const sizeVar = parseNumber(conf.size_var || 0);
    const purchaseUsdt = parseNumber(conf.purchaseUsdt || 0);

    const currentStep = getExponentialPriceStep(priceVarDec, currentOrderCount, priceVarInc);

    return {
        stprice: calculateTargetWithFees(p, profitPercent, 'short', 0.001),
        nextCoveragePrice: p * (1 + currentStep),
        requiredCoverageAmount: getExponentialAmount(purchaseUsdt, currentOrderCount, sizeVar)
    };
}

/**
 * Versión limpia y corregida de calculatePotentialProfit
 * Sin filtros de reset a 0.
 */
function calculatePotentialProfit(ppc, ac, currentPrice, side) {
    const avgPrice = parseFloat(ppc);
    const capital = parseFloat(ac);
    const price = parseFloat(currentPrice);

    if (avgPrice <= 0) return 0;

    let profitPct = 0;
    if (side === 'long' || side === 'ai') {
        profitPct = (price - avgPrice) / avgPrice;
    } else if (side === 'short') {
        profitPct = (avgPrice - price) / avgPrice;
    }

    return parseFloat((profitPct * capital).toFixed(4));
}

// ==========================================
// 4. NUEVA CENTRALIZACIÓN DE CÁLCULOS EN VIVO
// ==========================================

/**
 * Procesa el estado completo del bot y devuelve un objeto de métricas 
 * limpio listo para inyectarse al changeset de la base de datos.
 */
function calculateLiveBotMetrics(botState, currentPrice) {
    const metrics = {};
    const price = parseNumber(currentPrice);

    if (!botState) return metrics;

    // --- CÁLCULOS EXCLUSIVOS PARA LONG ---
    if (botState.lstate !== 'STOPPED' && botState.config?.long) {
        const longCov = calculateLongCoverage(
            botState.config.long.amountUsdt, 
            botState.locc > 0 ? (botState.llep || price) : price, 
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

    // --- CÁLCULOS EXCLUSIVOS PARA SHORT ---
    if (botState.sstate !== 'STOPPED' && botState.config?.short) {
        const shortCov = calculateShortCoverage(
            botState.config.short.amountUsdt, 
            botState.socc > 0 ? (botState.slep || price) : price, 
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
if (typeof module !== 'undefined' && module.exports) {
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
        calculateLiveBotMetrics // Exportada correctamente para autobotLogic.js
    };
}