/**
 * BSB/server/middleware/bitmartAuthMiddleware.js
 */

const { decrypt } = require('../utils/encryption'); 
const User = require('../models/User'); 

const bitmartAuthMiddleware = async (req, res, next) => {
    try {
        const userId = req.user.id; 
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // 1. STRICT VALIDATION: Do keys exist?
        if (!user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
            console.warn(`[AUTH-MW] ⚠️ Access denied: ${user.email} does not have API Keys configured.`);
            
            // Instead of passing with null, we cut the request if it's an action that REQUIRES keys
            return res.status(403).json({ 
                success: false, 
                message: "No linked API Keys detected. Please configure them in your profile." 
            });
        }

        // 2. DECRYPTION AND LOADING
        try {
            req.bitmartCreds = {
                apiKey: decrypt(user.bitmartApiKey),
                secretKey: decrypt(user.bitmartSecretKeyEncrypted),
                apiMemo: user.bitmartApiMemo ? decrypt(user.bitmartApiMemo) : ''
            };
            
            // Success log (optional, useful in development)
            // console.log(`[AUTH-MW] 🛡️ Credentials loaded for: ${user.email}`);
            next();

        } catch (decryptError) {
            console.error(`[AUTH-MW] ❌ Critical decryption error for ${user.email}:`, decryptError.message);
            return res.status(500).json({ 
                success: false, 
                message: "Error processing your security credentials. Please contact support." 
            });
        }
        
    } catch (error) {
        console.error('❌ General error in bitmartAuthMiddleware:', error.message);
        res.status(500).json({ success: false, message: "Internal BitMart authentication error." });
    }
};

module.exports = bitmartAuthMiddleware;