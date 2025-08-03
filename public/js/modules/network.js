// public/js/modules/network.js

import { displayLogMessage } from './auth.js';
import { fetchFromBackend } from './api.js'; // Importación corregida
import { TRADE_SYMBOL } from '../main.js';

export async function cargarPrecioEnVivo() {
    // Si la vista Autobot no está cargada, no hacemos nada.
    const priceElement = document.getElementById('price');
    if (!priceElement) {
        return;
    }

    try {
        const data = await fetchFromBackend(`/ticker/${TRADE_SYMBOL}`);
        
        if (data && data.last) {
            priceElement.textContent = parseFloat(data.last).toFixed(2);
        }
    } catch (error) {
        // El error ya se maneja en fetchFromBackend, así que aquí solo lo logueamos
        console.error("Error fetching live price:", error);
    }
}