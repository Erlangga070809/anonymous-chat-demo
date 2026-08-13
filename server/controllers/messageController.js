const { query } = require('../db');
const { validateMessageContent } = require('../utils/validator');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const config = require('../config');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../', config.uploadDir);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'image') {
    if (config.allowedImageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image type'), false);
    }
  } else if (file.fieldname === 'voice') {
    if (config.allowedVoiceTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid voice type'), false);
    }
  } else {
    cb(new Error('Invalid file field'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSize
  }
});

const getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const isMember = await query(
      'SELECT id FROM room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, req.user.id]
    );
    
    if (isMember.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Not a member of this room'
      });
    }
    
    const result = await query(
      `SELECT m.id, m.message_type, m.content, m.is_deleted, m.created_at,
              u.anonymous_id as sender_anonymous_id,
              ma.file_path, ma.file_type, ma.mime_type,
              (
                SELECT json_agg(json_build_object('reaction', mr.reaction, 'user_id', mr.user_id))
                FROM message_reactions mr
                WHERE mr.message_id = m.id
              ) as reactions
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       LEFT JOIN message_attachments ma ON m.id = ma.message_id
       WHERE m.room_id = $1
       ORDER BY m.created_at ASC
       LIMIT 100`,
      [roomId]
    );
    
    res.json({
      success: true,
      data: {
        messages: result.rows
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages'
    });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { roomId, content, messageType = 'text' } = req.body;
    
    if (!roomId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Room ID and content are required'
      });
    }
    
    if (messageType === 'text' && !validateMessageContent(content)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message content'
      });
    }
    
    const isMember = await query(
      `SELECT rm.*, cr.status as room_status
       FROM room_members rm
       JOIN chat_rooms cr ON rm.room_id = cr.id
       WHERE rm.room_id = $1 AND rm.user_id = $2 AND rm.left_at IS NULL`,
      [roomId, req.user.id]
    );
    
    if (isMember.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Not an active member of this room'
      });
    }
    
    if (isMember.rows[0].room_status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Room is not active'
      });
    }
    
    const result = await query(
      `INSERT INTO messages (room_id, sender_id, message_type, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, room_id, sender_id, message_type, content, created_at`,
      [roomId, req.user.id, messageType, content]
    );
    
    const message = result.rows[0];
    
    const senderResult = await query(
      'SELECT anonymous_id FROM users WHERE id = $1',
      [req.user.id]
    );
    
    message.sender_anonymous_id = senderResult.rows[0].anonymous_id;
    
    res.status(201).json({
      success: true,
      data: {
        message
      }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `UPDATE messages SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND sender_id = $2
       RETURNING id`,
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete this message'
      });
    }
    
    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message'
    });
  }
};

const addReaction = async (req, res) => {
  try {
    const { messageId, reaction } = req.body;
    const validReactions = ['❤️', '😂', '👍', '😮', '😢', '😡'];
    
    if (!messageId || !reaction || !validReactions.includes(reaction)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reaction'
      });
    }
    
    await query(
      `INSERT INTO message_reactions (message_id, user_id, reaction)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, reaction) DO NOTHING`,
      [messageId, req.user.id, reaction]
    );
    
    const result = await query(
      `SELECT json_agg(json_build_object('reaction', reaction, 'user_id', user_id)) as reactions
       FROM message_reactions
       WHERE message_id = $1`,
      [messageId]
    );
    
    res.json({
      success: true,
      data: {
        reactions: result.rows[0].reactions || []
      }
    });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add reaction'
    });
  }
};

const uploadFile = async (req, res) => {
  try {
    const { roomId } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'File is required'
      });
    }
    
    const messageType = file.fieldname === 'image' ? 'image' : 'voice';
    
    const result = await query(
      `INSERT INTO messages (room_id, sender_id, message_type, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [roomId, req.user.id, messageType, file.filename]
    );
    
    const messageId = result.rows[0].id;
    
    await query(
      `INSERT INTO message_attachments (message_id, file_path, file_type, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [messageId, file.filename, file.fieldname, file.size, file.mimetype]
    );
    
    res.status(201).json({
      success: true,
      data: {
        message: {
          id: messageId,
          message_type: messageType,
          content: file.filename,
          file_path: file.filename,
          file_type: file.fieldname,
          mime_type: file.mimetype
        }
      }
    });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file'
    });
  }
};

module.exports = {
  upload,
  getMessages,
  sendMessage,
  deleteMessage,
  addReaction,
  uploadFile
};
