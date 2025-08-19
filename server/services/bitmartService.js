const spotService = require('./bitmartSpot');
const { getBalance: getAccountBalances } = require('./bitmartSpot');
const bitmartClient = require('./bitmartClient');

const MIN_USDT_VALUE_FOR_BITMART = 5;

// =========================================================================
// Funciones de V4 corregidas
// =========================================================================

async function getOpenOrders(authCredentials, symbol) {
    console.log('[BITMART_SPOT_SERVICE] Obteniendo órdenes abiertas (V4 POST) para ' + symbol + '...');
    try {
        const body = { symbol: symbol };
        const response = await bitmartClient.makeRequest(authCredentials, 'POST', '/spot/v4/query/open-orders', null, body);

        if (response.code === 1000) {
            const orders = response.data.list || [];
            if (orders.length === 0) {
                console.log('ℹ️ No se encontraron órdenes abiertas.');
                return [];
            }
            console.log(`✅ Órdenes abiertas obtenidas con éxito. Se encontraron ${orders.length} órdenes.`);
            return orders;
        } else {
            console.error('❌ Falló la obtención de órdenes abiertas V4.');
            throw new Error(response.message || 'Unknown error');
        }
    } catch (error) {
        console.error('❌ Falló la obtención de órdenes abiertas V4.', error.message);
        throw error;
    }
}

async function getHistoryOrders(authCredentials, options = {}) {
    console.log('[BITMART_SPOT_SERVICE] Listando historial de órdenes (V4 POST)...');
    try {
        const response = await bitmartClient.makeRequest(authCredentials, 'POST', '/spot/v4/query/history-orders', null, options);

        if (response.code === 1000) {
            const orders = response.data.list || [];
            if (orders.length === 0) {
                console.log('ℹ️ No se encontraron órdenes en el historial.');
                return [];
            }
            console.log(`✅ Historial de órdenes obtenido con éxito. Se encontraron ${orders.length} órdenes.`);
            return orders;
        } else {
            console.error('❌ Falló la obtención del historial de órdenes V4.');
            throw new Error(response.message || 'Unknown error');
        }
    } catch (error) {
        console.error('❌ Falló la obtención del historial de órdenes V4.', error.message);
        throw error;
    }
}

// =========================================================================
// Funciones Existentes y originales
// =========================================================================

async function validateApiKeys(apiKey, secretKey, apiMemo) {
    console.log('\n--- Iniciando validación de credenciales API de BitMart ---');
    if (!apiKey || !secretKey || (apiMemo === undefined || apiMemo === null)) {
        console.error("ERROR: API Key, Secret Key o API Memo no proporcionados para validación.");
        return false;
    }
    const authCredentials = { apiKey, secretKey, memo: apiMemo };
    try {
        await spotService.getBalance(authCredentials);
        console.log('✅ Credenciales API de BitMart validadas con éxito. CONECTADO.');
        return true;
    } catch (error) {
        console.error('❌ Falló la validación de credenciales API de BitMart:', error.message);
        return false;
    }
}

async function cancelAllOpenOrders(bitmartCreds, symbol) {
    console.log(`[ORCHESTRATOR] Intentando cancelar órdenes abiertas para ${symbol}...`);
    try {
        const orders = await getOpenOrders(bitmartCreds, symbol);
        if (orders.length > 0) {
            for (const order of orders) {
                console.log(`[ORCHESTRATOR] Cancelando orden: ${order.order_id}`);
                await spotService.cancelOrder(bitmartCreds, symbol, order.order_id);
                console.log(`[ORCHESTRATOR] Orden ${order.order_id} cancelada.`);
            }
            console.log(`[ORCHESTRATOR] Todas las ${orders.length} órdenes abiertas para ${symbol} han sido canceladas.`);
        } else {
            console.log('[ORCHESTRATOR] No se encontraron órdenes abiertas para cancelar.');
        }
    } catch (error) {
        console.error('[ORCHESTRATOR] Error al cancelar órdenes abiertas:', error.message);
        throw error;
    }
}

