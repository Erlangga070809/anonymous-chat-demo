const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, reportController.createReport);
router.get('/mine', authenticate, reportController.getMyReports);

module.exports = router;
