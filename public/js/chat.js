let socket = null;
let currentRoom = null;
let currentUser = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingTimer = null;
let recordingSeconds = 0;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const userData = await API.get('/auth/me');
    currentUser = userData.data.user;
    
    await initSocket();
    await checkMatchingStatus();
    setupEventListeners();
    updatePageLanguage();
  } catch (error) {
    window.location.href = '/login.html';
  }
});

const initSocket = async () => {
  const token = getCookie('anony_session');
  
  socket = io('/', {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
  });
  
  socket.on('connect', () => {
    console.log('Socket connected');
  });
  
  socket.on('disconnect', () => {
    showToast('Connection lost. Reconnecting...', 'warning');
  });
  
  socket.on('connect_error', (error) => {
    showToast('Connection error. Retrying...', 'error');
  });
  
  socket.on('new_message', (message) => {
    if (currentRoom && message.room_id === currentRoom) {
      appendMessage(message);
      playNotificationSound();
    }
  });
  
  socket.on('user_typing', (data) => {
    if (data.is_typing) {
      showTypingIndicator(data.anonymous_id);
    } else {
      hideTypingIndicator();
    }
  });
  
  socket.on('message_deleted', (data) => {
    const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
    if (messageElement) {
      messageElement.remove();
    }
  });
  
  socket.on('reaction_updated', (data) => {
    updateReactions(data.message_id, data.reactions);
  });
  
  socket.on('chat_ended', (data) => {
    showToast('Chat ended by ' + data.anonymous_id, 'info');
    setTimeout(() => {
      showSearchScreen();
    }, 1000);
  });
  
  socket.on('user_joined', (data) => {
    updatePartnerStatus(data.anonymous_id, 'online');
  });
  
  socket.on('user_offline', (data) => {
    updatePartnerStatus(data.anonymous_id, 'offline');
  });
};

const checkMatchingStatus = async () => {
  try {
    const result = await API.get('/matching/status');
    
    if (result.data.status === 'matched') {
      currentRoom = result.data.room.id;
      await joinRoom(currentRoom);
      await loadMessages(currentRoom);
      showChatScreen();
    } else if (result.data.status === 'searching') {
      showSearchingScreen();
    } else {
      showSearchScreen();
    }
  } catch (error) {
    console.error('Check matching status error:', error);
    showSearchScreen();
  }
};

const setupEventListeners = () => {
  const findSomeoneBtn = document.getElementById('findSomeoneBtn');
  const stopSearchBtn = document.getElementById('stopSearchBtn');
  const stopChatBtn = document.getElementById('stopChatBtn');
  const findNewBtn = document.getElementById('findNewBtn');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const emojiBtn = document.getElementById('emojiBtn');
  const imageBtn = document.getElementById('imageBtn');
  const voiceBtn = document.getElementById('voiceBtn');
  const reportBtn = document.getElementById('reportBtn');
  const blockBtn = document.getElementById('blockBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  
  if (findSomeoneBtn) {
    findSomeoneBtn.addEventListener('click', startSearching);
  }
  
  if (stopSearchBtn) {
    stopSearchBtn.addEventListener('click', stopSearching);
  }
  
  if (stopChatBtn) {
    stopChatBtn.addEventListener('click', () => {
      if (confirm(t('confirm_stop_chat'))) {
        stopCurrentChat();
      }
    });
  }
  
  if (findNewBtn) {
    findNewBtn.addEventListener('click', () => {
      stopCurrentChat();
      setTimeout(() => startSearching(), 500);
    });
  }
  
  if (messageInput && sendBtn) {
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextMessage();
      }
    });
    
    messageInput.addEventListener('input', () => {
      socket.emit('typing', { roomId: currentRoom, isTyping: true });
      clearTimeout(messageInput.typingTimeout);
      messageInput.typingTimeout = setTimeout(() => {
        socket.emit('typing', { roomId: currentRoom, isTyping: false });
      }, 1000);
    });
    
    sendBtn.addEventListener('click', sendTextMessage);
  }
  
  if (emojiBtn) {
    emojiBtn.addEventListener('click', toggleEmojiPicker);
  }
  
  if (imageBtn) {
    imageBtn.addEventListener('click', () => {
      document.getElementById('imageInput').click();
    });
  }
  
  if (voiceBtn) {
    voiceBtn.addEventListener('click', toggleVoiceRecording);
  }
  
  if (reportBtn) {
    reportBtn.addEventListener('click', showReportModal);
  }
  
  if (blockBtn) {
    blockBtn.addEventListener('click', () => {
      if (confirm(t('confirm_block_user'))) {
        blockCurrentUser();
      }
    });
  }
  
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      window.location.href = '/settings.html';
    });
  }
  
  document.addEventListener('click', (e) => {
    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiPicker && !emojiPicker.contains(e.target) && e.target !== emojiBtn) {
      emojiPicker.classList.remove('show');
    }
  });
  
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.getAttribute('data-emoji');
      if (messageInput) {
        messageInput.value += emoji;
        messageInput.focus();
      }
      document.getElementById('emojiPicker').classList.remove('show');
    });
  });
  
  document.getElementById('imageInput').addEventListener('change', handleImageUpload);
};

