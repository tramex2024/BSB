// Lógica para inicializar el estado del bot en la base de datos
const INITIAL_BOT_NAME = 'bsb';

/**
 * Busca el documento de estado del bot por su nombre clave. 
 * Si no existe (es la primera ejecución), lo crea con valores predeterminados.
 *
 * @param {mongoose.Model} BotStateModel - El modelo Mongoose de Autobot.
 * @returns {Promise<object>} El documento de estado del bot (existente o recién creado).
 */
async function loadBotState(BotStateModel) {
    console.log(`[STATE_MANAGER] Buscando documento de estado: ${INITIAL_BOT_NAME}`);
    
    let botState = await BotStateModel.findOne({ name: INITIAL_BOT_NAME });

    if (!botState) {
        console.warn(`[STATE_MANAGER] Documento no encontrado. Creando estado inicial con estructura completa...`);
        
        // 2. CREAR ESTADO INICIAL COMPLETO (Sincronizado con Autobot.js)
        const initialState = {
            name: INITIAL_BOT_NAME, 
            
            // --- CAMPOS DIRECTOS DEL ESQUEMA PRINCIPAL ---
            total_profit: 0.00,
            lstate: 'STOPPED', // Cambiado a 'STOPPED' para coincidir con tu modelo
            sstate: 'STOPPED', // Cambiado a 'STOPPED' para coincidir con tu modelo
            lbalance: 0.00,
            sbalance: 0.00,
            ltprice: 0.00, 
            stprice: 0.00, 
            lcycle: 0, // Cambiado a 0 para coincidir con tu modelo
            scycle: 0, // Cambiado a 0 para coincidir con tu modelo
            lcoverage: 0.00, 
            scoverage: 0.00, 
            lnorder: 0, 
            snorder: 0, 
            lastUpdateTime: new Date(),

            // --- strategyDataSchema (lStateData y sStateData) ---
            // Incluye ppc, ac, ai, pm, pc, y los campos de contingencia.
            lStateData: {
                ppc: 0, 
                ac: 0, 
                ai: 0,
                orderCountInCycle: 0,
                lastOrder: null,
                pm: 0, 
                pc: 0, 
                requiredCoverageAmount: 0, 
                nextCoveragePrice: 0 
            },
            sStateData: {
                ppc: 0, 
                ac: 0, 
                ai: 0,
                orderCountInCycle: 0,
                lastOrder: null,
                pm: 0, 
                pc: 0, 
                requiredCoverageAmount: 0, 
                nextCoveragePrice: 0 
            },

            // --- configSchema ---
            config: {
                symbol: "BTC_USDT",
                long: {
                    enabled: false,
                    amountUsdt: 5.00,
                    purchaseUsdt: 6.00,
                    price_var: 0.1,
                    size_var: 5.0,
                    profit_percent: 1.5
                },
                short: {
                    enabled: false,
                    amountBtc: 0.00005,
                    sellBtc: 0.00005,
                    price_var: 0.1,
                    size_var: 5.0,
                    profit_percent: 1.5
                },
                stopAtCycle: false
            }
        };

        // 3. GUARDAR Y RETORNAR EL DOCUMENTO RECIÉN CREADO
        botState = await BotStateModel.create(initialState);
        console.log(`[STATE_MANAGER] Estado inicial creado exitosamente.`);
    } else {
        console.log(`[STATE_MANAGER] Documento encontrado. Bot listo.`);
    }

    return botState;
}

module.exports = {
    loadBotState
};