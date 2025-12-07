// BSB/server/services/bitmartWs.js

// Importaciones de servicios de Firebase y utilidades
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';
import WebSocket from 'ws';

// Configuración de BitMart
const BITMART_WS_URL = 'wss://ws-manager-compress.ap.bitmart.com/api?protocol=1.1';
const BITMART_CHANNEL_NAME = 'spot/user/order'; // Canal de órdenes
const PING_INTERVAL_MS = 30000; // BitMart requiere un ping cada 30 segundos.

// Credenciales y configuración global de Canvas (proporcionadas automáticamente)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let db, auth, userId, ws;
let pingInterval;
let isConnected = false;

// --- Funciones de Utilidad de Firebase ---

/**
 * Inicializa Firebase y autentica al usuario.
 */
async function initializeFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

        userId = auth.currentUser?.uid || 'anonymous';
        console.log(`[FIREBASE] Autenticación completada. User ID: ${userId}`);
    } catch (error) {
        console.error("[FIREBASE] Error al inicializar o autenticar:", error);
    }
}

/**
 * Guarda el estado de la conexión en Firestore.
 * @param {string} status Estado de la conexión ('connected', 'disconnected', 'error').
 * @param {object} details Detalles adicionales para guardar.
 */
async function saveConnectionStatus(status, details = {}) {
    if (!db || !userId) return;
    try {
        const statusRef = doc(db, 'artifacts', appId, 'users', userId, 'bitmart_ws_status', 'connection');
        await setDoc(statusRef, {
            status,
            timestamp: new Date().toISOString(),
            ...details
        }, { merge: true });
    } catch (error) {
        console.error("[FIREBASE] Error al guardar el estado de conexión:", error);
    }
}

// --- Funciones de WebSocket ---

/**
 * Envía el mensaje de suscripción a BitMart.
 */
function subscribeToOrders(wsInstance) {
    if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
        console.error("[BITMART_WS] No se pudo suscribir: Conexión WS no abierta.");
        return;
    }

    // El token de autenticación de BitMart
    const bmAuthToken = process.env.BITMART_WS_TOKEN; 

    if (!bmAuthToken) {
        console.error("[BITMART_WS] ¡ERROR CRÍTICO! La variable de entorno BITMART_WS_TOKEN no está definida.");
        return;
    }

    const message = {
        "op": "subscribe",
        "args": [
            {
                "channel": BITMART_CHANNEL_NAME,
                "symbols": ["*"], // Suscribirse a todas las órdenes
                "client": bmAuthToken
            }
        ]
    };

    wsInstance.send(JSON.stringify(message));
    console.log(`[BITMART_WS] Suscripción enviada al canal: ${BITMART_CHANNEL_NAME}`);
}

/**
 * Lógica de manejo de mensajes del WebSocket.
 * @param {string} rawData El mensaje crudo de BitMart (string).
 */
function handleMessage(rawData) {
    // 🚨 REGISTRO DE DEPURACIÓN CRÍTICO: Registra TODO el mensaje crudo (string)
    console.log(`[BITMART_WS] 🚨🚨 MENSAJE BRUTO RECIBIDO (STRING): ${rawData}`);

    let data;
    try {
        data = JSON.parse(rawData);
    } catch (e) {
        // Ignorar si no es JSON (puede ser un mensaje de error o conexión)
        return; 
    }

    // 1. Manejar el PING de BitMart: Responder con PONG
    if (data.event && data.event === 'ping') {
        const pongMessage = { "event": "pong" };
        ws.send(JSON.stringify(pongMessage));
        // console.log("[BITMART_WS] PONG enviado."); // Desactivado para evitar logs masivos
        return;
    }

    // 2. Manejar la confirmación de Suscripción
    if (data.op === 'subscribe' && data.result) {
        console.log(`[BITMART_WS] ✅ Suscripción exitosa para el canal: ${data.args[0].channel}`);
        return;
    }

    // 3. Manejar el mensaje de Órdenes (si el canal coincide)
    if (data.table && data.table === BITMART_CHANNEL_NAME && data.data) {
        const orders = data.data;

        // 🛑 REGISTRO DE DEPURACIÓN CLAVE: Muestra la estructura de la orden
        // Este log sólo se activa si el canal coincide con el esperado (spot/user/order)
        console.log("======================================================");
        console.log("[BITMART_WS] 🛑 DATA CRUDA RECIBIDA DE BITMART (Canal Ordenes):");
        console.log(JSON.stringify(orders, null, 2));
        console.log("======================================================");

        for (const order of orders) {
            // Aquí es donde obtendrás el valor REAL de 'state'.
            // Por ejemplo, si el estado es 'NEW_ORDER', lo verás aquí:
            const orderState = order.state; 

            // Una vez que tengas el valor real, reemplaza 'NEW_ORDER' con ese valor
            // para que el bot pueda procesar los updates.
            // if (orderState === 'NEW_ORDER' || orderState === 'FILLED' || orderState === 'CANCELED') {
            //     // Aquí iría la lógica de tu bot para procesar el estado de la orden
            //     console.log(`[BOT PROCESSOR] Orden ${order.orderId} actualizada a estado: ${orderState}`);
            // } else {
            //     console.log(`[BITMART_WS] Estado de orden no reconocido o no procesado: ${orderState}`);
            // }
        }
    }
}

/**
 * Inicia la conexión WebSocket y configura los listeners.
 */
function startWebSocket() {
    ws = new WebSocket(BITMART_WS_URL);

    // Evento de Conexión Exitosa
    ws.onopen = () => {
        console.log('[BITMART_WS] Conexión exitosa.');
        isConnected = true;
        saveConnectionStatus('connected');
        
        // 1. Suscribirse a las órdenes abiertas.
        subscribeToOrders(ws);

        // 2. Iniciar el PING periódico requerido por BitMart.
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                const pingMessage = { "op": "ping" };
                ws.send(JSON.stringify(pingMessage));
                // console.log("[BITMART_WS] PING enviado."); // Desactivado para evitar logs masivos
            }
        }, PING_INTERVAL_MS);
    };

    // Evento de Recepción de Mensaje (AQUÍ ESTÁ LA DEPURACIÓN CLAVE)
    ws.onmessage = (event) => {
        handleMessage(event.data);
    };

    // Evento de Error
    ws.onerror = (error) => {
        console.error(`[BITMART_WS] Error en la conexión: ${error.message}`);
        isConnected = false;
        saveConnectionStatus('error', { error: error.message });
    };

    // Evento de Cierre de Conexión
    ws.onclose = () => {
        console.log('[BITMART_WS] Conexión cerrada. Reintentando en 5s...');
        isConnected = false;
        clearInterval(pingInterval);
        saveConnectionStatus('disconnected');
        setTimeout(startWebSocket, 5000); // Reconexión automática
    };
}

// --- Inicio de la Aplicación ---

async function main() {
    await initializeFirebase();
    // Iniciar el servicio de WebSocket solo si la autenticación de Firebase fue exitosa
    if (db && userId) {
        startWebSocket();
        console.log('[BOT LOG]: [L]: RUNNING. Esperando señal de compra.');
    } else {
        console.error('[BOT LOG]: Fallo al iniciar el bot debido a un error de Firebase/Auth.');
    }
}

// Para evitar que el proceso termine, si esto fuera un script de Node.js puro,
// en un entorno como Render, la ejecución del módulo es suficiente.
main().catch(console.error);

// Exportar funciones si fuera necesario, aunque en este entorno no lo es.
// export { startWebSocket, saveConnectionStatus };