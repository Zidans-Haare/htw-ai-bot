import { fetchAndParse } from './utils.js';

let servers = [];
let pollingInterval = null;

const mcpView = document.getElementById('mcp-view');

// List container
const listContainer = document.createElement('div');
listContainer.id = 'mcp-list-container';
listContainer.innerHTML = `
  <div class="p-4 border-b border-(--border-color) flex justify-between items-center">
    <h2 class="text-lg font-semibold">MCP Servers</h2>
    <button id="add-mcp-server" class="px-4 py-2 btn-primary rounded-md">Add Server</button>
  </div>
  <div class="p-4">
    <table class="w-full table-auto">
      <thead>
        <tr class="text-left">
          <th class="pb-2">Name</th>
          <th class="pb-2">Type</th>
          <th class="pb-2">Enabled</th>
          <th class="pb-2">Status</th>
          <th class="pb-2">Actions</th>
        </tr>
      </thead>
      <tbody id="mcp-server-table"></tbody>
    </table>
  </div>
`;

// Form container
const formContainer = document.createElement('div');
formContainer.id = 'mcp-form-container';
formContainer.className = 'hidden p-6 space-y-4';
formContainer.innerHTML = `
  <div class="flex items-center">
    <button id="mcp-back-btn" class="mr-4 px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm">
      <i class="fas fa-arrow-left mr-1"></i>Back
    </button>
    <h2 class="text-lg font-semibold" id="form-title">Add MCP Server</h2>
  </div>
  <form id="mcp-server-form" class="space-y-4">
    <div>
      <label class="block text-sm font-medium">Name</label>
      <input type="text" id="mcp-name" class="w-full p-2 border border-(--input-border) rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-(--accent-color)" required>
    </div>
    <div>
      <label class="block text-sm font-medium">Type</label>
      <select id="mcp-type" class="w-full p-2 border border-(--input-border) rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-(--accent-color)" required>
        <option value="local">Local</option>
        <option value="remote">Remote</option>
      </select>
    </div>
    <div id="local-fields">
      <label class="block text-sm font-medium">Command</label>
      <textarea id="mcp-command" class="w-full p-2 border border-(--input-border) rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-(--accent-color)" rows="3" placeholder='["node", "/path/to/server.js"]'></textarea>
    </div>
    <div id="remote-fields" class="hidden">
      <label class="block text-sm font-medium">URL</label>
      <input type="text" id="mcp-url" class="w-full p-2 border border-(--input-border) rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-(--accent-color)" placeholder="https://example.com/mcp">
      <label class="block text-sm font-medium mt-2">Headers (JSON)</label>
      <textarea id="mcp-headers" class="w-full p-2 border border-(--input-border) rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-(--accent-color)" rows="3" placeholder='{"Authorization": "Bearer token"}'></textarea>
    </div>
    <div>
      <label class="block text-sm font-medium">Environment Variables (JSON)</label>
      <textarea id="mcp-env" class="w-full p-2 border border-(--input-border) rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-(--accent-color)" rows="2" placeholder='{"API_KEY": "value"}'></textarea>
    </div>
    <div>
      <label class="block text-sm font-medium">Enabled</label>
      <input type="checkbox" id="mcp-enabled" checked>
    </div>
    <div>
      <label class="block text-sm font-medium">Timeout (ms)</label>
      <input type="number" id="mcp-timeout" class="w-full p-2 border border-(--input-border) rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-(--accent-color)" value="10000" min="1000">
    </div>
    <div>
      <label class="block text-sm font-medium">Test Query</label>
      <textarea id="mcp-test-query" class="w-full p-2 border border-(--input-border) rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-(--accent-color)" rows="3" placeholder="Enter a test query to simulate how the AI would use this MCP server"></textarea>
    </div>
    <div class="flex justify-end space-x-2">
      <button type="button" id="mcp-test" class="px-4 py-2 btn-secondary rounded-md">Test</button>
      <button type="button" id="mcp-cancel" class="px-4 py-2 btn-secondary rounded-md">Cancel</button>
      <button type="submit" class="px-4 py-2 btn-primary rounded-md">Save</button>
    </div>
  </form>
`;

