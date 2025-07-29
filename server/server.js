// server.js (SIMPLIFICADO PARA PRUEBAS SIN USUARIOS)

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const bitmartService = require('./services/bitmartService'); // Importa el servicio de BitMart
const Order = require('./models/Order'); // ¡Necesitamos el modelo de Order para el guardado posterior!

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json()); // Para parsear bodies de JSON

// Conexión a MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1); // Exit process with failure
    }
};

// Conectarse a la DB al iniciar el servidor
connectDB();

// Ruta de prueba para BitMart API y guardado de orden
app.get('/test-bitmart', async (req, res) => {
    try {
        // Credenciales de BitMart obtenidas del archivo .env
        const authCredentials = {
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO || '' // Puede ser vacío
        };

        // PASO 1: Validar claves API
        console.log('\n--- Paso 1: Validando claves API ---');
        const isValid = await bitmartService.validateApiKeys(authCredentials.apiKey, authCredentials.secretKey, authCredentials.apiMemo);
        if (!isValid) {
            return res.status(401).json({ message: 'BitMart API keys are not valid. Check your .env file.' });
        }
        console.log('Claves API validadas con éxito.');

        // PASO 2: Obtener Balance
        console.log('\n--- Paso 2: Obteniendo Balance ---');
        const balance = await bitmartService.getBalance(authCredentials);
        console.log('Balance obtenido:', balance);

        // PASO 3: Obtener Órdenes Abiertas (para ver si hay alguna antes de colocar nuevas)
        console.log('\n--- Paso 3: Obteniendo Órdenes Abiertas ---');
        const openOrders = await bitmartService.getOpenOrders(authCredentials, 'BTC_USDT');
        console.log('Órdenes Abiertas:', openOrders.orders);

        // --- ¡AQUÍ ES DONDE PROBAMOS LA COLOCACIÓN Y GUARDADO DE ÓRDENES! ---
        // Descomenta el siguiente bloque con EXTREMA PRECAUCIÓN.
        // Asegúrate de usar un importe pequeño para pruebas, idealmente en una cuenta de prueba (testnet) si BitMart la ofrece.
        // O mejor aún, descomenta solo la parte de placeOrder y simula la respuesta para pruebas de DB.

        let testOrderResult = null;
        const TEST_SYMBOL = 'BMX_USDT'; // Usa un par con bajo valor para pruebas
        // ATENCIÓN: TU BALANCE ACTUAL ES ~4.44 USDT. EL MÍNIMO DE BITMART ES 5 USDT PARA MUCHOS PARES.
        // PARA QUE LA ORDEN SE COLOQUE, DEBES TENER AL MENOS 5 USDT DISPONIBLES EN TU CUENTA BITMART.
        // Si no tienes 5 USDT, esta orden FALLARÁ por "fondos insuficientes" o "cantidad mínima".
        const TEST_USDT_AMOUNT = 5; // Mínimo para BitMart - ASEGÚRATE DE TENER ESTO EN TU CUENTA

        console.log(`\n--- Paso 4: Intentando colocar una orden de prueba (Market Buy: ${TEST_USDT_AMOUNT} USDT of ${TEST_SYMBOL}) ---`);
        try {
            // Obtener el ticker actual para tener un precio de referencia
            const ticker = await bitmartService.getTicker(TEST_SYMBOL);
            // CORRECCIÓN: Accede a 'last' directamente, ya que la respuesta del ticker no tiene 'spot'.
            const currentPrice = parseFloat(ticker.last);
            console.log(`Current Price of ${TEST_SYMBOL}: ${currentPrice}`); // CORRECCIÓN DEL TYPO .log

            // Colocar una orden de compra MARKET (compra por valor en USDT)
            testOrderResult = await bitmartService.placeOrder(
                authCredentials,
                TEST_SYMBOL,
                'buy',
                'market',
                TEST_USDT_AMOUNT.toString() // Para órdenes de mercado de compra, 'size' es 'notional'
            );
            console.log('Resultado de la orden de prueba:', testOrderResult);

            // PASO 5: OBTENER DETALLE DE LA ORDEN Y GUARDARLA EN DB
            // Ahora, con la orden colocada, vamos a obtener su detalle
            console.log(`\n--- Paso 5: Obteniendo detalle de la orden ${testOrderResult.order_id} y guardando en DB ---`);
            const detailedOrder = await bitmartService.getOrderDetail(authCredentials, TEST_SYMBOL, testOrderResult.order_id);
            console.log('Detalle de la orden obtenida:', detailedOrder);

            // ¡NUEVO! LÓGICA PARA GUARDAR EN LA BASE DE DATOS
            // Esta es la parte CRÍTICA que necesitamos probar.
            // Usaremos el modelo Order que importamos.
            const newOrder = new Order({
                orderId: detailedOrder.order_id,
                symbol: detailedOrder.symbol,
                side: detailedOrder.side,
                type: detailedOrder.type,
                size: parseFloat(detailedOrder.size || detailedOrder.notional_amount || 0), // Ajusta según el tipo de orden
                notional: parseFloat(detailedOrder.notional_amount || 0),
                price: parseFloat(detailedOrder.price || detailedOrder.avg_price || 0),
                filledSize: parseFloat(detailedOrder.filled_size || 0),
                status: detailedOrder.state.charAt(0).toUpperCase() + detailedOrder.state.slice(1).replace('_', ' '), // Formatear estado
                orderTime: new Date(parseInt(detailedOrder.create_time)),
                // userId ya no está aquí
            });
            await newOrder.save();
            console.log(`✅ ¡Orden ${newOrder.orderId} guardada en MongoDB!`);


        } catch (placeOrderError) {
            console.error('❌ Error al intentar colocar orden de prueba:', placeOrderError.message);
            // Si el error es por balance insuficiente o cantidad mínima, BitMart te lo dirá.
            // Si quieres que el endpoint devuelva el error directamente:
            // return res.status(500).json({ message: 'Error placing test order', error: placeOrderError.message });
        }


        res.status(200).json({
            message: 'BitMart API test completed. Check console for details.',
            balance: balance,
            openOrders: openOrders.orders,
            testOrder: testOrderResult // Será null si hubo error al colocar la orden
        });

    } catch (error) {
        console.error('Error in /test-bitmart endpoint:', error.message);
        res.status(500).json({ message: 'Internal server error during BitMart test.', error: error.message });
    }
});


// Ruta principal para verificar que el servidor está funcionando
app.get('/', (req, res) => {
    res.send('Backend is running!');
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});