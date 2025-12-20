// public/js/modules/uiManager.js

// Función para actualizar la interfaz de usuario con el estado del bot
export function updateBotUI(state) {
    const statusColors = {
        RUNNING: 'text-green-400',
        STOPPED: 'text-red-400',
        BUYING: 'text-blue-400',
        SELLING: 'text-yellow-400',
        NO_COVERAGE: 'text-purple-400'
    };

    const lstateElement = document.getElementById('aubot-lstate');
    const sstateElement = document.getElementById('aubot-sstate');
    const startStopButton = document.getElementById('austart-btn');
    const autobotSettings = document.getElementById('autobot-settings');
    
    const elementsToUpdate = {
        // Clave que buscamos en el objeto 'state'
        auprofit: 'total_profit', 
        aulbalance: 'lbalance',
        ausbalance: 'sbalance',
        aultprice: 'ltprice',
        austprice: 'stprice',
        aulcycle: 'lcycle',
        auscycle: 'scycle',
        aulcoverage: 'lcoverage',
        auscoverage: 'scoverage',
        aulnorder: 'lnorder',
        ausnorder: 'snorder',
        aulsprice: 'lsprice', 
        ausbprice: 'sbprice',  
        aulprofit: 'lprofit',
        ausprofit: 'sprofit'
    };

    if (lstateElement) {
        lstateElement.textContent = state.lstate;
        lstateElement.className = '';
        lstateElement.classList.add(statusColors[state.lstate] || 'text-red-400');
    }

    if (sstateElement) {
        sstateElement.textContent = state.sstate;
        sstateElement.className = '';
        sstateElement.classList.add(statusColors[state.sstate] || 'text-red-400');
    }

    for (const [elementId, dataKey] of Object.entries(elementsToUpdate)) {
        const element = document.getElementById(elementId);
        if (element) {
            let value;

            // Usamos el Nullish Coalescing Operator (??) para asegurar que 0 sea un valor válido
            if (state[dataKey] !== undefined && state[dataKey] !== null) {
                // Intentamos convertir a número. Esto funciona si es '1', 1, o '1.23'.
                value = Number(state[dataKey]); 
            } else {
                value = NaN; // Si la clave no existe en el objeto 'state' del socket.
            }
            
            // 🛑 Lógica para limpiar y aplicar color (APLICAR A TODOS LOS ELEMENTOS QUE NECESITEN COLOR)
            // Primero, removemos las clases de color existentes para evitar conflictos
            element.classList.remove('text-green-500', 'text-red-500', 'text-gray-400');

            // Aplicar formato según el tipo de dato
            if (dataKey === 'total_profit' || dataKey === 'lprofit' || dataKey === 'sprofit') {
                // Total Profit (2 decimales, con signo $)
                if (isNaN(value)) {
                    element.textContent = 'N/A';
                } else {
                    // **APLICAR CLASES DE COLOR**
                    if (value > 0) {
                        element.classList.add('text-green-500');
                    } else if (value < 0) {
                        element.classList.add('text-red-500');
                    } else {
                        // Valor neutral (ej: 0)
                        element.classList.add('text-gray-400');
                    }
                    
                    // Formato de texto final
                    element.textContent = `$${value.toFixed(2)}`;
                }
            // ✅ CORREGIDO: Añadimos 'lsprice' y 'sbprice' a la lista de valores con 2 decimales
            } else if (['lcoverage', 'scoverage', 'lbalance', 'sbalance', 'ltprice', 'stprice', 'lsprice', 'sbprice'].includes(dataKey)) {
                // Montos de dinero/balance/precios (2 decimales)
                element.textContent = isNaN(value) ? 'N/A' : value.toFixed(2);
            } else if (dataKey === 'lnorder' || dataKey === 'snorder' || dataKey === 'lcycle' || dataKey === 'scycle') {
                // Contadores (0 decimales)
                element.textContent = isNaN(value) ? 'N/A' : value.toFixed(0);
            } else {
                // Si no es un número esperado, intentar mostrar el valor original
                // Usar String(state[dataKey]) asegura que '0' se muestre y no se caiga en la lógica 'falsy'
                element.textContent = state[dataKey] !== undefined && state[dataKey] !== null ? String(state[dataKey]) : 'N/A';
            }
        }
    }
    
    const isStopped = state.lstate === 'STOPPED' && state.sstate === 'STOPPED';
    
    if (autobotSettings) {
        const inputs = autobotSettings.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.disabled = !isStopped;
        });
    }

    if (startStopButton) {
        startStopButton.textContent = isStopped ? 'START' : 'STOP';
        startStopButton.classList.remove('start-btn', 'stop-btn');
        startStopButton.classList.add(isStopped ? 'start-btn' : 'stop-btn');
    }
}

// Función para mostrar mensajes de estado en la UI
export function displayMessage(message, type) {
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        messageContainer.textContent = message;
        messageContainer.className = `message ${type}`;
        setTimeout(() => {
            messageContainer.textContent = '';
            messageContainer.className = 'message';
        }, 5000); // El mensaje desaparece después de 5 segundos
}
}                                    // public/js/modules/apiService.js

import { displayMessage } from './uiManager.js';
import { TRADE_SYMBOL_BITMART } from '../main.js';

const BACKEND_URL = 'https://bsb-ppex.onrender.com';

