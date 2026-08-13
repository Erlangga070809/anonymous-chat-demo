const express = require('express');
const router = express.Router();
const matchingController = require('../controllers/matchingController');
const { authenticate } = require('../middleware/auth');

router.post('/start', authenticate, matchingController.startMatching);
router.post('/stop', authenticate, matchingController.stopMatching);
router.get('/status', authenticate, matchingController.getMatchingStatus);
router.post('/stop-chat', authenticate, matchingController.stopChat);

module.exports = router;
