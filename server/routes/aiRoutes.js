const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/status', authMiddleware, aiController.getAIStatus);
router.post('/toggle', authMiddleware, aiController.toggleAI);
router.get('/history', authMiddleware, aiController.getVirtualHistory);

module.exports = router;