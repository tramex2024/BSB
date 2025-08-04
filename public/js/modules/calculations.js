// public/js/modules/calculations.js

export function actualizarCalculos() {
    // Obtener los elementos del DOM directamente
    const purchaseInput = document.getElementById("purchase");
    const incrementInput = document.getElementById("increment");
    const decrementInput = document.getElementById("decrement");
    const triggerInput = document.getElementById("trigger");
    const priceElement = document.getElementById('price');
    const orqElement = document.getElementById('orq');
    const coverageElement = document.getElementById('coverage');

    // Salir si faltan elementos
    if (!purchaseInput || !incrementInput || !decrementInput || !triggerInput || !priceElement) {
        return;
    }

    const purchase = parseFloat(purchaseInput.value);
    const increment = parseFloat(incrementInput.value);
    const decrement = parseFloat(decrementInput.value);
    const trigger = parseFloat(triggerInput.value);
    const currentPrice = parseFloat(priceElement.textContent);

    // Realizar cálculos solo si los valores son números válidos
    if (!isNaN(purchase) && !isNaN(increment) && !isNaN(decrement) && !isNaN(trigger) && !isNaN(currentPrice)) {
        const orq = purchase * (increment / 100) / 100;
        const coverage = (currentPrice / (currentPrice * (1 - decrement / 100)) - 1) * 100;

        if (orqElement) orqElement.textContent = orq.toFixed(2);
        if (coverageElement) coverageElement.textContent = coverage.toFixed(2);
    }
}