const startSearching = async () => {
  try {
    showSearchingScreen();
    const result = await API.post('/matching/start');
    
    if (result.data.status === 'matched') {
      currentRoom = result.data.room.id;
      await joinRoom(currentRoom);
      await loadMessages(currentRoom);
      showChatScreen();
      showToast(t('match_found'), 'success');
      playNotificationSound();
    }
  } catch (error) {
    showSearchScreen();
    showToast(error.message, 'error');
  }
};

const stopSearching = async () => {
  try {
    await API.post('/matching/stop');
    showSearchScreen();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const joinRoom = (roomId) => {
  return new Promise((resolve) => {
    socket.emit('join_room', roomId);
    resolve();
  });
};

const loadMessages = async (roomId) => {
  try {
    const result = await API.get(`/messages/${roomId}`);
    const messages = result.data.messages;
    const messagesContainer = document.getElementById('messagesContainer');
    messagesContainer.innerHTML = '';
    
    messages.forEach(message => {
      appendMessage(message);
    });
    
    scrollToBottom();
  } catch (error) {
    console.error('Load messages error:', error);
  }
};

const appendMessage = (message) => {
  const messagesContainer = document.getElementById('messagesContainer');
  const messageWrapper = document.createElement('div');
  messageWrapper.className = `message-wrapper ${message.sender_id === currentUser.id ? 'own' : 'other'}`;
  messageWrapper.setAttribute('data-message-id', message.id);
  
  let content = '';
  
  if (message.is_deleted) {
    content = '<em>Message deleted</em>';
  } else if (message.message_type === 'text') {
    content = escapeHtml(message.content);
  } else if (message.message_type === 'image') {
    content = `<img src="/uploads/${message.file_path}" class="message-image" onclick="openImagePreview(this.src)">`;
  } else if (message.message_type === 'voice') {
    content = `
      <div class="message-voice">
        <button class="voice-play-btn" onclick="toggleVoicePlay(this, '/uploads/${message.file_path}')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>
        <div class="voice-waveform">
          ${Array(20).fill('<div class="voice-bar"></div>').join('')}
        </div>
      </div>
    `;
  }
  
  messageWrapper.innerHTML = `
    <div class="message-bubble">
      <div class="message-content">${content}</div>
    </div>
    ${message.reactions && message.reactions.length > 0 ? `
      <div class="message-reactions">
        ${message.reactions.map(r => `
          <span class="reaction-badge">${r.reaction}</span>
        `).join('')}
      </div>
    ` : ''}
    <div class="message-timestamp">
      ${formatTime(message.created_at)}
      ${message.sender_id === currentUser.id ? `
        <button class="icon-btn" onclick="deleteMessage('${message.id}')" style="width: 24px; height: 24px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      ` : ''}
    </div>
  `;
  
  messagesContainer.appendChild(messageWrapper);
  scrollToBottom();
};

const sendTextMessage = async () => {
  const messageInput = document.getElementById('messageInput');
  const content = messageInput.value.trim();
  
  if (!content || !currentRoom) return;
  
  messageInput.value = '';
  socket.emit('typing', { roomId: currentRoom, isTyping: false });
  
  try {
    socket.emit('send_message', {
      roomId: currentRoom,
      content,
      messageType: 'text'
    });
  } catch (error) {
    showToast(t('message_failed'), 'error');
  }
};

const handleImageUpload = async (e) => {
  const file = e.target.files[0];
  if (!file || !currentRoom) return;
  
  if (file.size > 5 * 1024 * 1024) {
    showToast(t('file_too_large'), 'error');
    return;
  }
  
  const formData = new FormData();
  formData.append('image', file);
  formData.append('roomId', currentRoom);
  
  try {
    const result = await API.upload('/messages/upload/image', formData);
    socket.emit('send_message', {
      roomId: currentRoom,
      content: result.data.message.file_path,
      messageType: 'image'
    });
  } catch (error) {
    showToast(t('upload_failed'), 'error');
  }
  
  e.target.value = '';
};

const toggleVoiceRecording = async () => {
  const voiceRecorder = document.getElementById('voiceRecorder');
  
  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        uploadVoiceMessage(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      isRecording = true;
      recordingSeconds = 0;
      voiceRecorder.classList.add('show');
      document.getElementById('voiceBtn').classList.add('recording');
      
      recordingTimer = setInterval(() => {
        recordingSeconds++;
        document.getElementById('recordingTime').textContent = formatDuration(recordingSeconds);
      }, 1000);
    } catch (error) {
      showToast('Microphone access denied', 'error');
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    clearInterval(recordingTimer);
    voiceRecorder.classList.remove('show');
    document.getElementById('voiceBtn').classList.remove('recording');
  }
};

const uploadVoiceMessage = async (audioBlob) => {
  if (!currentRoom) return;
  
  const formData = new FormData();
  formData.append('voice', audioBlob, 'voice.webm');
  formData.append('roomId', currentRoom);
  
  try {
    const result = await API.upload('/messages/upload/voice', formData);
    socket.emit('send_message', {
      roomId: currentRoom,
      content: result.data.message.file_path,
      messageType: 'voice'
    });
  } catch (error) {
    showToast(t('upload_failed'), 'error');
  }
};

const deleteMessage = async (messageId) => {
  if (!confirm(t('delete_message') + '?')) return;
  
  try {
    await API.delete(`/messages/${messageId}`);
    socket.emit('delete_message', { messageId });
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const stopCurrentChat = async () => {
  if (!currentRoom) return;
  
  try {
    await API.post('/matching/stop-chat', { roomId: currentRoom });
    socket.emit('stop_chat', { roomId: currentRoom });
    currentRoom = null;
  } catch (error) {
    console.error('Stop chat error:', error);
  }
};

const blockCurrentUser = async () => {
  try {
    const result = await API.get(`/messages/${currentRoom}`);
    const messages = result.data.messages;
    const otherMessages = messages.filter(m => m.sender_id !== currentUser.id);
    
    if (otherMessages.length > 0) {
      const otherUserId = otherMessages[0].sender_id;
      await API.post('/users/block', { userId: otherUserId });
      showToast(t('user_blocked'), 'success');
      await stopCurrentChat();
      showSearchScreen();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const showSearchScreen = () => {
  document.getElementById('searchScreen').style.display = 'flex';
  document.getElementById('searchingScreen').style.display = 'none';
  document.getElementById('chatScreen').style.display = 'none';
};

const showSearchingScreen = () => {
  document.getElementById('searchScreen').style.display = 'none';
  document.getElementById('searchingScreen').style.display = 'flex';
  document.getElementById('chatScreen').style.display = 'none';
};

const showChatScreen = () => {
  document.getElementById('searchScreen').style.display = 'none';
  document.getElementById('searchingScreen').style.display = 'none';
  document.getElementById('chatScreen').style.display = 'flex';
};

const showTypingIndicator = (anonymousId) => {
  const typingIndicator = document.getElementById('typingIndicator');
  if (typingIndicator) {
    typingIndicator.querySelector('.typing-text').textContent = `${anonymousId} ${t('typing')}`;
    typingIndicator.style.display = 'flex';
  }
  
  const statusDot = document.querySelector('.status-dot');
  if (statusDot) {
    statusDot.className = 'status-dot typing';
  }
};

const hideTypingIndicator = () => {
  const typingIndicator = document.getElementById('typingIndicator');
  if (typingIndicator) {
    typingIndicator.style.display = 'none';
  }
  
  const statusDot = document.querySelector('.status-dot');
  if (statusDot) {
    statusDot.className = 'status-dot online';
  }
};

const updatePartnerStatus = (anonymousId, status) => {
  const statusText = document.getElementById('partnerStatus');
  const statusDot = document.querySelector('.status-dot');
  
  if (statusText && statusDot) {
    statusText.textContent = status === 'online' ? t('online') : t('offline');
    statusDot.className = `status-dot ${status}`;
  }
};

const toggleEmojiPicker = () => {
  const emojiPicker = document.getElementById('emojiPicker');
  emojiPicker.classList.toggle('show');
};

const showToast = (message, type = 'info') => {
  const toastContainer = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icons = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  
  toast.innerHTML = `
    ${icons[type] || icons.info}
    <span>${escapeHtml(message)}</span>
  `;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
};

const playNotificationSound = () => {
  const soundEnabled = localStorage.getItem('anony_sound') !== 'false';
  if (!soundEnabled) return;
  
  const audio = new Audio('/assets/sounds/notification.mp3');
  audio.play().catch(() => {});
};

const scrollToBottom = () => {
  const messagesContainer = document.getElementById('messagesContainer');
  if (messagesContainer) {
    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
  }
};

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
};
