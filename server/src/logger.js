/**
 * BSB/server/src/logger.js
 * Advanced logging module for the Multi-user Autobot.
 * Supports color prefixes and linking logs to specific users.
 */

const colors = {
    reset: "\x1b[0m",
    info: "\x1b[36m",    // Cyan
    debug: "\x1b[90m",   // Gray
    error: "\x1b[31m",   // Red
    warning: "\x1b[33m", // Yellow
    success: "\x1b[32m", // Green
    header: "\x1b[35m",  // Magenta
};

/**
 * Main function to log messages.
 * @param {string} message - The message to log.
 * @param {string} level - Level: 'info', 'debug', 'error', 'success', 'warning'.
 * @param {string} userId - (Optional) User ID for multi-user tracking.
 */
function log(message, level = 'info', userId = 'SYSTEM') {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const color = colors[level] || colors.info;
    
    // Format the user ID so all logs are aligned
    const userPrefix = userId ? `[${userId.slice(-6)}]` : `[GLOBAL]`;
    const prefix = `[${timestamp}] ${userPrefix} [${level.toUpperCase()}]`;
    
    // Verbosity control for Debug mode
    if (level === 'debug') {
        // Uncomment the following line to silence heavy calculation logs
        // return; 
    }

    console.log(`${color}${prefix} ${message}${colors.reset}`);
}

module.exports = { log };