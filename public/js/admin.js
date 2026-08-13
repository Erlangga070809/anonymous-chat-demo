let currentSection = 'dashboard';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const userData = await API.get('/auth/me');
    
    if (userData.data.user.role !== 'admin') {
      window.location.href = '/login.html';
      return;
    }
    
    setupNavigation();
    await loadDashboard();
    updatePageLanguage();
  } catch (error) {
    window.location.href = '/login.html';
  }
});

const setupNavigation = () => {
  document.querySelectorAll('.admin-nav-item').forEach(item => {
    item.addEventListener('click', async () => {
      document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      currentSection = item.getAttribute('data-section');
      await loadSection(currentSection);
    });
  });
  
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await API.post('/auth/logout');
    window.location.href = '/login.html';
  });
  
  document.getElementById('viewSiteBtn').addEventListener('click', () => {
    window.location.href = '/chat.html';
  });
};

const loadSection = async (section) => {
  const contentArea = document.getElementById('contentArea');
  
  switch (section) {
    case 'dashboard':
      await loadDashboard();
      break;
    case 'users':
      await loadUsers();
      break;
    case 'reports':
      await loadReports();
      break;
    case 'rooms':
      await loadRooms();
      break;
    case 'queue':
      await loadQueue();
      break;
    case 'logs':
      await loadLogs();
      break;
  }
};

const loadDashboard = async () => {
  try {
    const result = await API.get('/admin/stats');
    const stats = result.data.stats;
    
    document.getElementById('contentArea').innerHTML = `
      <div class="admin-header">
        <h2 class="admin-title">Dashboard</h2>
        <button class="btn btn-secondary" onclick="refreshDashboard()">
          Refresh
        </button>
      </div>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${stats.total_users}</div>
          <div class="stat-label">Total Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.active_users}</div>
          <div class="stat-label">Active Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.banned_users}</div>
          <div class="stat-label">Banned Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.suspended_users}</div>
          <div class="stat-label">Suspended Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.active_rooms}</div>
          <div class="stat-label">Active Rooms</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.queued_users}</div>
          <div class="stat-label">Queued Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.pending_reports}</div>
          <div class="stat-label">Pending Reports</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.messages_24h}</div>
          <div class="stat-label">Messages (24h)</div>
        </div>
      </div>
    `;
  } catch (error) {
    showError(error.message);
  }
};