mcpView.appendChild(listContainer);
mcpView.appendChild(formContainer);

function initMcpServers() {
  if (pollingInterval) clearInterval(pollingInterval);
  loadServers();
  pollingInterval = setInterval(loadServers, 2000);

  // Add button
  document.getElementById('add-mcp-server').addEventListener('click', () => showForm());

  // Back button
  document.getElementById('mcp-back-btn').addEventListener('click', () => showList());

  // Type change
  document.getElementById('mcp-type').addEventListener('change', (e) => {
    const isLocal = e.target.value === 'local';
    document.getElementById('local-fields').classList.toggle('hidden', !isLocal);
    document.getElementById('remote-fields').classList.toggle('hidden', isLocal);
  });

  // Test button
  document.getElementById('mcp-test').addEventListener('click', async () => {
    await testServer();
  });

  // Form submit
  document.getElementById('mcp-server-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveServer();
  });

  // Cancel
  document.getElementById('mcp-cancel').addEventListener('click', () => showList());
}

async function loadServers() {
  try {
    servers = await fetchAndParse('/api/admin/mcp-servers');
    renderServers();
  } catch (error) {
    console.error('Failed to load MCP servers:', error);
  }
}

function renderServers() {
  const tbody = document.getElementById('mcp-server-table');
  tbody.innerHTML = '';
  if (servers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-(--secondary-text)">No servers configured.</td></tr>';
    return;
  }
  servers.forEach(server => {
    const row = document.createElement('tr');
    row.className = 'border-b border-(--border-color)';
    row.innerHTML = `
      <td class="py-2">${server.name}</td>
      <td class="py-2">${server.type}</td>
      <td class="py-2">${server.enabled ? 'Yes' : 'No'}</td>
      <td class="py-2">
        <span class="${server.status === 'active' ? 'text-green-500' : 'text-gray-500'}">
          ${server.status === 'active' ? 'Online' : 'Offline'}
        </span>
      </td>
      <td class="py-2">
        <button class="edit-mcp-btn px-2 py-1 bg-blue-500 text-white rounded text-sm mr-2" data-id="${server.id}">Edit</button>
        <button class="rename-mcp-btn px-2 py-1 bg-yellow-500 text-white rounded text-sm mr-2" data-id="${server.id}">Rename</button>
        <button class="delete-mcp-btn px-2 py-1 bg-red-500 text-white rounded text-sm" data-id="${server.id}">Remove</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Event listeners
  document.querySelectorAll('.edit-mcp-btn').forEach(btn => {
    btn.addEventListener('click', (e) => editServer(parseInt(e.target.dataset.id)));
  });
  document.querySelectorAll('.rename-mcp-btn').forEach(btn => {
    btn.addEventListener('click', (e) => renameServer(parseInt(e.target.dataset.id)));
  });
  document.querySelectorAll('.delete-mcp-btn').forEach(btn => {
    btn.addEventListener('click', (e) => deleteServer(parseInt(e.target.dataset.id)));
  });
}

function showList() {
  listContainer.classList.remove('hidden');
  formContainer.classList.add('hidden');
}

function showForm(server = null) {
  listContainer.classList.add('hidden');
  formContainer.classList.remove('hidden');
  document.getElementById('form-title').textContent = server ? 'Edit MCP Server' : 'Add MCP Server';
  const form = document.getElementById('mcp-server-form');
  form.dataset.id = server ? server.id : '';
  if (server) {
    document.getElementById('mcp-name').value = server.name;
    document.getElementById('mcp-type').value = server.type;
    document.getElementById('mcp-type').dispatchEvent(new Event('change'));
    if (server.type === 'local') {
      document.getElementById('mcp-command').value = JSON.stringify(server.command, null, 2);
    } else {
      document.getElementById('mcp-url').value = server.url || '';
      document.getElementById('mcp-headers').value = JSON.stringify(server.headers || {}, null, 2);
    }
    document.getElementById('mcp-env').value = JSON.stringify(server.env || {}, null, 2);
    document.getElementById('mcp-enabled').checked = server.enabled;
    document.getElementById('mcp-timeout').value = server.timeout || 10000;
    document.getElementById('mcp-test-query').value = server.testQuery || 'What tools do you have available?';
  } else {
    form.reset();
    document.getElementById('mcp-type').dispatchEvent(new Event('change'));
    document.getElementById('mcp-test-query').value = 'What tools do you have available?';
  }
}

function editServer(id) {
  const server = servers.find(s => s.id === id);
  if (server) showForm(server);
}

function renameServer(id) {
  const server = servers.find(s => s.id === id);
  if (!server) return;
  const newName = prompt('Enter new name:', server.name);
  if (newName && newName !== server.name) {
    updateServer(id, { name: newName });
  }
}

async function deleteServer(id) {
  if (!confirm('Sind Sie wirklich sicher??')) return;
  try {
    await fetch(`/api/admin/mcp-servers/${id}?confirm=true`, { method: 'DELETE' });
    loadServers();
  } catch (error) {
    console.error('Failed to delete server:', error);
  }
}

async function saveServer() {
  const form = document.getElementById('mcp-server-form');
  const id = form.dataset.id;
  const data = {
    name: document.getElementById('mcp-name').value,
    type: document.getElementById('mcp-type').value,
    enabled: document.getElementById('mcp-enabled').checked,
    timeout: parseInt(document.getElementById('mcp-timeout').value),
    testQuery: document.getElementById('mcp-test-query').value,
  };
  if (data.type === 'local') {
    try {
      data.command = JSON.parse(document.getElementById('mcp-command').value);
    } catch {
      alert('Invalid command JSON');
      return;
    }
  } else {
    data.url = document.getElementById('mcp-url').value;
    try {
      data.headers = JSON.parse(document.getElementById('mcp-headers').value || '{}');
    } catch {
      alert('Invalid headers JSON');
      return;
    }
  }
  try {
    data.env = JSON.parse(document.getElementById('mcp-env').value || '{}');
  } catch {
    alert('Invalid env JSON');
    return;
  }

  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/admin/mcp-servers/${id}` : '/api/admin/mcp-servers';
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    showList();
    loadServers();
  } catch (error) {
    console.error('Failed to save server:', error);
  }
}

async function updateServer(id, updates) {
  try {
    await fetch(`/api/admin/mcp-servers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    loadServers();
  } catch (error) {
    console.error('Failed to update server:', error);
  }
}

async function testServer() {
  const testQuery = document.getElementById('mcp-test-query').value.trim();
  if (!testQuery) {
    alert('Please enter a test query');
    return;
  }

  const form = document.getElementById('mcp-server-form');
  const id = form.dataset.id;
  if (!id) {
    alert('Please save the server first before testing');
    return;
  }

  const testBtn = document.getElementById('mcp-test');
  const originalText = testBtn.textContent;
  testBtn.textContent = 'Testing...';
  testBtn.disabled = true;

  try {
    const response = await fetch(`/api/admin/mcp-servers/${id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: testQuery }),
    });

    const result = await response.json();

    if (response.ok) {
      const status = result.hasErrors ? 'COMPLETED WITH ERRORS' : 'SUCCESSFUL';

      let availableToolsText = 'None';
      if (result.availableTools && result.availableTools.length > 0) {
        availableToolsText = result.availableTools.join(', ');
      }

      let toolsText = 'None';
      if (result.toolsUsed && result.toolsUsed.length > 0) {
        toolsText = result.toolsUsed.map(tool =>
          tool.error ? `${tool.name} (error)` : `${tool.name} (passed)`
        ).join(', ');
      }

      alert(`Test ${status}! Your AI model supports tool calls.\n\nResponse: ${result.response}\n\nAvailable tools for ${result.serverName}: ${availableToolsText}\n\nTools used: ${toolsText}`);
    } else {
      alert(`Test failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Test error:', error);
    alert('Test failed: Network error');
  } finally {
    testBtn.textContent = originalText;
    testBtn.disabled = false;
  }
}

export { initMcpServers };
