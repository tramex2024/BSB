// public/js/modules/aibot.js
import { getBalances } from './balance.js';
import { initializeChart } from './chart.js';
import { checkBitMartConnectionAndData } from './network.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './orders.js';
import { loadBotConfigAndState, toggleBotState, resetBot } from './bot.js';
import { actualizarCalculosAibot } from './aicalculations.js';
import { TRADE_SYMBOL_TV } from '../main.js';

export function initializeAibotView() {
    console.log("Inicializando vista del Aibot...");
    
    const aiamountUSDTInput = document.getElementById('aiamount-usdt');
    const aiamountBTCInput = document.getElementById('aiamount-btc');
    const aipurchaseUSDTInput = document.getElementById("aipurchase-usdt");
    const aipurchaseBTCInput = document.getElementById("aipurchase-btc");
    const aiincrementInput = document.getElementById("aiincrement");
    const aidecrementInput = document.getElementById("aidecrement");
    const aitriggerInput = document.getElementById("aitrigger");
    const aistartBtn = document.getElementById('aistart-btn');
    const airesetBtn = document.getElementById('aireset-btn');
    const aiorderTabs = document.querySelectorAll('#aibot-section [id^="tab-"]');
    
    loadBotConfigAndState();
    actualizarCalculosAibot();
    checkBitMartConnectionAndData();
    
    currentChart = initializeChart('ai-tvchart', TRADE_SYMBOL_TV);

    if (aistartBtn) aistartBtn.addEventListener('click', toggleBotState);
    if (airesetBtn) airesetBtn.addEventListener('click', resetBot);
    
    if (aiamountUSDTInput) aiamountUSDTInput.addEventListener('input', actualizarCalculosAibot);
    if (aiamountBTCInput) aiamountBTCInput.addEventListener('input', actualizarCalculosAibot);
    if (aipurchaseUSDTInput) aipurchaseUSDTInput.addEventListener('input', actualizarCalculosAibot);
    if (aipurchaseBTCInput) aipurchaseBTCInput.addEventListener('input', actualizarCalculosAibot);
    if (aiincrementInput) aiincrementInput.addEventListener('input', actualizarCalculosAibot);
    if (aidecrementInput) aidecrementInput.addEventListener('input', actualizarCalculosAibot);
    if (aitriggerInput) aitriggerInput.addEventListener('input', actualizarCalculosAibot);

    aiorderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            const aiOrderList = document.getElementById('ai-order-list');
            fetchOrders(currentTab, aiOrderList);
        });
    });

    setOrdersActiveTab('tab-opened');
    const aiOrderList = document.getElementById('ai-order-list');
    fetchOrders('opened', aiOrderList);
    intervals.aibot = setInterval(getBalances, 10000);
    intervals.orders = setInterval(() => {
        const aiOrderList = document.getElementById('ai-order-list');
        if (aiOrderList) {
            fetchOrders(currentTab, aiOrderList);
        }
    }, 15000);
}