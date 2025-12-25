import { fetchAndParse } from './utils.js';

let usersOffset = 0;
let allUsers = [];

// --- Modal Elements ---
const changePasswordModal = document.getElementById('change-password-modal');
const changePasswordUsername = document.getElementById('change-password-username');
const newPasswordInput = document.getElementById('new-password-input');
const changePasswordCancelBtn = document.getElementById('change-password-cancel');
const changePasswordConfirmBtn = document.getElementById('change-password-confirm');

const removeUserModal = document.getElementById('remove-user-modal');
const removeUserUsername = document.getElementById('remove-user-username');
const removeUserCancelBtn = document.getElementById('remove-user-cancel');
const removeUserConfirmBtn = document.getElementById('remove-user-confirm');
const removeUserConfirmInput = document.getElementById('remove-user-confirm-input');

let activeUsername = null;
let activeUserId = null;

const editUserModal = document.getElementById('edit-user-modal');
const editUserUsernameDisplay = document.getElementById('edit-user-username');
const editUserRoleSelect = document.getElementById('edit-user-role');
const editUserCancelBtn = document.getElementById('edit-user-cancel');
const editUserSaveBtn = document.getElementById('edit-user-save');


async function loadUsers(append = false) {
  if (!append) {
    allUsers = [];
    usersOffset = 0;
  }
  try {
    const users = await fetchAndParse(`/api/admin/users?offset=${usersOffset}`);
    if (append) {
      allUsers = allUsers.concat(users);
    } else {
      allUsers = users;
    }
    renderUsers(allUsers);
    usersOffset += 100;
    if (users.length === 100) {
      let loadMoreBtn = document.getElementById('load-more-users');
      if (!loadMoreBtn) {
        loadMoreBtn = document.createElement('div');
        loadMoreBtn.id = 'load-more-users';
        loadMoreBtn.className = 'text-center mt-4';
        loadMoreBtn.innerHTML = '<button class="px-4 py-2 bg-(--accent-color) text-white rounded hover:bg-opacity-80">Mehr laden</button>';
        loadMoreBtn.querySelector('button').addEventListener('click', () => loadUsers(true));
        document.getElementById('user-list').appendChild(loadMoreBtn);
      }
    } else {
      const loadMoreBtn = document.getElementById('load-more-users');
      if (loadMoreBtn) loadMoreBtn.remove();
    }
  } catch (error) {
    console.error('Failed to load users:', error);
    if (!append) document.getElementById('user-list').innerHTML = '<div>Fehler beim Laden der Benutzer.</div>';
  }
}

function renderUsers(users) {
  const userListDiv = document.getElementById('user-list');
  userListDiv.innerHTML = '';
  if (users.length === 0) {
    userListDiv.innerHTML = '<p class="text-(--secondary-text)">Keine Benutzer gefunden.</p>';
    return;
  }
  users.forEach(user => {
    const userElement = document.createElement('div');
    userElement.className = 'flex items-center justify-between p-3 border-b border-(--border-color)';

    const userInfo = document.createElement('div');

    const usernameP = document.createElement('p');
    usernameP.className = 'font-medium';
    usernameP.textContent = user.username;

    const roleP = document.createElement('p');
    roleP.className = 'text-sm text-(--secondary-text)';
    roleP.textContent = user.role;

    userInfo.appendChild(usernameP);
    userInfo.appendChild(roleP);

    const userActions = document.createElement('div');
    userActions.className = 'flex items-center space-x-2';
    userActions.innerHTML = `
      <button class="edit-user-btn btn-secondary px-3 py-2 rounded-md flex items-center space-x-2" data-userid="${user.id}" data-username="${user.username}" data-role="${user.role}" data-permissions='${JSON.stringify(user.permissions || [])}'>
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        <span>Bearbeiten</span>
      </button>
      <button class="change-password-btn btn-secondary px-3 py-2 rounded-md flex items-center space-x-2" data-username="${user.username}">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2h2l1.743-1.743A6 6 0 0119 9z" /></svg>
        <span>Passwort</span>
      </button>
      <button class="remove-user-btn bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md flex items-center space-x-2" data-username="${user.username}">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        <span>Löschen</span>
      </button>
    `;

    userElement.appendChild(userInfo);
    userElement.appendChild(userActions);
    userListDiv.appendChild(userElement);
  });

  document.querySelectorAll('.edit-user-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      openEditUserModal(btn.dataset.userid, btn.dataset.username, btn.dataset.role, JSON.parse(btn.dataset.permissions));
    });
  });
  document.querySelectorAll('.change-password-btn').forEach(button => {
    button.addEventListener('click', (e) => openChangePasswordModal(e.currentTarget.dataset.username));
  });
  document.querySelectorAll('.remove-user-btn').forEach(button => {
    button.addEventListener('click', (e) => openRemoveUserModal(e.currentTarget.dataset.username));
  });
}

