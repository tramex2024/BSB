// public/js/modules/dashboard.js

import { getBalances } from './balance.js';
import { checkBitMartConnectionAndData } from './network.js';
import { intervals } from '../main.js';

export function initializeDashboardView() {
    console.log("Inicializando vista del Dashboard...");
    getBalances();
    checkBitMartConnectionAndData();
    intervals.dashboard = setInterval(getBalances, 10000);
}