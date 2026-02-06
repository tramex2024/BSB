const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/request-token', authController.requestToken);
router.post('/verify-token', authController.verifyToken);

module.exports = router;