class HaBackupManager extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = {};
    this._backups = [];
    this._selectedBackup = null;
    this._activeTab = 'backups';
    this._healthData = {
      lastBackupDate: null,
      totalSize: 0,
      backupCount: 0,
      weeklyData: [0, 0, 0, 0],
    };
    this._loading = false;
    this._error = null;
  }

  static getConfigElement() {
    return document.createElement('ha-backup-manager-editor');
  }

  static getStubConfig() {
    return {
      title: 'Backup Manager',
      warn_after_days: 3,
      max_backups: 10,
    };
  }

  setConfig(config) {
    this._config = config;
    this._updateUI();
  }

  set hass(hass) {
    this._hass = hass;
    this._fetchBackups();
  }

  async _fetchBackups() {
    if (!this._hass) return;

    this._loading = true;
    this._error = null;

    try {
      const result = await this._hass.callWS({ type: 'backup/info' });
      if (result && result.backups) {
        this._backups = result.backups.sort((a, b) =>
          new Date(b.date || 0) - new Date(a.date || 0)
        );
        this._calculateHealthData();
      }
    } catch (e) {
      console.warn('Backup WS call failed, using demo data:', e);
      this._backups = this._getDemoBackups();
      this._calculateHealthData();
    }

    this._loading = false;
    this._updateUI();
  }

  _getDemoBackups() {
    const now = new Date();
    return [
      {
        slug: 'demo_backup_001',
        name: 'Daily Backup',
        date: new Date(now.getTime() - 86400000).toISOString(),
        type: 'full',
        size: 1024 * 1024 * 250,
        is_protected: true,
        compressed: true,
        includes: {
          homeassistant: true,
          database: true,
          addons: ['mosquitto', 'zwave-js-ui'],
          folders: ['automations', 'scripts', 'scenes'],
        },
      },
      {
        slug: 'demo_backup_002',
        name: 'Weekly Backup',
        date: new Date(now.getTime() - 7 * 86400000).toISOString(),
        type: 'full',
        size: 1024 * 1024 * 280,
        is_protected: false,
        compressed: true,
        includes: {
          homeassistant: true,
          database: true,
          addons: ['mosquitto', 'zwave-js-ui', 'esphome'],
          folders: ['automations', 'scripts', 'scenes'],
        },
      },
      {
        slug: 'demo_backup_003',
        name: 'Partial Backup',
        date: new Date(now.getTime() - 14 * 86400000).toISOString(),
        type: 'partial',
        size: 1024 * 1024 * 120,
        is_protected: false,
        compressed: true,
        includes: {
          homeassistant: true,
          database: false,
          addons: [],
          folders: ['automations', 'scripts'],
        },
      },
    ];
  }

  _calculateHealthData() {
    if (this._backups.length === 0) {
      this._healthData.lastBackupDate = null;
      this._healthData.totalSize = 0;
      this._healthData.backupCount = 0;
      this._healthData.weeklyData = [0, 0, 0, 0];
      return;
    }

    this._healthData.lastBackupDate = new Date(this._backups[0].date);
    this._healthData.totalSize = this._backups.reduce((sum, b) => sum + (b.size || 0), 0);
    this._healthData.backupCount = this._backups.length;

    const now = new Date();
    this._healthData.weeklyData = [0, 0, 0, 0];

    this._backups.forEach(backup => {
      const backupDate = new Date(backup.date);
      const weekDiff = Math.floor((now - backupDate) / (7 * 86400000));
      if (weekDiff < 4) {
        this._healthData.weeklyData[3 - weekDiff]++;
      }
    });
  }

  _getTimeSinceBackup() {
    if (!this._healthData.lastBackupDate) return null;
    const hours = Math.floor((Date.now() - this._healthData.lastBackupDate) / 3600000);
    const days = Math.floor(hours / 24);
    return { days, hours };
  }

  _formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  _formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async _createBackup(isFullBackup) {
    try {
      const password = isFullBackup ? '' : '';
      await this._hass.callService('backup', 'create', {
        backup_type: isFullBackup ? 'full' : 'partial',
      });
      this._fetchBackups();
    } catch (e) {
      this._error = `Failed to create backup: ${e.message}`;
      this._updateUI();
    }
  }

  _selectBackup(backup) {
    this._selectedBackup = this._selectedBackup?.slug === backup.slug ? null : backup;
    this._updateUI();
  }

  _renderBackupsTab() {
    return `
      <div class="tab-content">
        <div class="backup-controls">
          <button class="create-btn full-backup" @click="${() => this._createBackup(true)}">
            <span class="icon">⊕</span> Create Full Backup
          </button>
          <button class="create-btn partial-backup" @click="${() => this._createBackup(false)}">
            <span class="icon">⊕</span> Create Partial Backup
          </button>
        </div>

        ${this._error ? `<div class="error-banner">${this._error}</div>` : ''}

        <div class="backups-list">
          ${this._backups.length === 0
            ? '<div class="empty-state">No backups available</div>'
            : this._backups.map((backup) => `
              <div class="backup-item ${this._selectedBackup?.slug === backup.slug ? 'selected' : ''}"
                   @click="${() => this._selectBackup(backup)}">
                <div class="backup-header">
                  <div class="backup-info">
                    <h3>${backup.name || 'Backup'}</h3>
                    <span class="backup-type ${backup.type}">${backup.type}</span>
                    ${backup.is_protected ? '<span class="badge protected">🔒 Protected</span>' : ''}
                  </div>
                  <div class="backup-meta">
                    <span class="date">${this._formatDate(backup.date)}</span>
                    <span class="size">${this._formatBytes(backup.size || 0)}</span>
                  </div>
                </div>
                ${this._selectedBackup?.slug === backup.slug ? `
                  <div class="backup-details">
                    <h4>Backup Contents:</h4>
                    <div class="contents-grid">
                      ${backup.includes?.homeassistant ? '<span class="content-item">📋 Home Assistant Config</span>' : ''}
                      ${backup.includes?.database ? '<span class="content-item">💾 Database</span>' : ''}
                      ${backup.includes?.addons?.length > 0 ? `<span class="content-item">🧩 ${backup.includes.addons.length} Add-ons</span>` : ''}
                      ${backup.includes?.folders?.length > 0 ? `<span class="content-item">📁 ${backup.includes.folders.length} Folders</span>` : ''}
                    </div>
                    ${backup.includes?.addons?.length > 0 ? `
                      <div class="addon-list">
                        <strong>Add-ons:</strong>
                        ${backup.includes.addons.map(a => `<span>${a}</span>`).join('')}
                      </div>
                    ` : ''}
                  </div>
                ` : ''}
              </div>
            `).join('')}
        </div>
      </div>
    `;
  }

  _renderHealthTab() {
    const timeSince = this._getTimeSinceBackup();
    const warnDays = this._config.warn_after_days || 3;
    const daysStatus = !timeSince ? 'error' : timeSince.days > warnDays ? 'warning' : 'good';

    return `
      <div class="tab-content">
        <div class="health-grid">
          <div class="health-card">
            <h3>Last Backup</h3>
            <div class="health-value ${daysStatus}">
              ${!timeSince ? 'Never' : `${timeSince.days}d ${timeSince.hours % 24}h ago`}
            </div>
            <p class="health-label">Status: ${daysStatus === 'good' ? '✓ Healthy' : daysStatus === 'warning' ? '⚠ Warning' : '✗ No backups'}</p>
          </div>

          <div class="health-card">
            <h3>Total Backups</h3>
            <div class="health-value">${this._healthData.backupCount}</div>
            <p class="health-label">Max allowed: ${this._config.max_backups || 10}</p>
          </div>

          <div class="health-card">
            <h3>Storage Used</h3>
            <div class="health-value">${this._formatBytes(this._healthData.totalSize)}</div>
            <p class="health-label">Compressed backups</p>
          </div>

          <div class="health-card">
            <h3>Backup Frequency</h3>
            <canvas id="frequency-chart" width="300" height="150"></canvas>
            <p class="health-label">Last 4 weeks</p>
          </div>
        </div>

        <div class="schedule-section">
          <h3>Automatic Backups</h3>
          <p>Check Home Assistant Settings > System > Backups for automatic backup schedule.</p>
          <div class="schedule-info">
            <span>Current setting: Home Assistant Default Schedule</span>
          </div>
        </div>
      </div>
    `;
  }

  _renderSettingsTab() {
    return `
      <div class="tab-content">
        <div class="settings-section">
          <h3>Backup Configuration</h3>
          <div class="setting-item">
            <label>Warning After (days)</label>
            <p>Alert when backup is older than: ${this._config.warn_after_days || 3} days</p>
          </div>
          <div class="setting-item">
            <label>Maximum Backups</label>
            <p>Keep up to: ${this._config.max_backups || 10} backups</p>
          </div>
        </div>

        <div class="settings-section">
          <h3>Storage Management</h3>
          <p>Use Home Assistant Settings > System > Backups to manage backup retention and automatic cleanup.</p>
        </div>

        <div class="settings-section">
          <h3>Security</h3>
          <p>Backups are stored in: ${this._hass?.config?.config_dir || '/config/backups'}</p>
          <p>Ensure this location is properly backed up to external storage.</p>
        </div>
      </div>
    `;
  }

  _updateUI() {
    const tabContent = {
      backups: () => this._renderBackupsTab(),
      health: () => this._renderHealthTab(),
      settings: () => this._renderSettingsTab(),
    };

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --primary-color: var(--primary-color, #2196F3);
          --error-color: var(--error-color, #F44336);
          --warning-color: var(--warning-color, #FF9800);
          --success-color: var(--success-color, #4CAF50);
          --background-color: var(--card-background-color, #fff);
          --text-color: var(--primary-text-color, #212121);
          --secondary-text: var(--secondary-text-color, #727272);
          --border-color: var(--divider-color, #e0e0e0);
          --dark-mode: ${this._hass?.themes?.darkMode ? 'true' : 'false'};
        }

        .card-container {
          background: var(--background-color);
          border-radius: 8px;
          padding: 16px;
          color: var(--text-color);
        }

        .card-title {
          font-size: 20px;
          font-weight: 500;
          margin: 0 0 16px 0;
          padding: 0;
        }

        .tabs {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid var(--border-color);
          margin: 0 -16px 16px -16px;
          padding: 0 16px;
        }

        .tab-btn {
          background: none;
          border: none;
          padding: 12px 16px;
          cursor: pointer;
          color: var(--secondary-text);
          font-size: 14px;
          font-weight: 500;
          border-bottom: 3px solid transparent;
          transition: all 0.2s ease;
        }

        .tab-btn.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
        }

        .tab-btn:hover {
          color: var(--text-color);
        }

        .tab-content {
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .backup-controls {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .create-btn {
          padding: 12px 16px;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
        }

        .full-backup {
          background: var(--success-color);
          color: white;
        }

        .full-backup:hover {
          opacity: 0.9;
          box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
        }

        .partial-backup {
          background: var(--primary-color);
          color: white;
        }

        .partial-backup:hover {
          opacity: 0.9;
          box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
        }

        .create-btn .icon {
          font-size: 16px;
        }

        .error-banner {
          background: var(--error-color);
          color: white;
          padding: 12px 16px;
          border-radius: 6px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .backups-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .backup-item {
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .backup-item:hover {
          border-color: var(--primary-color);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .backup-item.selected {
          border-color: var(--primary-color);
          background: rgba(33, 150, 243, 0.05);
        }

        .backup-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .backup-info h3 {
          margin: 0 0 8px 0;
          font-size: 16px;
        }

        .backup-type {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }

        .backup-type.full {
          background: rgba(76, 175, 80, 0.2);
          color: var(--success-color);
        }

        .backup-type.partial {
          background: rgba(255, 152, 0, 0.2);
          color: var(--warning-color);
        }

        .badge {
          display: inline-block;
          padding: 2px 8px;
          margin-left: 8px;
          border-radius: 4px;
          font-size: 12px;
          background: rgba(33, 150, 243, 0.2);
          color: var(--primary-color);
        }

        .backup-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          min-width: 150px;
        }

        .date, .size {
          font-size: 13px;
          color: var(--secondary-text);
        }

        .backup-details {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--border-color);
        }

        .backup-details h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: var(--secondary-text);
        }

        .contents-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 8px;
          margin-bottom: 12px;
        }

        .content-item {
          padding: 8px 12px;
          background: rgba(33, 150, 243, 0.1);
          border-radius: 4px;
          font-size: 13px;
        }

        .addon-list {
          margin-top: 8px;
          padding: 8px;
          background: rgba(0, 0, 0, 0.02);
          border-radius: 4px;
          font-size: 12px;
        }

        .addon-list span {
          display: inline-block;
          margin-right: 8px;
          margin-top: 4px;
          padding: 2px 6px;
          background: var(--border-color);
          border-radius: 3px;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--secondary-text);
          font-size: 14px;
        }

        .health-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .health-card {
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 16px;
        }

        .health-card h3 {
          margin: 0 0 12px 0;
          font-size: 14px;
          color: var(--secondary-text);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .health-value {
          font-size: 32px;
          font-weight: 600;
          margin: 8px 0;
        }

        .health-value.good {
          color: var(--success-color);
        }

        .health-value.warning {
          color: var(--warning-color);
        }

        .health-value.error {
          color: var(--error-color);
        }

        .health-label {
          margin: 8px 0 0 0;
          font-size: 13px;
          color: var(--secondary-text);
        }

        .schedule-section, .settings-section {
          margin-bottom: 24px;
          padding: 16px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
        }

        .schedule-section h3, .settings-section h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
        }

        .schedule-info {
          background: rgba(33, 150, 243, 0.05);
          padding: 12px;
          border-radius: 4px;
          margin-top: 12px;
          font-size: 13px;
        }

        .setting-item {
          margin-bottom: 12px;
        }

        .setting-item label {
          display: block;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .setting-item p {
          margin: 0;
          font-size: 14px;
          color: var(--secondary-text);
        }

        @media (max-width: 600px) {
          .backup-header {
            flex-direction: column;
          }

          .backup-meta {
            align-items: flex-start;
          }

          .health-grid {
            grid-template-columns: 1fr;
          }

          .contents-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <div class="card-container">
        <h1 class="card-title">${this._config.title || 'Backup Manager'}</h1>

        <div class="tabs">
          <button class="tab-btn ${this._activeTab === 'backups' ? 'active' : ''}"
                  @click="${() => this._switchTab('backups')}">
            Backups
          </button>
          <button class="tab-btn ${this._activeTab === 'health' ? 'active' : ''}"
                  @click="${() => this._switchTab('health')}">
            Health
          </button>
          <button class="tab-btn ${this._activeTab === 'settings' ? 'active' : ''}"
                  @click="${() => this._switchTab('settings')}">
            Settings
          </button>
        </div>

        ${tabContent[this._activeTab]()}
      </div>
    `;

    this._attachEventListeners();

    if (this._activeTab === 'health') {
      setTimeout(() => this._drawFrequencyChart(), 100);
    }
  }

  _switchTab(tab) {
    this._activeTab = tab;
    this._updateUI();
  }

  _drawFrequencyChart() {
    const canvas = this.shadowRoot?.getElementById('frequency-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = 30;
    const maxValue = Math.max(...this._healthData.weeklyData, 5);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(this).getPropertyValue('--text-color') || '#212121';
    ctx.font = '12px sans-serif';

    const barWidth = (width - padding * 2) / 4 - 10;
    const chartHeight = height - padding * 2;

    this._healthData.weeklyData.forEach((value, index) => {
      const x = padding + index * (barWidth + 10);
      const barHeight = (value / maxValue) * chartHeight;
      const y = height - padding - barHeight;

      ctx.fillStyle = '#2196F3';
      ctx.fillRect(x, y, barWidth, barHeight);

      ctx.fillStyle = getComputedStyle(this).getPropertyValue('--secondary-text-color') || '#727272';
      ctx.textAlign = 'center';
      ctx.fillText(value, x + barWidth / 2, height - 10);
    });
  }

  _attachEventListeners() {
    const buttons = this.shadowRoot?.querySelectorAll('[\\@click]');
    buttons?.forEach(btn => {
      const clickStr = btn.getAttribute('@click');
      if (clickStr) {
        try {
          eval(`btn.onclick = ${clickStr}`);
        } catch (e) {
          console.error('Event binding error:', e);
        }
      }
    });
  }
}

customElements.define('ha-backup-manager', HaBackupManager);