/**
 * Recopila todos los datos de los campos de configuración.
 * @returns {object} Un objeto con la configuración del bot.
 */
export function getBotConfiguration() {
    const config = {
        symbol: TRADE_SYMBOL_BITMART,
        long: {
            amountUsdt: parseFloat(document.getElementById('auamount-usdt').value),
            purchaseUsdt: parseFloat(document.getElementById('aupurchase-usdt').value),
            price_var: parseFloat(document.getElementById('audecrement').value),
            size_var: parseFloat(document.getElementById('auincrement').value),
            trigger: parseFloat(document.getElementById('autrigger').value),
        },
        short: {
            amountBtc: parseFloat(document.getElementById('auamount-btc').value),
            sellBtc: parseFloat(document.getElementById('aupurchase-btc').value),
            price_var: parseFloat(document.getElementById('audecrement').value),
            size_var: parseFloat(document.getElementById('auincrement').value),
            trigger: parseFloat(document.getElementById('autrigger').value),
        },
        options: {
            stopAtCycleEnd: document.getElementById('au-stop-at-cycle-end').checked,
        },
    };
    return config;
}

/**
 * Envía la configuración del bot al backend en tiempo real.
 */
export async function sendConfigToBackend() {
    try {
        const config = getBotConfiguration();
        console.log('Enviando configuración al backend:', config);

        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No se encontró el token de autenticación.');
            displayMessage('Authentication token not found. Please log in again.', 'error');
            return;
        }
        
        const response = await fetch(`${BACKEND_URL}/api/autobot/update-config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ config }),
        });

        const result = await response.json();
        
        if (response.ok) {
            console.log('Configuración enviada con éxito. Respuesta del servidor:', result);
            displayMessage('Configuración y estado inicial actualizados con éxito.', 'success');
        } else {
            console.error('Error al actualizar la configuración en el backend:', result.message);
            displayMessage(`Failed to update config on backend: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Failed to send config:', error);
        displayMessage('Failed to connect to backend.', 'error');
    }
}

/**
 * Envía una solicitud para iniciar o detener el bot.
 * @param {boolean} isRunning - Indica si el bot está corriendo.
 * @param {object} config - La configuración del bot para enviar al iniciar.
 * @returns {Promise<void>}
 */
export async function toggleBotState(isRunning, config) {
    const endpoint = isRunning ? '/api/autobot/stop' : '/api/autobot/start';
    let body = {};

    if (!isRunning) {
        body = { config };
    }

    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!data.success) {
            console.error(`Error al ${isRunning ? 'detener' : 'iniciar'} el bot:`, data.message);
            displayMessage(`Error: ${data.message}`, 'error');
        } else {
            displayMessage(`Bot ${isRunning ? 'stopped' : 'started'} successfully.`, 'success');
        }
    } catch (error) {
        console.error(`Error de red al ${isRunning ? 'detener' : 'iniciar'} el bot:`, error);
        displayMessage('Failed to connect to backend.', 'error');
    }
}

// =================================================================
// 💡 NUEVAS FUNCIONES PARA ANALÍTICAS DEL DASHBOARD
// =================================================================

/**
 * Obtiene la serie de datos para la Curva de Crecimiento de Capital (Equity Curve)
 * del backend. Esto incluye la ganancia neta acumulada por ciclo.
 * @returns {Promise<Array>} Un array de objetos con { endTime, netProfit, cumulativeProfit }
 */
export async function fetchEquityCurveData() {
    console.log('Solicitando datos de la Curva de Crecimiento...');
    
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('No se encontró el token de autenticación para analíticas.');
        return [];
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/v1/analytics/equity-curve`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error al obtener la Curva de Crecimiento:', errorData.message);
            displayMessage(`Error al cargar la curva: ${errorData.message}`, 'error');
            return [];
        }

        const data = await response.json();
        console.log('Datos de Curva de Crecimiento recibidos con éxito.');
        return data; // Debería ser un array de ciclos ordenados
    } catch (error) {
        console.error('Error de red al obtener la Curva de Crecimiento:', error);
        displayMessage('Fallo la conexión con el backend para analíticas.', 'error');
        return [];
    }
}

/**
 * Obtiene los Key Performance Indicators (KPIs) de los ciclos cerrados,
 * como el rendimiento promedio por ciclo.
 * @returns {Promise<object>} Un objeto con averageProfitPercentage y totalCycles.
 */
export async function fetchCycleKpis() {
    console.log('Solicitando KPIs de ciclos cerrados...');
    
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('No se encontró el token de autenticación para KPIs.');
        return { averageProfitPercentage: 0, totalCycles: 0 };
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/v1/analytics/kpis`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error al obtener los KPIs del ciclo:', errorData.message);
            return { averageProfitPercentage: 0, totalCycles: 0 };
        }

        const data = await response.json();
        
        // 🎯 CORRECCIÓN: Normalizamos la respuesta para devolver el objeto KPI directamente.
        // Si el backend devuelve un array [kpiObject], lo desempacamos.
        // Si devuelve kpiObject directamente, lo usamos.
        const kpiObject = Array.isArray(data) ? data[0] : data;
        
        return kpiObject || { averageProfitPercentage: 0, totalCycles: 0 }; 
        
    } catch (error) {
        console.error('Error de red al obtener KPIs del ciclo:', error);
        return { averageProfitPercentage: 0, totalCycles: 0 };
    }
}