import { fetchAndParse } from './utils.js';

const createBackupBtn = document.getElementById('create-backup-btn');
const uploadBackupBtn = document.getElementById('upload-backup-btn');
const uploadBackupInput = document.getElementById('upload-backup-input');
const backupCreate = document.getElementById('backup-create');
const startBackupBtn = document.getElementById('start-backup-btn');
const backupList = document.getElementById('backup-list');

const checkboxes = {
  users: document.getElementById('backup-users'),
  artikels: document.getElementById('backup-artikels'),
  fragen: document.getElementById('backup-fragen'),
  conversations: document.getElementById('backup-conversations'),
  dokumente: document.getElementById('backup-dokumente'),
  bilder: document.getElementById('backup-bilder'),
  feedback: document.getElementById('backup-feedback'),
  dashboard: document.getElementById('backup-dashboard')
};

function initBackup() {
  createBackupBtn.addEventListener('click', () => {
    backupCreate.classList.remove('hidden');
  });

  uploadBackupBtn.addEventListener('click', () => {
    uploadBackupInput.click();
  });

  uploadBackupInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await fetch('/api/admin/backup/upload', {
        method: 'POST',
        body: formData
      });
      loadBackups();
    } catch (err) {
      console.error('Upload failed', err);
    }
  });

  startBackupBtn.addEventListener('click', async function() {
    const selected = {};
    Object.keys(checkboxes).forEach(key => {
      selected[key] = checkboxes[key].checked;
    });
    startBackupBtn.disabled = true;
    startBackupBtn.textContent = 'Creating Backup...';
    try {
      const res = await fetch('/api/admin/backup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selected)
      });
      if (res.status === 409) {
        alert('Backup already in progress');
        return;
      }
      const { filename, status, message } = await res.json();
      alert(message || `Backup ${status}: ${filename}`);
      backupCreate.classList.add('hidden');
      loadBackups();
    } catch (err) {
      console.error('Backup failed', err);
    } finally {
      startBackupBtn.disabled = false;
      startBackupBtn.textContent = 'Start Backup';
    }
  });

  const selectAllBtn = document.getElementById('select-all-btn');
  selectAllBtn.addEventListener('click', () => {
    document.querySelectorAll('#import-options input[type="checkbox"]').forEach(cb => cb.checked = true);
  });

  const startImportBtn = document.getElementById('start-import-btn');
  startImportBtn.addEventListener('click', async function() {
    const filename = this.dataset.filename;
    const mode = 'replace'; // Hardcoded to replace-only
    const selected = {};
    document.querySelectorAll('#import-options input[type="checkbox"]').forEach(cb => {
      selected[cb.id.replace('import-', '')] = cb.checked;
    });
    const selectedTables = Object.keys(selected).filter(key => selected[key]);
    if (!confirm(`Final Warning: This will erase all existing data in the selected tables (${selectedTables.join(', ')}) and replace it with data from the backup. This action cannot be undone. Are you sure you want to proceed?`)) {
      return;
    }
    startImportBtn.disabled = true;
    startImportBtn.textContent = 'Restoring...';
    try {
      await fetch(`/api/admin/backup/${filename}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, selected })
      });
      alert('Full restore completed');
      document.getElementById('backup-import').classList.add('hidden');
    } catch (err) {
      console.error('Restore failed', err);
      alert('Restore failed');
    } finally {
      startImportBtn.disabled = false;
      startImportBtn.textContent = 'Start Full Restore';
    }
  });

  loadBackups();
}

async function loadBackups() {
  try {
    const backups = await fetchAndParse('/api/admin/backup/list');
    backupList.innerHTML = '';
    backups.forEach(backup => {
      const item = document.createElement('div');
      item.className = 'flex justify-between items-center p-2 border rounded';
      item.innerHTML = `
        <span>${backup.filename} (${new Date(backup.date).toLocaleString()}) - ${(backup.size / 1024 / 1024).toFixed(2)} MB</span>
        <div class="space-x-2">
          <button class="download-btn px-2 py-1 bg-blue-500 text-white rounded" data-filename="${backup.filename}">Download</button>
          <button class="rename-btn px-2 py-1 bg-yellow-500 text-white rounded" data-filename="${backup.filename}">Rename</button>
           <button class="import-btn px-2 py-1 bg-green-500 text-white rounded" data-filename="${backup.filename}">Restore</button>
          <button class="delete-btn px-2 py-1 bg-red-500 text-white rounded" data-filename="${backup.filename}">Delete</button>
        </div>
      `;
      backupList.appendChild(item);
    });

    // Add event listeners
    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.open(`/backup/${btn.dataset.filename}`);
      });
    });

    document.querySelectorAll('.rename-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newName = prompt('New name:', btn.dataset.filename);
        if (newName) {
          await fetch(`/api/admin/backup/${btn.dataset.filename}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName })
          });
          loadBackups();
        }
      });
    });

    document.querySelectorAll('.import-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const filename = btn.dataset.filename;
        if (!confirm('Warning: Restoring from a backup will erase all existing data in the selected tables and replace it with data from the backup. This action cannot be undone. Do you want to proceed?')) {
          return;
        }
        try {
          const { files } = await fetchAndParse(`/api/admin/backup/${filename}/files`);
          const importOptions = document.getElementById('import-options');
          importOptions.innerHTML = '';
          const fileMap = {
            users: 'Users',
            artikels: 'Artikels',
            fragen: 'Fragen',
            conversations: 'Conversations',
            dokumente: 'Dokumente',
            bilder: 'Bilder',
            feedback: 'Feedback'
          };
          const fileKeyMap = {
            artikels: 'hochschuhl_abc',
            fragen: 'questions',
            dokumente: 'documents',
            bilder: 'images'
          };
          const dashboardFiles = ['article_views', 'page_views', 'daily_question_stats', 'daily_unanswered_stats', 'question_analysis_cache', 'token_usage', 'user_sessions', 'chat_interactions'];
          const hasDashboard = dashboardFiles.some(f => files.includes(f));
          if (hasDashboard) {
            fileMap.dashboard = 'Dashboard';
          }
          Object.keys(fileMap).forEach(key => {
            const fileKey = fileKeyMap[key] || key;
            if (files.includes(fileKey) || (key === 'dashboard' && hasDashboard)) {
              const label = document.createElement('label');
              label.innerHTML = `<input type="checkbox" id="import-${key}" checked> ${fileMap[key]}`;
              importOptions.appendChild(label);
            }
          });
          document.getElementById('backup-import').classList.remove('hidden');
          // Set current button for later
          document.getElementById('start-import-btn').dataset.filename = filename;
        } catch (err) {
          console.error('Failed to load backup files', err);
        }
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Warning: Deleting this backup will permanently remove the backup file. This action cannot be undone. Are you sure you want to delete this backup?')) {
          await fetch(`/api/admin/backup/${btn.dataset.filename}`, { method: 'DELETE' });
          loadBackups();
        }
      });
    });
  } catch (err) {
    console.error('Load backups failed', err);
  }
}

export { initBackup };