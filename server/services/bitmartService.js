const axios = require('axios');
const crypto = require('crypto');
const config = require('../config'); // Asegúrate de que tu archivo config.js exista y contenga las credenciales.

const BASE_URL = 'https://api-cloud.bitmart.com';
const MIN_USDT_VALUE_FOR_BITMART = 5.00; // Valor mínimo de USDT para una operación en BitMart

// Helper para generar la firma (authentication signature)
function createSignature(memo, secret, timestamp, body) {
    const message = timestamp + '#' + memo + '#' + body;
    const hash = crypto.createHmac('sha256', secret).update(message).digest('hex');
    return hash;
}

/**
 * Obtiene el tiempo actual del servidor de BitMart.
 * Necesario para la firma de las solicitudes API.
 */
async function getSystemTime() {
    try {
        const response = await axios.get(`${BASE_URL}/spot/v1/time`);
        if (response.data && response.data.code === 1000) {
            return response.data.data.server_time;
        } else {
            throw new Error(`Error al obtener tiempo del servidor: ${response.data ? JSON.stringify(response.data) : 'Respuesta vacía'}`);
        }
    } catch (error) {
        console.error('Error en getSystemTime:', error.message);
        throw error;
    }
}

/**
 * Realiza una solicitud autenticada a la API de BitMart.
 * @param {Object} authCredentials - Credenciales de BitMart del usuario (apiKey, apiSecret, apiMemo).
 * @param {string} method - Método HTTP (GET, POST).
 * @param {string} endpoint - Endpoint de la API (ej. '/spot/v1/wallet').
 * @param {Object} [data={}] - Datos para la solicitud (query params para GET, body para POST).
 * @returns {Promise<Object>} - La respuesta de la API.
 */
