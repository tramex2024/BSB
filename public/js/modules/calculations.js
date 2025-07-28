// public/js/modules/calculations.js
// Importa solo los elementos DOM que son inputs o displays, y las funciones que necesitas para CALCULAR
import { purchaseInput, incrementInput, decrementInput, triggerInput } from '../main.js';

export function calcularORQ(purchase, increment, balance) {
    let totalSpent = 0;
    let orderCount = 0;
    let currentOrderSize = purchase;

    if (balance >= currentOrderSize) {
        totalSpent += currentOrderSize;
        orderCount = 1;
    } else {
        return 0;
    }

    for (let n = 1; ; n++) {
        const effectiveIncrementPercentage = increment * n;
        const incrementAmount = currentOrderSize * (effectiveIncrementPercentage / 100);
        const nextOrderSize = currentOrderSize + incrementAmount;

        if (totalSpent + nextOrderSize <= balance) {
            totalSpent += nextOrderSize;
            currentOrderSize = nextOrderSize;
            orderCount++;
        } else {
            break;
        }
    }
    return orderCount;
}

export function calcularCoverage(orq, initialPrice, decrement) {
    if (orq === 0 || initialPrice === 0) { // Añadimos chequeo para initialPrice === 0
        return 0;
    }

    let currentPrice = initialPrice;
    let coveragePrice = initialPrice;

    for (let n = 1; n < orq; n++) {
        const effectiveDecrementPercentage = decrement * n;
        const decrementAmount = currentPrice * (effectiveDecrementPercentage / 100);
        const nextPrice = currentPrice - decrementAmount;

        currentPrice = nextPrice;
        coveragePrice = nextPrice;
    }

    return coveragePrice;
}

export function actualizarCalculos() {
    // Asegúrate de que los elementos existan antes de intentar acceder a .value o .textContent
    const purchase = parseFloat(purchaseInput?.value) || 0;
    const increment = parseFloat(incrementInput?.value) || 100;
    const decrement = parseFloat(decrementInput?.value) || 1;
    const priceText = document.getElementById("price")?.textContent;
    const price = parseFloat(priceText?.replace(' USDT', '')) || 0;
    const balanceText = document.getElementById("balance")?.textContent;
    const balance = balanceText === 'Login to see' ? 0 : parseFloat(balanceText) || 0;

    const orq = calcularORQ(purchase, increment, balance);
    const coverage = calcularCoverage(orq, price, decrement);

    // Actualiza directamente los elementos del DOM en este módulo
    if (document.getElementById("orq")) {
        document.getElementById("orq").textContent = orq;
    }
    if (document.getElementById("coverage")) {
        document.getElementById("coverage").textContent = coverage.toFixed(2);
    }

    // Esta función ya no necesita retornar 'coverage' si su único propósito es actualizar el DOM
    // Si otros módulos necesitan el valor de 'coverage', entonces sí deberías retornarlo.
    // Por ahora, asumiremos que no lo necesitan directamente fuera de este display.
}