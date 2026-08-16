/**
 * apkupdate.js - Módulo de Actualización vía GitHub Releases (Nativo Móvil)
 */
import { App } from '@capacitor/app';

const GITHUB_USER = 'tramex2024'; // <--- Reemplaza con tu usuario o empresa en GitHub
const GITHUB_REPO = 'BSB';    // <--- Reemplaza con el nombre de tu repositorio

/**
 * Comprueba si hay una nueva versión publicada en GitHub Releases
 */
export async function checkForAppUpdates() {
    // [BLINDAJE]: Si no es una app móvil nativa, omite la comprobación
    const isNativeApp = window.Capacitor && window.Capacitor.isNativePlatform();
    if (!isNativeApp) return;

    try {
        // 1. Obtenemos la versión actual instalada en el dispositivo dinámicamente
        const info = await App.getInfo();
        const currentVersion = info.version; // Ej: "1.0.0"

        // 2. Consultamos la última release pública en GitHub
        const repoUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`;
        const response = await fetch(repoUrl);
        if (!response.ok) return;

        const data = await response.json();
        const latestVersion = data.tag_name.replace('v', '').trim();
        
        // Buscamos el archivo .apk adjunto en la release
        const apkAsset = data.assets?.find(asset => asset.name.endsWith('.apk'));
        if (!apkAsset) return;

        // 3. Comparamos versiones semánticas (ej: "1.1.0" vs "1.0.0")
        if (compareVersions(latestVersion, currentVersion) > 0) {
            showUpdateModal(latestVersion, apkAsset.browser_download_url);
        }
    } catch (error) {
        console.error("❌ Error al verificar actualizaciones en GitHub:", error);
    }
}

/**
 * Función auxiliar para comparar versiones semánticas
 */
function compareVersions(v1, v2) {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
        const num1 = p1[i] || 0;
        const num2 = p2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

/**
 * Muestra el modal de actualización
 */
function showUpdateModal(version, downloadUrl) {
    if (document.getElementById('update-modal')) return;

    const modalHtml = `
        <div id="update-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;">
            <div style="background:#1f2937;padding:24px;border-radius:12px;width:100%;max-width:360px;text-align:center;border:1px solid #374151;color:#ffffff;font-family:sans-serif;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
                <h3 style="margin-top:0;color:#10b981;font-size:1.25rem;">¡Nueva versión disponible!</h3>
                <p style="color:#9ca3af;font-size:0.9rem;margin:12px 0;">Se ha detectado la versión <b>v${version}</b>. Actualiza para disfrutar de las últimas mejoras.</p>
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