async function authenticatedRequest(authCredentials, method, endpoint, data = {}) {
    if (!authCredentials || !authCredentials.apiKey || !authCredentials.apiSecret || !authCredentials.apiMemo) {
        throw new Error('Credenciales de BitMart API no configuradas. Por favor, añádelas en el perfil del bot.');
    }

    const timestamp = await getSystemTime();
    const url = `${BASE_URL}${endpoint}`;
    let body = ''; // Para GET, el body es un string vacío
    let headers = {};

    if (method === 'POST') {
        body = JSON.stringify(data);
        headers['Content-Type'] = 'application/json';
    } else { // GET
        // Para GET, los parámetros van en la URL, pero para la firma, el 'body' es vacío
        const queryString = new URLSearchParams(data).toString();
        if (queryString) {
            url = `${url}?${queryString}`;
        }
    }

    const signature = createSignature(authCredentials.apiMemo, authCredentials.apiSecret, timestamp, body);

    headers = {
        ...headers,
        'X-BM-KEY': authCredentials.apiKey,
        'X-BM-TIMESTAMP': timestamp,
        'X-BM-SIGN': signature,
        'X-BM-MEMO': authCredentials.apiMemo,
    };

    try {
        const requestConfig = {
            method: method,
            url: url,
            headers: headers,
            data: method === 'POST' ? body : undefined, // Solo envía 'data' como body para POST
        };

        const response = await axios(requestConfig);

        if (response.data.code !== 1000) {
            throw new Error(`BitMart API Error (${response.data.code}): ${response.data.message}`);
        }
        return response.data;
    } catch (error) {
        console.error(`Error en authenticatedRequest ${method} ${endpoint}:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

/**
 * Obtiene el precio del ticker de un símbolo.
 * @param {string} symbol - El símbolo del par de trading (ej. 'BTC_USDT').
 */
async function getTicker(symbol) {
    try {
        const response = await axios.get(`${BASE_URL}/spot/v1/ticker?symbol=${symbol}`);
        if (response.data && response.data.code === 1000 && response.data.data.tickers && response.data.data.tickers.length > 0) {
            const ticker = response.data.data.tickers[0];
            return {
                symbol: ticker.symbol,
                last: parseFloat(ticker.last_price),
                // Añadir otros datos del ticker si son necesarios
            };
        } else {
            throw new Error(`No se pudo obtener el ticker para ${symbol}: ${response.data ? JSON.stringify(response.data) : 'Respuesta vacía'}`);
        }
    } catch (error) {
        console.error('Error en getTicker:', error.message);
        throw error;
    }
}

/**
 * Obtiene el balance de todas las monedas.
 * @param {Object} authCredentials - Credenciales de BitMart del usuario.
 * @returns {Array<Object>} Lista de balances con 'currency' y 'available'.
 */
async function getBalance(authCredentials) {
    try {
        const response = await authenticatedRequest(authCredentials, 'GET', '/spot/v1/wallet');
        if (response.data && Array.isArray(response.data.wallet_list)) {
            return response.data.wallet_list.map(w => ({
                currency: w.currency,
                available: parseFloat(w.available_amount),
                total: parseFloat(w.wallet_amount)
            }));
        }
        return [];
    } catch (error) {
        console.error('Error en getBalance:', error.message);
        throw error;
    }
}

/**
 * Coloca una orden de compra o venta.
 * @param {Object} authCredentials - Credenciales de BitMart del usuario.
 * @param {string} symbol - Símbolo de trading (ej. 'BTC_USDT').
 * @param {string} side - 'buy' o 'sell'.
 * @param {string} type - 'market' o 'limit'.
 * @param {number} size - Cantidad de la moneda base (ej. BTC) a comprar/vender.
 * @param {number} [price] - Precio para órdenes límite.
 */
async function placeOrder(authCredentials, symbol, side, type, size, price = undefined) {
    console.log(`[BITMART_SERVICE] Intentando colocar orden: ${side.toUpperCase()} ${size} ${symbol.split('_')[0]} @ ${type} ${price ? price : ''}`);

    const orderBody = {
        symbol: symbol,
        side: side,
        type: type,
        size: size.toFixed(8) // Asegura precisión para el tamaño
    };

    if (type === 'limit') {
        if (!price || price <= 0) {
            throw new Error('El precio es requerido y debe ser positivo para una orden LIMIT.');
        }
        orderBody.price = price.toFixed(2); // Asegura precisión para el precio
    } else if (type === 'market' && side === 'buy') {
        // Para órdenes de mercado de compra, BitMart a veces requiere 'notional' (USDT amount) en lugar de 'size' (BTC amount)
        // O dependiendo de la API, puede ser por size también. Para simplificar, asumiremos size en BTC.
        // Si el purchase es en USDT, la conversión a 'size' debe hacerse ANTES de llamar a esta función.
    }

    try {
        const response = await authenticatedRequest(authCredentials, 'POST', '/spot/v2/submit-order', orderBody);
        if (response.data && response.data.order_id) {
            console.log(`[BITMART_SERVICE] Orden ${response.data.order_id} de ${side.toUpperCase()} tipo ${type.toUpperCase()} colocada con éxito.`);
            // Para las simulaciones, asumimos que se llena de inmediato para MARKET orders
            // y que las LIMIT orders se "llenan" cuando el precio las alcanza.
            return {
                orderId: response.data.order_id,
                price: price || (await getTicker(symbol)).last, // Si es MARKET, usamos el precio actual
                size: parseFloat(size),
                side: side,
                type: type,
                state: 'filled' // En la simulación, asumimos que se llena. En real, sería 'new' o 'pending'
            };
        } else {
            throw new Error(`No se recibió order_id al colocar orden: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        console.error(`Error al colocar orden ${side} ${type}:`, error.message);
        throw error;
    }
}

/**
 * Coloca la primera orden de compra (siempre de mercado para el `purchase` en USDT).
 * Esta función asume que `purchaseAmountUsdt` es el valor en USDT.
 * @param {Object} authCredentials - Credenciales de BitMart del usuario.
 * @param {string} symbol - Símbolo de trading.
 * @param {number} purchaseAmountUsdt - Cantidad de USDT a gastar en la primera compra.
 * @param {number} currentPrice - Precio actual para calcular el size en BTC.
 * @returns {Object} Detalles de la orden.
 * @throws {Error} Si no hay suficiente balance o la orden falla.
 */
async function placeFirstBuyOrder(authCredentials, symbol, purchaseAmountUsdt, currentPrice) {
    console.log(`[BITMART_SERVICE] Colocando primera orden de COMPRA (Market) de ${purchaseAmountUsdt.toFixed(2)} USDT...`);
    const side = 'buy';
    const type = 'market';

    if (purchaseAmountUsdt < MIN_USDT_VALUE_FOR_BITMART) {
        throw new Error(`El monto de compra (${purchaseAmountUsdt.toFixed(2)} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT).`);
    }

    const sizeInBaseCurrency = (purchaseAmountUsdt / currentPrice).toFixed(8); // Calcular tamaño en BTC

    try {
        const orderResult = await placeOrder(authCredentials, symbol, side, type, sizeInBaseCurrency);
        console.log(`[BITMART_SERVICE] Primera orden de compra (Market) completada. ID: ${orderResult.orderId}`);
        return orderResult; // Ya tiene el estado 'filled' de placeOrder para simulación
    } catch (error) {
        console.error('\n❌ Error al colocar la primera orden de compra:', error.message);
        throw error;
    }
}

/**
 * Coloca una orden de compra de cobertura (Limit).
 * Ahora se coloca inmediatamente cuando se entra en BUYING.
 * @param {Object} authCredentials - Credenciales de BitMart del usuario.
 * @param {string} symbol - Símbolo de trading.
 * @param {number} amountToBuyUsdt - Cantidad de USDT a gastar en la cobertura.
 * @param {number} targetPrice - Precio objetivo para la orden de cobertura.
 * @returns {Object} Detalles de la orden colocada (no necesariamente ejecutada).
 * @throws {Error} Si no hay suficiente balance o la orden falla al ser enviada.
 */
async function placeCoverageBuyOrder(authCredentials, symbol, amountToBuyUsdt, targetPrice) {
    console.log(`[BITMART_SERVICE] Colocando orden de compra de COBERTURA (Limit) de ${amountToBuyUsdt.toFixed(2)} USDT a ${targetPrice.toFixed(2)}...`);
    const side = 'buy';
    const type = 'limit';

    const sizeInBaseCurrency = (amountToBuyUsdt / targetPrice).toFixed(8);

    if (amountToBuyUsdt < MIN_USDT_VALUE_FOR_BITMART) {
        throw new Error(`El valor de la orden (${amountToBuyUsdt.toFixed(2)} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT).`);
    }

    try {
        const orderResult = await placeOrder(authCredentials, symbol, side, type, sizeInBaseCurrency, targetPrice);

        if (orderResult && orderResult.orderId) {
            console.log(`[BITMART_SERVICE] Orden de cobertura (Limit) colocada con éxito. ID: ${orderResult.orderId}`);
            // No esperamos que se llene aquí, solo que se coloque.
            orderResult.state = 'new'; // Marcar como 'new' o 'pending' al colocarla
            return orderResult;
        } else {
            throw new Error(`Error al colocar orden de cobertura: No se recibió order_id o la respuesta es inválida.`);
        }
    } catch (error) {
        console.error('\n❌ Error al colocar la orden de cobertura:', error.message);
        throw error;
    }
}

/**
 * Coloca una orden de venta (Limit) para cerrar un ciclo.
 * @param {Object} authCredentials - Credenciales de BitMart del usuario.
 * @param {string} symbol - Símbolo de trading.
 * @param {number} sizeBTC - Cantidad de BTC a vender.
 * @param {number} targetPrice - Precio objetivo para la orden de venta (PV).
 * @returns {Object} Detalles de la orden colocada (no necesariamente ejecutada).
 * @throws {Error} Si no hay activo para vender o la orden falla.
 */
async function placeSellOrder(authCredentials, symbol, sizeBTC, targetPrice) {
    console.log(`[BITMART_SERVICE] Colocando orden de VENTA (Limit) de ${sizeBTC.toFixed(8)} BTC a ${targetPrice.toFixed(2)}...`);
    const side = 'sell';
    const type = 'limit';

    if (sizeBTC <= 0) {
        throw new Error(`No hay activo para vender (AC = 0).`);
    }
    if (targetPrice <= 0) {
        throw new Error(`Precio objetivo de venta inválido para orden límite.`);
    }

    try {
        // Cancelar órdenes pendientes de COMPRA antes de intentar vender es una buena práctica.
        // Esto evita que órdenes de compra se llenen inesperadamente mientras intentamos vender.
        await cancelAllOpenOrders(authCredentials, symbol, 'buy'); // Solo cancela órdenes de compra

        const orderResult = await placeOrder(authCredentials, symbol, side, type, sizeBTC, targetPrice);

        if (orderResult && orderResult.orderId) {
            console.log(`[BITMART_SERVICE] Orden de venta (Limit) colocada con éxito. ID: ${orderResult.orderId}`);
            orderResult.state = 'new'; // Marcar como 'new' o 'pending' al colocarla
            return orderResult;
        } else {
            throw new Error(`Error al colocar la orden de venta: No se recibió order_id o la respuesta es inválida.`);
        }
    } catch (error) {
        console.error('\n❌ Error al colocar la orden de venta:', error.message);
        throw error;
    }
}

/**
 * Obtiene las órdenes abiertas de un usuario para un símbolo específico.
 * @param {Object} authCredentials - Credenciales de BitMart del usuario.
 * @param {string} symbol - Símbolo de trading (ej. 'BTC_USDT').
 * @returns {Object} Un objeto que contiene una lista de órdenes abiertas.
 */
async function getOpenOrders(authCredentials, symbol) {
    try {
        const response = await authenticatedRequest(authCredentials, 'GET', '/spot/v1/open-orders', { symbol });
        if (response.data && Array.isArray(response.data.current_page)) {
            // BitMart puede devolver en 'current_page' o 'order_list' dependiendo de la versión o endpoint
            const openOrders = response.data.current_page.map(order => ({
                order_id: order.order_id,
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                price: parseFloat(order.price),
                size: parseFloat(order.size),
                filled_size: parseFloat(order.filled_size),
                state: order.state // 'new', 'partially_filled'
            }));
            return { orders: openOrders };
        }
        return { orders: [] };
    } catch (error) {
        // Si no hay órdenes abiertas, la API puede devolver un error 500040 (No orders)
        if (error.message && error.message.includes('500040')) {
            console.log('[BITMART_SERVICE] No hay órdenes abiertas.');
            return { orders: [] };
        }
        console.error('Error al obtener órdenes abiertas:', error.message);
        throw error;
    }
}

/**
 * Obtiene el detalle de una orden específica.
 * @param {Object} authCredentials - Credenciales de BitMart del usuario.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} orderId - ID de la orden.
 * @returns {Object} Detalles de la orden.
 */
async function getOrderDetail(authCredentials, symbol, orderId) {
    try {
        const response = await authenticatedRequest(authCredentials, 'GET', '/spot/v1/order_detail', { symbol, order_id: orderId });
        if (response.data && response.data.order) {
            const order = response.data.order;
            return {
                order_id: order.order_id,
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                price: parseFloat(order.price),
                size: parseFloat(order.size),
                filled_size: parseFloat(order.filled_size),
                state: order.state // 'new', 'partially_filled', 'filled', 'canceled', 'partial_filled_canceled'
            };
        }
        throw new Error(`Detalle de orden no encontrado para ID ${orderId}`);
    } catch (error) {
        console.error(`Error al obtener detalle de orden ${orderId}:`, error.message);
        // Si la orden no existe, puede ser un 500040 o similar
        if (error.message && error.message.includes('500040')) {
             console.log(`[BITMART_SERVICE] Orden ${orderId} ya no existe o no se encontró.`);
             return { order_id: orderId, state: 'not_found' }; // Indicar que no se encontró
        }
        throw error;
    }
}

/**
 * Cancela todas las órdenes abiertas para un símbolo.
 * @param {Object} authCredentials - Credenciales de BitMart del usuario.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} [side] - Opcional. 'buy' o 'sell' para cancelar solo órdenes de un lado.
 */
async function cancelAllOpenOrders(authCredentials, symbol, side = null) {
    console.log(`[BITMART_SERVICE] Cancelando todas las órdenes abiertas para ${symbol}${side ? ` (lado: ${side})` : ''}...`);
    try {
        // BitMart tiene un endpoint para cancelar todas.
        // Si quieres filtrar por lado, tendrías que obtenerlas y cancelar una por una.
        if (side) {
            // Opción 1: Obtener y cancelar una por una (más API calls)
            const openOrdersResponse = await getOpenOrders(authCredentials, symbol);
            const ordersToCancel = openOrdersResponse.orders.filter(order => order.side === side);
            if (ordersToCancel.length > 0) {
                console.log(`[BITMART_SERVICE] Encontradas ${ordersToCancel.length} órdenes ${side} para cancelar.`);
                for (const order of ordersToCancel) {
                    try {
                        await cancelOrder(authCredentials, symbol, order.order_id);
                        console.log(`[BITMART_SERVICE] Orden ${order.order_id} cancelada.`);
                    } catch (cancelError) {
                        console.warn(`[BITMART_SERVICE] Falló la cancelación de la orden ${order.order_id}: ${cancelError.message}`);
                    }
                }
            } else {
                console.log(`[BITMART_SERVICE] No se encontraron órdenes abiertas de ${side} para ${symbol}.`);
            }
        } else {
            // Opción 2: Usar el endpoint de cancelar todas si BitMart lo soporta para un símbolo
            // Asumiendo que el endpoint es /spot/v1/cancel_orders
            const response = await authenticatedRequest(authCredentials, 'POST', '/spot/v1/cancel_orders', { symbol: symbol });
            if (response.data && response.data.succeed_count) {
                console.log(`[BITMART_SERVICE] Se cancelaron ${response.data.succeed_count} órdenes.`);
            } else {
                console.log('[BITMART_SERVICE] Ninguna orden fue cancelada o respuesta inesperada.');
            }
        }
        return true;
    } catch (error) {
        if (error.message && error.message.includes('No orders')) { // BitMart a veces devuelve error si no hay órdenes
            console.log('[BITMART_SERVICE] No hay órdenes abiertas para cancelar.');
            return true;
        }
        console.error('Error al cancelar todas las órdenes:', error.message);
        throw error;
    }
}

/**
 * Cancela una orden específica.
 * @param {Object} authCredentials - Credenciales de BitMart del usuario.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} orderId - ID de la orden a cancelar.
 */
async function cancelOrder(authCredentials, symbol, orderId) {
    try {
        const response = await authenticatedRequest(authCredentials, 'POST', '/spot/v1/cancel_order', { symbol, order_id: orderId });
        if (response.data && response.data.succeed) {
            console.log(`[BITMART_SERVICE] Orden ${orderId} cancelada con éxito.`);
            return true;
        } else {
            throw new Error(`Falló la cancelación de la orden ${orderId}: ${JSON.stringify(response.data)}`);
        }
    } catch (error) {
        console.error(`Error al cancelar orden ${orderId}:`, error.message);
        throw error;
    }
}


module.exports = {
    getTicker,
    getBalance,
    placeFirstBuyOrder,
    placeCoverageBuyOrder,
    placeSellOrder,
    getOpenOrders,
    getOrderDetail,
    cancelAllOpenOrders,
    cancelOrder,
    MIN_USDT_VALUE_FOR_BITMART
};