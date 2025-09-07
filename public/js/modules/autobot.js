// public/js/modules/autobot.js
import { getBalances } from './balance.js';
import { initializeChart } from './chart.js';
import { checkBitMartConnectionAndData } from './network.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './orders.js';
import { loadBotConfigAndState, toggleBotState, resetBot, checkBotStatus } from './bot.js';
import { actualizarCalculosAutobot } from './aucalculations.js';
import { TRADE_SYMBOL_TV, TRADE_SYMBOL_BITMART, currentChart, intervals } from '../main.js';

export function initializeAutobotView() {
    console.log("Inicializando vista del Autobot...");
    
    const auamountUSDTInput = document.getElementById('auamount-usdt');
    const aupurchaseUSDTInput = document.getElementById("aupurchase-usdt");
    const aupurchaseBTCInput = document.getElementById("aupurchase-btc");
    const auincrementInput = document.getElementById("auincrement");
    const audecrementInput = document.getElementById("audecrement");
    const autriggerInput = document.getElementById("autrigger");
    const austartBtn = document.getElementById('austart-btn');
    const auresetBtn = document.getElementById('aureset-btn');
    const auorderTabs = document.querySelectorAll('#autobot-section [id^="tab-"]');
    
    loadBotConfigAndState();
    checkBitMartConnectionAndData();
    
    // Asigna el nuevo gráfico a la variable global importada
    window.currentChart = initializeChart('au-tvchart', TRADE_SYMBOL_TV);

    if (austartBtn) {
        austartBtn.addEventListener('click', () => {
            const config = {
                purchaseUsdtAmount: parseFloat(aupurchaseUSDTInput.value),
                purchaseBtcAmount: parseFloat(aupurchaseBTCInput.value),
                symbol: TRADE_SYMBOL_BITMART,
                interval: 5000
            };
            toggleBotState('autobot', config);
        });
    }

    if (auresetBtn) auresetBtn.addEventListener('click', resetBot);
    
    if (auamountUSDTInput) auamountUSDTInput.addEventListener('input', actualizarCalculosAutobot);
    if (aupurchaseUSDTInput) aupurchaseUSDTInput.addEventListener('input', actualizarCalculosAutobot);
    if (aupurchaseBTCInput) aupurchaseBTCInput.addEventListener('input', actualizarCalculosAutobot);
    if (auincrementInput) auincrementInput.addEventListener('input', actualizarCalculosAutobot);
    if (audecrementInput) audecrementInput.addEventListener('input', actualizarCalculosAutobot);
    if (autriggerInput) autriggerInput.addEventListener('input', actualizarCalculosAutobot);

    auorderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            const auOrderList = document.getElementById('au-order-list');
            fetchOrders(currentTab, auOrderList);
        });
    });

    setOrdersActiveTab('tab-opened');
    const auOrderList = document.getElementById('au-order-list');
    fetchOrders('opened', auOrderList);
    
    checkBotStatus();
    intervals.botStatus = setInterval(checkBotStatus, 5000);
    intervals.autobot = setInterval(getBalances, 10000);
    intervals.orders = setInterval(() => {
        const auOrderList = document.getElementById('au-order-list');
        if (auOrderList) {
            fetchOrders(currentTab, auOrderList);
        }
    }, 15000);
}