async function placeFirstBuyOrder(authCredentials, symbol, purchaseAmountUsdt) {
    console.log(`[ORCHESTRATOR] Colocando la primera orden de compra (Market)...`);
    const side = 'buy';
    const type = 'market';

    const balanceInfo = await spotService.getBalance(authCredentials);
    const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available || 0) : 0;

    if (purchaseAmountUsdt < MIN_USDT_VALUE_FOR_BITMART) {
        throw new Error(`El valor de la orden (${purchaseAmountUsdt.toFixed(2)} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT).`);
    }

    if (availableUSDT < purchaseAmountUsdt) {
        throw new Error(`Balance insuficiente para la primera orden. Necesario: ${purchaseAmountUsdt.toFixed(2)} USDT, Disponible: ${availableUSDT.toFixed(2)} USDT.`);
    }

    const orderResult = await spotService.placeOrder(authCredentials, symbol, side, type, purchaseAmountUsdt.toString());
    const filledOrder = await spotService.getOrderDetail(authCredentials, symbol, orderResult.order_id);

    if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
        console.log(`[ORCHESTRATOR] Primera orden de compra (Market) completada: ${JSON.stringify(filledOrder)}`);
        return {
            orderId: filledOrder.order_id,
            price: parseFloat(filledOrder.price || 0),
            size: parseFloat(filledOrder.filled_size || 0),
            side: 'buy',
            type: 'market',
            state: 'filled'
        };
    } else {
        throw new Error(`La primera orden ${orderResult.order_id} no se ha completado todavía o falló.`);
    }
}

async function placeCoverageBuyOrder(authCredentials, symbol, nextUSDTAmount, targetPrice) {
    console.log(`[ORCHESTRATOR] Colocando orden de compra de COBERTURA (Limit)...`);
    const side = 'buy';
    const type = 'limit';

    const balanceInfo = await spotService.getBalance(authCredentials);
    const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available || 0) : 0;

    if (availableUSDT < nextUSDTAmount || nextUSDTAmount < MIN_USDT_VALUE_FOR_BITMART) {
        throw new Error(`Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto de orden (${nextUSDTAmount.toFixed(2)} USDT) es menor al mínimo para orden de cobertura.`);
    }

    if (targetPrice === undefined || targetPrice === null || targetPrice === 0) {
        throw new Error(`Precio objetivo de cobertura no disponible o es cero.`);
    }

    const orderResult = await spotService.placeOrder(authCredentials, symbol, side, type, nextUSDTAmount.toFixed(2), targetPrice.toFixed(2));
    const filledOrder = await spotService.getOrderDetail(authCredentials, symbol, orderResult.order_id);

    if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
        console.log(`[ORCHESTRATOR] Orden de cobertura (Limit) completada: ${JSON.stringify(filledOrder)}`);
        return {
            orderId: filledOrder.order_id,
            price: parseFloat(filledOrder.price || 0),
            size: parseFloat(filledOrder.filled_size || 0),
            side: 'buy',
            type: 'limit',
            state: 'filled'
        };
    } else {
        console.log(`[ORCHESTRATOR] Orden de cobertura (Limit) ${orderResult.order_id} está ${filledOrder.state}.`);
        return {
            orderId: filledOrder.order_id,
            price: parseFloat(filledOrder.price || 0),
            size: parseFloat(filledOrder.size || 0),
            filledSize: parseFloat(filledOrder.filled_size || 0),
            side: 'buy',
            type: 'limit',
            state: filledOrder.state
        };
    }
}

async function placeSellOrder(authCredentials, symbol, sizeBTC, price = null) {
    console.log(`[ORCHESTRATOR] Colocando orden de VENTA ${price ? '(Limit)' : '(Market)'}...`);
    const side = 'sell';
    const type = price ? 'limit' : 'market';

    if (sizeBTC <= 0) {
        throw new Error(`No hay activo para vender (AC = 0).`);
    }

    const orderResult = await spotService.placeOrder(authCredentials, symbol, side, type, sizeBTC.toFixed(8), price ? price.toFixed(2) : undefined);
    const filledOrder = await spotService.getOrderDetail(authCredentials, symbol, orderResult.order_id);

    if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
        console.log(`[ORCHESTRATOR] Orden de venta ${type} completada: ${JSON.stringify(filledOrder)}`);
        return {
            orderId: filledOrder.order_id,
            price: parseFloat(filledOrder.price || 0),
            size: parseFloat(filledOrder.filled_size || 0),
            side: 'sell',
            type: type,
            state: 'filled'
        };
    } else {
        console.log(`[ORCHESTRATOR] Orden de venta ${orderResult.order_id} está ${filledOrder.state}.`);
        return {
            orderId: filledOrder.order_id,
            price: parseFloat(filledOrder.price || 0),
            size: parseFloat(filledOrder.size || 0),
            filledSize: parseFloat(filledOrder.filled_size || 0),
            side: 'sell',
            type: type,
            state: filledOrder.state
        };
    };
}

async function placeLimitSellOrder(authCredentials, symbol, sizeBTC, price) {
    return await placeSellOrder(authCredentials, symbol, sizeBTC, price);
}

module.exports = {
    ...spotService,
    MIN_USDT_VALUE_FOR_BITMART,
    getAccountBalances,
    validateApiKeys,
    cancelAllOpenOrders,
    placeFirstBuyOrder,
    placeCoverageBuyOrder,
    placeSellOrder,
    placeLimitSellOrder,
    getOpenOrders,
    getHistoryOrders,
};