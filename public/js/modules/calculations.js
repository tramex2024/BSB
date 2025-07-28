// public/js/modules/calculations.js
// Importar solo las constantes de DOM y funciones que realmente se necesitan para los cálculos
import { purchaseInput, incrementInput, decrementInput, ultimoCoverageValido } from '../main.js';

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
    if (orq === 0) {
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
    if (!purchaseInput || !incrementInput || !decrementInput || !document.getElementById("price") || !document.getElementById("balance") || !document.getElementById("orq") || !document.getElementById("coverage")) {
        console.warn("Faltan elementos DOM para actualizar cálculos.");
        return;
    }

    const purchase = parseFloat(purchaseInput.value) || 0;
    const increment = parseFloat(incrementInput.value) || 100;
    const decrement = parseFloat(decrementInput.value) || 1;
    const priceText = document.getElementById("price").textContent;
    const price = parseFloat(priceText.replace(' USDT', '')) || 0;
    const balanceText = document.getElementById("balance").textContent;
    const balance = balanceText === 'Login to see' ? 0 : parseFloat(balanceText) || 0;

    const orq = calcularORQ(purchase, increment, balance);
    const coverage = calcularCoverage(orq, price, decrement);

    document.getElementById("orq").textContent = orq;
    document.getElementById("coverage").textContent = coverage.toFixed(2);
    // Necesitas una forma de actualizar ultimoCoverageValido en main.js si es un estado global
    // O hacer que este módulo lo exporte y main.js lo actualice.
    // Por ahora, asumiremos que se exporta o se pasa.
    // main.js debería tener: export let ultimoCoverageValido = 0.00;
    // Y aquí: ultimoCoverageValido = coverage; // Si importas el 'let'
    // O puedes hacer que esta función retorne el valor y el llamador lo asigne.
}