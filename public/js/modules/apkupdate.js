/**
 * apkupdate.js - Módulo de Actualización de APK para Capacitor
 */
import { App } from 'https://esm.sh/@capacitor/app';
import { Capacitor } from 'https://esm.sh/@capacitor/core';
// Importamos la URL de tu backend que ya tienes en main.js
import { BACKEND_URL } from '../main.js'; 

export async function checkForAppUpdates() {
    // [LOG DE PRUEBA]: Vamos a ver en la consola del celular si esto se ejecuta
    console.log("🔍 [APK-UPDATE] Iniciando comprobación de actualización...");

    if (!Capacitor.isNativePlatform()) {
        console.log("🔍 [APK-UPDATE] No es plataforma nativa, omitiendo.");
        return;
    }

    try {
        const info = await App.getInfo();
        const localVersion = info.version;
        const token = localStorage.getItem('token'); // Asegúrate que sea 'token' o 'jwtToken' según tu app
        
        if (!token) {
            console.log("🔍 [APK-UPDATE] No hay token, saltando.");
            return;
        }

        // AQUÍ ESTÁ EL CAMBIO: Usamos BACKEND_URL + la ruta
        const response = await fetch(`${BACKEND_URL}/check-app-version`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ appVersion: localVersion })
        });

        if (!response.ok) {
            console.error("❌ Error en respuesta del servidor:", response.status);
            return;
        }

        const data = await response.json();
        console.log("🔍 [APK-UPDATE] Respuesta recibida:", data);

        if (data.success && data.updateRequired) {
            showUpdateModal(data.latestVersion, data.apkDownloadUrl);
        }
    } catch (error) {
        console.error("❌ Error al verificar actualizaciones:", error);
    }
}

/**
 * Muestra el modal de actualización con diseño amigable
 */
function showUpdateModal(version, downloadUrl) {
    if (document.getElementById('update-modal')) return;

    const modalHtml = `
        <div id="update-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;">
            <div style="background:#1f2937;padding:24px;border-radius:12px;width:100%;max-width:360px;text-align:center;border:1px solid #374151;color:#ffffff;font-family:sans-serif;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
                <h3 style="margin-top:0;color:#10b981;font-size:1.25rem;">¡Nueva versión disponible!</h3>
                <p style="color:#9ca3af;font-size:0.9rem;margin:12px 0;">Se ha detectado la versión <b>v${version}</b>. Actualiza para disfrutar de las últimas mejoras y correcciones.</p>
                <div style="display:flex;gap:10px;margin-top:20px;">
                    <button id="btn-update-cancel" style="flex:1;padding:10px;background:#374151;border:none;border-radius:6px;color:#fff;cursor:pointer;font-weight:600;">Más tarde</button>
                    <button id="btn-update-now" style="flex:1;padding:10px;background:#10b981;border:none;border-radius:6px;color:#fff;cursor:pointer;font-weight:600;">Actualizar</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('btn-update-cancel').onclick = () => {
        document.getElementById('update-modal').remove();
    };

    document.getElementById('btn-update-now').onclick = () => {
        window.open(downloadUrl, '_system');
        document.getElementById('update-modal').remove();
    };
}