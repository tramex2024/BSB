// public/js/modules/testbot.js
import { getBalances } from './balance.js';
import { initializeChart } from './chart.js';
import { checkBitMartConnectionAndData } from './network.js';
import { fetchOrders, setActiveTab as setOrdersActiveTab } from './orders.js';
import { loadBotConfigAndState, toggleBotState, resetBot } from './bot.js';
import { actualizarCalculosTestbot } from './tecalculations.js';
import { TRADE_SYMBOL_TV } from '../main.js';

export function initializeTestbotView() {
    console.log("Inicializando vista del Testbot...");
    
    const teamountUSDTInput = document.getElementById('teamount-usdt');
    const teamountBTCInput = document.getElementById('teamount-btc');
    const tepurchaseUSDTInput = document.getElementById("tepurchase-usdt");
    const tepurchaseBTCInput = document.getElementById("tepurchase-btc");
    const teincrementInput = document.getElementById("teincrement");
    const tedecrementInput = document.getElementById("tedecrement");
    const tetriggerInput = document.getElementById("tetrigger");
    const testartBtn = document.getElementById('testart-btn');
    const teresetBtn = document.getElementById('tereset-btn');
    const teorderTabs = document.querySelectorAll('#testbot-section [id^="tab-"]');
    
    loadBotConfigAndState();
    actualizarCalculosTestbot();
    checkBitMartConnectionAndData();
    
    currentChart = initializeChart('te-tvchart', TRADE_SYMBOL_TV);

    if (testartBtn) testartBtn.addEventListener('click', toggleBotState);
    if (teresetBtn) teresetBtn.addEventListener('click', resetBot);
    
    if (teamountUSDTInput) teamountUSDTInput.addEventListener('input', actualizarCalculosTestbot);
    if (teamountBTCInput) teamountBTCInput.addEventListener('input', actualizarCalculosTestbot);
    if (tepurchaseUSDTInput) tepurchaseUSDTInput.addEventListener('input', actualizarCalculosTestbot);
    if (tepurchaseBTCInput) tepurchaseBTCInput.addEventListener('input', actualizarCalculosTestbot);
    if (teincrementInput) teincrementInput.addEventListener('input', actualizarCalculosTestbot);
    if (tedecrementInput) tedecrementInput.addEventListener('input', actualizarCalculosTestbot);
    if (tetriggerInput) tetriggerInput.addEventListener('input', actualizarCalculosTestbot);

    teorderTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.id.replace('tab-', '');
            setOrdersActiveTab(tab.id);
            const teOrderList = document.getElementById('te-order-list');
            fetchOrders(currentTab, teOrderList);
        });
    });

    setOrdersActiveTab('tab-opened');
    const teOrderList = document.getElementById('te-order-list');
    fetchOrders('opened', teOrderList);
    intervals.testbot = setInterval(getBalances, 10000);
    intervals.orders = setInterval(() => {
        const teOrderList = document.getElementById('te-order-list');
        if (teOrderList) {
            fetchOrders(currentTab, teOrderList);
        }
    }, 15000);
}