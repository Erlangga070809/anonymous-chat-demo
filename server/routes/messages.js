const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authenticate } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimit');

router.get('/:roomId', authenticate, messageController.getMessages);
router.post('/', authenticate, messageController.sendMessage);
router.delete('/:id', authenticate, messageController.deleteMessage);
router.post('/reaction', authenticate, messageController.addReaction);
router.post('/upload/image', authenticate, uploadLimiter, messageController.upload.single('image'), messageController.uploadFile);
router.post('/upload/voice', authenticate, uploadLimiter, messageController.upload.single('voice'), messageController.uploadFile);

module.exports = router;
