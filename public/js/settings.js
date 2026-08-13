document.addEventListener('DOMContentLoaded', async () => {
  try {
    const userData = await API.get('/auth/me');
    const settingsData = await API.get('/settings');
    
    displayUserInfo(userData.data.user);
    displaySettings(settingsData.data.settings);
    await loadBlockedUsers();
    setupEventListeners();
    updatePageLanguage();
  } catch (error) {
    window.location.href = '/login.html';
  }
});

const displayUserInfo = (user) => {
  document.getElementById('anonymousId').textContent = user.anonymous_id;
  document.getElementById('email').value = user.email;
  document.getElementById('memberSince').textContent = new Date(user.created_at).toLocaleDateString();
  document.getElementById('accountStatus').textContent = user.status;
  document.getElementById('accountStatus').className = `badge badge-${user.status}`;
};

const displaySettings = (settings) => {
  document.getElementById('languageSelect').value = settings.language;
  
  const notificationsToggle = document.getElementById('notificationsToggle');
  const soundToggle = document.getElementById('soundToggle');
  
  if (settings.notifications_enabled) {
    notificationsToggle.classList.add('active');
  } else {
    notificationsToggle.classList.remove('active');
  }
  
  if (settings.sound_enabled) {
    soundToggle.classList.add('active');
  } else {
    soundToggle.classList.remove('active');
  }
};

const loadBlockedUsers = async () => {
  try {
    const result = await API.get('/users/blocked');
    const blockedUsers = result.data.blockedUsers;
    const container = document.getElementById('blockedUsersList');
    
    if (blockedUsers.length === 0) {
      container.innerHTML = `<div class="empty-state">${t('no_blocked_users')}</div>`;
      return;
    }
    
    container.innerHTML = blockedUsers.map(user => `
      <div class="blocked-user-item">
        <div class="blocked-user-info">
          <div class="blocked-user-avatar">${user.anonymous_id[0].toUpperCase()}</div>
          <div>
            <div>${user.anonymous_id}</div>
            <small>${t('blocked')}: ${new Date(user.blocked_at).toLocaleDateString()}</small>
          </div>
        </div>
        <button class="unblock-btn" onclick="unblockUser('${user.id}')">
          ${t('unblock')}
        </button>
      </div>
    `).join('');
  } catch (error) {
    console.error('Load blocked users error:', error);
  }
};

const setupEventListeners = () => {
  document.getElementById('languageSelect').addEventListener('change', async (e) => {
    const language = e.target.value;
    setLanguage(language);
    
    try {
      await API.patch('/settings', { language });
      showToast(t('settings_saved'), 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
  
  document.getElementById('notificationsToggle').addEventListener('click', async function() {
    this.classList.toggle('active');
    const enabled = this.classList.contains('active');
    
    try {
      await API.patch('/settings', { notifications_enabled: enabled });
      showToast(t('settings_saved'), 'success');
    } catch (error) {
      showToast(error.message, 'error');
      this.classList.toggle('active');
    }
  });
  
  document.getElementById('soundToggle').addEventListener('click', async function() {
    this.classList.toggle('active');
    const enabled = this.classList.contains('active');
    localStorage.setItem('anony_sound', enabled);
    
    try {
      await API.patch('/settings', { sound_enabled: enabled });
      showToast(t('settings_saved'), 'success');
    } catch (error) {
      showToast(error.message, 'error');
      this.classList.toggle('active');
    }
  });
  
  document.getElementById('saveEmailBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    
    if (!email) {
      showToast(t('required_field'), 'error');
      return;
    }
    
    try {
      await API.patch('/users/me', { email });
      showToast(t('settings_saved'), 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
  
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      await API.post('/auth/logout');
      window.location.href = '/login.html';
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
  
  document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
    if (confirm(t('confirm_delete_account'))) {
      try {
        await API.delete('/users/me');
        window.location.href = '/login.html';
      } catch (error) {
        showToast(error.message, 'error');
      }
    }
  });
  
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = '/chat.html';
  });
};

const unblockUser = async (userId) => {
  try {
    await API.delete(`/users/block/${userId}`);
    showToast(t('user_unblocked'), 'success');
    await loadBlockedUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const showToast = (message, type = 'info') => {
  const toastContainer = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      ${type === 'success' ? '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'}
    </svg>
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};
