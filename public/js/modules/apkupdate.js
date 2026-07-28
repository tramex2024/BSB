/**
 * apkupdate.js - GitHub Releases Update Checker Module
 */

const GITHUB_USER = 'tramex2024';
const GITHUB_REPO = 'BSB';
const CURRENT_VERSION = '1.0.0'; 

/**
 * Checks if a new version is published in GitHub Releases
 */
export async function checkForAppUpdates() {
    const repoUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`;

    try {
        const response = await fetch(repoUrl);
        if (!response.ok) return;

        const data = await response.json();
        const latestVersion = data.tag_name.replace('v', '').trim();
        const apkAsset = data.assets?.find(asset => asset.name.endsWith('.apk'));

        if (!apkAsset) return;

        // Compares semantic versions (e.g., "1.1.0" vs "1.0.0")
        if (compareVersions(latestVersion, CURRENT_VERSION) > 0) {
            showUpdateModal(latestVersion, apkAsset.browser_download_url);
        }
    } catch (error) {
        console.error("❌ Error checking for app updates:", error);
    }
}

/**
 * Helper function to compare semantic versions
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
 * Displays an update notification modal
 */
function showUpdateModal(version, downloadUrl) {
    if (document.getElementById('update-modal')) return;

    const modalHtml = `
        <div id="update-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center;">
            <div style="background:#1f2937;padding:24px;border-radius:12px;width:90%;max-width:360px;text-align:center;border:1px solid #374151;color:#ffffff;font-family:sans-serif;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
                <h3 style="margin-top:0;color:#10b981;font-size:1.25rem;">New version available!</h3>
                <p style="color:#9ca3af;font-size:0.9rem;margin:12px 0;">Version <b>v${version}</b> has been detected. Update to enjoy the latest improvements and fixes.</p>
                <div style="display:flex;gap:10px;margin-top:20px;">
                    <button id="btn-update-cancel" style="flex:1;padding:10px;background:#374151;border:none;border-radius:6px;color:#fff;cursor:pointer;font-weight:600;">Later</button>
                    <button id="btn-update-now" style="flex:1;padding:10px;background:#10b981;border:none;border-radius:6px;color:#fff;cursor:pointer;font-weight:600;">Update</button>
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