const loadUsers = async () => {
  try {
    const result = await API.get('/admin/users');
    const users = result.data.users;
    
    document.getElementById('contentArea').innerHTML = `
      <div class="admin-header">
        <h2 class="admin-title">Users</h2>
        <input type="text" class="search-input" placeholder="Search users..." onkeyup="searchUsers(this.value)">
      </div>
      
      <div class="admin-table">
        <table>
          <thead>
            <tr>
              <th>Anonymous ID</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="usersTableBody">
            ${users.map(user => `
              <tr>
                <td>${user.anonymous_id}</td>
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td><span class="badge badge-${user.status}">${user.status}</span></td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                  ${user.status === 'banned' ? `
                    <button class="action-btn unban" onclick="unbanUser('${user.id}')">Unban</button>
                  ` : `
                    <button class="action-btn ban" onclick="showBanModal('${user.id}')">Ban</button>
                    <button class="action-btn suspend" onclick="suspendUser('${user.id}')">Suspend</button>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    showError(error.message);
  }
};

const loadReports = async () => {
  try {
    const result = await API.get('/admin/reports');
    const reports = result.data.reports;
    
    document.getElementById('contentArea').innerHTML = `
      <div class="admin-header">
        <h2 class="admin-title">Reports</h2>
      </div>
      
      <div class="admin-table">
        <table>
          <thead>
            <tr>
              <th>Reporter</th>
              <th>Reported</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${reports.length === 0 ? `
              <tr><td colspan="6">${t('no_reports')}</td></tr>
            ` : reports.map(report => `
              <tr>
                <td>${report.reporter_anonymous_id}</td>
                <td>${report.reported_anonymous_id}</td>
                <td>${report.reason}</td>
                <td><span class="badge badge-${report.status}">${report.status}</span></td>
                <td>${new Date(report.created_at).toLocaleDateString()}</td>
                <td>
                  ${report.status === 'pending' ? `
                    <button class="action-btn" onclick="updateReportStatus('${report.id}', 'reviewing')">Review</button>
                    <button class="action-btn unban" onclick="updateReportStatus('${report.id}', 'resolved')">Resolve</button>
                    <button class="action-btn ban" onclick="updateReportStatus('${report.id}', 'rejected')">Reject</button>
                  ` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    showError(error.message);
  }
};

const loadRooms = async () => {
  try {
    const result = await API.get('/admin/rooms');
    const rooms = result.data.rooms;
    
    document.getElementById('contentArea').innerHTML = `
      <div class="admin-header">
        <h2 class="admin-title">Active Rooms</h2>
      </div>
      
      <div class="admin-table">
        <table>
          <thead>
            <tr>
              <th>Room Code</th>
              <th>Members</th>
              <th>Created</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rooms.length === 0 ? `
              <tr><td colspan="4">No active rooms</td></tr>
            ` : rooms.map(room => `
              <tr>
                <td>${room.room_code}</td>
                <td>${room.members ? room.members.map(m => m.anonymous_id).join(', ') : ''}</td>
                <td>${new Date(room.created_at).toLocaleString()}</td>
                <td><span class="badge badge-active">${room.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    showError(error.message);
  }
};

const loadQueue = async () => {
  try {
    const result = await API.get('/admin/queue');
    const queue = result.data.queue;
    
    document.getElementById('contentArea').innerHTML = `
      <div class="admin-header">
        <h2 class="admin-title">Matchmaking Queue</h2>
      </div>
      
      <div class="admin-table">
        <table>
          <thead>
            <tr>
              <th>Anonymous ID</th>
              <th>Email</th>
              <th>Joined</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            ${queue.length === 0 ? `
              <tr><td colspan="4">Queue is empty</td></tr>
            ` : queue.map(item => `
              <tr>
                <td>${item.anonymous_id}</td>
                <td>${item.email}</td>
                <td>${new Date(item.created_at).toLocaleString()}</td>
                <td>${new Date(item.expires_at).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    showError(error.message);
  }
};

const loadLogs = async () => {
  try {
    const result = await API.get('/admin/audit-logs');
    const logs = result.data.logs;
    
    document.getElementById('contentArea').innerHTML = `
      <div class="admin-header">
        <h2 class="admin-title">Audit Logs</h2>
      </div>
      
      <div class="admin-table">
        <table>
          <thead>
            <tr>
              <th>Admin</th>
              <th>Action</th>
              <th>Target Type</th>
              <th>Target ID</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${logs.length === 0 ? `
              <tr><td colspan="5">No logs</td></tr>
            ` : logs.map(log => `
              <tr>
                <td>${log.admin_anonymous_id || 'System'}</td>
                <td>${log.action}</td>
                <td>${log.target_type}</td>
                <td>${log.target_id || '-'}</td>
                <td>${new Date(log.created_at).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    showError(error.message);
  }
};

const searchUsers = async (query) => {
  if (!query || query.length < 2) {
    await loadUsers();
    return;
  }
  
  try {
    const result = await API.get(`/admin/users?search=${encodeURIComponent(query)}`);
    const users = result.data.users;
    const tbody = document.getElementById('usersTableBody');
    
    tbody.innerHTML = users.map(user => `
      <tr>
        <td>${user.anonymous_id}</td>
        <td>${user.email}</td>
        <td>${user.role}</td>
        <td><span class="badge badge-${user.status}">${user.status}</span></td>
        <td>${new Date(user.created_at).toLocaleDateString()}</td>
        <td>
          ${user.status === 'banned' ? `
            <button class="action-btn unban" onclick="unbanUser('${user.id}')">Unban</button>
          ` : `
            <button class="action-btn ban" onclick="showBanModal('${user.id}')">Ban</button>
            <button class="action-btn suspend" onclick="suspendUser('${user.id}')">Suspend</button>
          `}
        </td>
      </tr>
    `).join('');
  } catch (error) {
    showError(error.message);
  }
};

const showBanModal = (userId) => {
  const reason = prompt('Enter ban reason:');
  if (!reason) return;
  
  const duration = confirm('Permanent ban? Click OK for permanent, Cancel for temporary (7 days)');
  
  banUser(userId, reason, duration ? 'permanent' : 'temporary');
};

const banUser = async (userId, reason, duration) => {
  try {
    await API.post(`/admin/users/${userId}/ban`, { reason, duration });
    showToast('User banned successfully', 'success');
    await loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const unbanUser = async (userId) => {
  try {
    await API.post(`/admin/users/${userId}/unban`);
    showToast('User unbanned successfully', 'success');
    await loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const suspendUser = async (userId) => {
  try {
    await API.post(`/admin/users/${userId}/suspend`);
    showToast('User suspended successfully', 'success');
    await loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const updateReportStatus = async (reportId, status) => {
  try {
    await API.patch(`/admin/reports/${reportId}`, { status });
    showToast('Report updated successfully', 'success');
    await loadReports();
  } catch (error) {
    showToast(error.message, 'error');
  }
};

const refreshDashboard = () => {
  loadDashboard();
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

const showError = (message) => {
  document.getElementById('contentArea').innerHTML = `
    <div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <p>${message}</p>
    </div>
  `;
};
