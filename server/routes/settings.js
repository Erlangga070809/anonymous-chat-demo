const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, settingsController.getSettings);
router.patch('/', authenticate, settingsController.updateSettings);

module.exports = router;
