// server/routes/aiRoutes.js

const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/status', authMiddleware, aiController.getAIStatus);
router.post('/toggle', authMiddleware, aiController.toggleAI);
router.get('/history', authMiddleware, aiController.getVirtualHistory);

// Útil para cuando quieras volver a empezar el paper trading de la IA
router.post('/reset', authMiddleware, aiController.resetAIBalance);

module.exports = router;