function openChangePasswordModal(username) {
  activeUsername = username;
  changePasswordUsername.textContent = username;
  changePasswordModal.classList.remove('hidden');
  newPasswordInput.focus();
}

function openEditUserModal(userId, username, role, permissions) {
  activeUserId = userId;
  activeUsername = username;
  editUserUsernameDisplay.textContent = username;
  editUserRoleSelect.value = role;

  // Set permission checkboxes
  document.querySelectorAll('#edit-user-permissions-list input[type="checkbox"]').forEach(cb => {
    cb.checked = permissions.includes(cb.value);
  });

  editUserModal.classList.remove('hidden');
}

function openRemoveUserModal(username) {
  activeUsername = username;
  removeUserUsername.textContent = username;
  removeUserConfirmInput.value = '';
  removeUserConfirmBtn.disabled = true;
  removeUserModal.classList.remove('hidden');
  removeUserConfirmInput.focus();
}

function closeModals() {
  changePasswordModal.classList.add('hidden');
  removeUserModal.classList.add('hidden');
  editUserModal.classList.add('hidden');
  newPasswordInput.value = '';
  removeUserConfirmInput.value = '';
  activeUsername = null;
}

async function confirmChangePassword() {
  const newPassword = newPasswordInput.value;
  if (newPassword && newPassword.trim() !== '') {
    try {
      const response = await fetch(`/api/admin/users/${activeUsername}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      if (response.ok) {
        alert('Passwort erfolgreich geändert.');
        closeModals();
      } else {
        const error = await response.json();
        alert(`Fehler beim Ändern des Passworts: ${error.error || 'Unbekannter Fehler'}`);
      }
    } catch (error) {
      console.error('Error changing password:', error);
      alert('Fehler beim Ändern des Passworts.');
    }
  }
}

async function confirmRemoveUser() {
  try {
    const response = await fetch(`/api/admin/users/${activeUsername}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      alert('Benutzer erfolgreich gelöscht.');
      closeModals();
      loadUsers(); // Refresh the list
    } else {
      const error = await response.json();
      alert(`Fehler beim Löschen des Benutzers: ${error.error || 'Unbekannter Fehler'}`);
    }
  } catch (error) {
    console.error('Error removing user:', error);
    alert('Fehler beim Löschen des Benutzers.');
  }
}

async function saveUserChanges() {
  const newRole = editUserRoleSelect.value;
  const newPermissions = Array.from(document.querySelectorAll('#edit-user-permissions-list input[type="checkbox"]:checked')).map(cb => cb.value);

  try {
    const response = await fetch(`/api/admin/users/${activeUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole, permissions: newPermissions })
    });

    if (response.ok) {
      alert('Benutzer erfolgreich aktualisiert.');
      closeModals();
      loadUsers(); // Refresh list to show new role
    } else {
      const error = await response.json();
      alert(`Fehler beim Aktualisieren: ${error.error || 'Unbekannt'}`);
    }
  } catch (error) {
    console.error('Error updating user:', error);
    alert('Fehler beim Aktualisieren des Benutzers.');
  }
}

function initUsers() {
  document.getElementById('create-user').addEventListener('click', async () => {
    const u = document.getElementById('new-user').value.trim();
    const p = document.getElementById('new-pass').value.trim();
    const r = document.getElementById('new-role').value;
    if (!u || !p) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p, role: r }),
      });
      if (res.ok) {
        alert('User created');
        document.getElementById('new-user').value = '';
        document.getElementById('new-pass').value = '';
        loadUsers();
      } else {
        const error = await res.json();
        console.error('User creation failed:', error);
        alert('User creation failed: ' + (error.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('User creation error:', err);
      alert('User creation error');
    }
  });

  // Add event listeners for modal buttons
  editUserCancelBtn.addEventListener('click', closeModals);
  editUserSaveBtn.addEventListener('click', saveUserChanges);
  changePasswordCancelBtn.addEventListener('click', closeModals);
  changePasswordConfirmBtn.addEventListener('click', confirmChangePassword);
  removeUserCancelBtn.addEventListener('click', closeModals);
  removeUserConfirmBtn.addEventListener('click', confirmRemoveUser);

  // Listener for the delete confirmation input
  removeUserConfirmInput.addEventListener('input', () => {
    if (removeUserConfirmInput.value === activeUsername) {
      removeUserConfirmBtn.disabled = false;
    } else {
      removeUserConfirmBtn.disabled = true;
    }
  });
}

export { initUsers, loadUsers };
