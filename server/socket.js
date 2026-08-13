const socketIO = require('socket.io');
const { query } = require('./db');
const { hashToken } = require('./utils/authToken');
const config = require('./config');

const connectedUsers = new Map();
const typingUsers = new Map();

const initializeSocket = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST']
    },
    maxHttpBufferSize: 1e7
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }
      
      const tokenHash = hashToken(token);
      const result = await query(
        `SELECT s.*, u.id, u.anonymous_id, u.role, u.status
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token_hash = $1 
         AND s.expires_at > CURRENT_TIMESTAMP 
         AND s.revoked_at IS NULL`,
        [tokenHash]
      );
      
      if (result.rows.length === 0) {
        return next(new Error('Invalid session'));
      }
      
      const user = result.rows[0];
      
      if (user.status !== 'active') {
        return next(new Error('Account not active'));
      }
      
      socket.userId = user.id;
      socket.anonymousId = user.anonymous_id;
      socket.role = user.role;
      
      next();
    } catch (error) {
      console.error('Socket auth error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    connectedUsers.set(socket.userId, socket.id);
    
    socket.on('join_room', async (roomId) => {
      try {
        const isMember = await query(
          'SELECT id FROM room_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL',
          [roomId, socket.userId]
        );
        
        if (isMember.rows.length === 0) {
          socket.emit('error', { message: 'Not a member of this room' });
          return;
        }
        
        socket.join(roomId);
        socket.currentRoom = roomId;
        
        socket.to(roomId).emit('user_joined', {
          anonymous_id: socket.anonymousId
        });
      } catch (error) {
        console.error('Join room error:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('leave_room', (roomId) => {
      if (roomId) {
        socket.leave(roomId);
        socket.to(roomId).emit('user_left', {
          anonymous_id: socket.anonymousId
        });
        socket.currentRoom = null;
      }
    });

    socket.on('send_message', async (data) => {
      try {
        const { roomId, content, messageType = 'text' } = data;
        
        if (!roomId || !content) {
          socket.emit('error', { message: 'Invalid message data' });
          return;
        }
        
        const isMember = await query(
          `SELECT rm.*, cr.status as room_status
           FROM room_members rm
           JOIN chat_rooms cr ON rm.room_id = cr.id
           WHERE rm.room_id = $1 AND rm.user_id = $2 AND rm.left_at IS NULL`,
          [roomId, socket.userId]
        );
        
        if (isMember.rows.length === 0 || isMember.rows[0].room_status !== 'active') {
          socket.emit('error', { message: 'Cannot send message in this room' });
          return;
        }
        
        const result = await query(
          `INSERT INTO messages (room_id, sender_id, message_type, content)
           VALUES ($1, $2, $3, $4)
           RETURNING id, room_id, sender_id, message_type, content, created_at`,
          [roomId, socket.userId, messageType, content]
        );
        
        const message = result.rows[0];
        message.sender_anonymous_id = socket.anonymousId;
        
        io.to(roomId).emit('new_message', message);
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('typing', (data) => {
      const { roomId, isTyping } = data;
      
      if (!roomId) return;
      
      if (isTyping) {
        typingUsers.set(`${roomId}:${socket.userId}`, Date.now());
      } else {
        typingUsers.delete(`${roomId}:${socket.userId}`);
      }
      
      socket.to(roomId).emit('user_typing', {
        anonymous_id: socket.anonymousId,
        is_typing: isTyping
      });
    });

    socket.on('message_read', async (data) => {
      const { roomId, messageId } = data;
      
      if (roomId) {
        socket.to(roomId).emit('message_read_receipt', {
          message_id: messageId,
          read_by: socket.anonymousId
        });
      }
    });

    socket.on('add_reaction', async (data) => {
      try {
        const { messageId, reaction } = data;
        const validReactions = ['❤️', '😂', '👍', '😮', '😢', '😡'];
        
        if (!messageId || !validReactions.includes(reaction)) {
          return;
        }
        
        await query(
          `INSERT INTO message_reactions (message_id, user_id, reaction)
           VALUES ($1, $2, $3)
           ON CONFLICT (message_id, user_id, reaction) DO NOTHING`,
          [messageId, socket.userId, reaction]
        );
        
        const result = await query(
          `SELECT json_agg(json_build_object('reaction', reaction, 'user_id', user_id, 'anonymous_id', u.anonymous_id))
           FROM message_reactions mr
           JOIN users u ON mr.user_id = u.id
           WHERE mr.message_id = $1`,
          [messageId]
        );
        
        const messageRoom = await query(
          'SELECT room_id FROM messages WHERE id = $1',
          [messageId]
        );
        
        if (messageRoom.rows.length > 0) {
          io.to(messageRoom.rows[0].room_id).emit('reaction_updated', {
            message_id: messageId,
            reactions: result.rows[0].json_agg || []
          });
        }
      } catch (error) {
        console.error('Add reaction error:', error);
      }
    });

    socket.on('delete_message', async (data) => {
      try {
        const { messageId } = data;
        
        const result = await query(
          `UPDATE messages SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND sender_id = $2
           RETURNING id, room_id`,
          [messageId, socket.userId]
        );
        
        if (result.rows.length > 0) {
          io.to(result.rows[0].room_id).emit('message_deleted', {
            message_id: messageId
          });
        }
      } catch (error) {
        console.error('Delete message error:', error);
      }
    });

    socket.on('stop_chat', async (data) => {
      try {
        const { roomId } = data;
        
        await query(
          `UPDATE room_members SET left_at = CURRENT_TIMESTAMP
           WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
          [roomId, socket.userId]
        );
        
        const activeMembers = await query(
          `SELECT COUNT(*) as count FROM room_members
           WHERE room_id = $1 AND left_at IS NULL`,
          [roomId]
        );
        
        if (parseInt(activeMembers.rows[0].count) === 0) {
          await query(
            `UPDATE chat_rooms SET status = 'closed', closed_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [roomId]
          );
        }
        
        socket.leave(roomId);
        socket.to(roomId).emit('chat_ended', {
          anonymous_id: socket.anonymousId
        });
        socket.currentRoom = null;
      } catch (error) {
        console.error('Stop chat error:', error);
      }
    });

    socket.on('disconnect', () => {
      connectedUsers.delete(socket.userId);
      
      if (socket.currentRoom) {
        socket.to(socket.currentRoom).emit('user_offline', {
          anonymous_id: socket.anonymousId
        });
      }
    });
  });

  return io;
};

module.exports = { initializeSocket, connectedUsers };
