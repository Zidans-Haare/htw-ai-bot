import { fetchAndParse } from './utils.js';
import { loadArticles } from './articles.js';

let archiveEntries = [];
const archiveList = document.getElementById('archive-list');
const archiveSearch = document.getElementById('archive-search');
const archiveSort = document.getElementById('archive-sort');
let archiveOffset = 0;

async function loadArchive(append = false) {
  if (!append) {
    archiveEntries = [];
    archiveList.innerHTML = '';
    archiveOffset = 0;
  }
  try {
    console.log('Fetching archive...');
    const entries = await fetchAndParse(`/api/admin/archive?offset=${archiveOffset}`);
    console.log('Archive received:', entries);
    if (Array.isArray(entries)) {
      if (append) {
        archiveEntries = archiveEntries.concat(entries);
      } else {
        archiveEntries = entries;
      }
    }
    renderArchive(append);
    archiveOffset += 100;
    if (entries.length === 100) {
      let loadMoreBtn = document.getElementById('load-more-archive');
      if (!loadMoreBtn) {
        loadMoreBtn = document.createElement('div');
        loadMoreBtn.id = 'load-more-archive';
        loadMoreBtn.className = 'text-center mt-4';
        loadMoreBtn.innerHTML = '<button class="px-4 py-2 bg-(--accent-color) text-white rounded hover:bg-opacity-80">Mehr laden</button>';
        loadMoreBtn.querySelector('button').addEventListener('click', () => loadArchive(true));
        archiveList.appendChild(loadMoreBtn);
      }
    } else {
      const loadMoreBtn = document.getElementById('load-more-archive');
      if (loadMoreBtn) loadMoreBtn.remove();
    }
  } catch (err) {
    if (!append) archiveList.innerHTML = '<div>Fehler beim Laden</div>';
    console.error('Failed to load archive:', err);
  }
}

function renderArchive(append = false) {
  console.log('Rendering archive:', archiveEntries);
  let items = archiveEntries.slice();
  const q = archiveSearch.value.toLowerCase();
  if (q) {
    items = items.filter(e =>
      e.article.toLowerCase().includes(q) ||
      (e.description && e.description.toLowerCase().includes(q)) ||
      (e.editor && e.editor.toLowerCase().includes(q))
    );
  }
  const sort = archiveSort.value;
  if (sort === 'oldest') {
    items.sort((a, b) => new Date(a.archived) - new Date(b.archived));
  } else if (sort === 'editor') {
    items.sort((a, b) => (a.editor || '').localeCompare(b.editor || ''));
  } else {
    items.sort((a, b) => new Date(b.archived) - new Date(a.archived));
  }
  const loadMoreBtn = document.getElementById('load-more-archive');
  const insertBefore = append && loadMoreBtn ? loadMoreBtn : null;
  if (!append) archiveList.innerHTML = '';
  items.forEach(e => {
    const div = document.createElement('div');
    div.className = 'border p-4 rounded';
    const date = e.archived ? new Date(e.archived).toLocaleString() : '';
    div.innerHTML = `<h3 class="font-semibold mb-1">${e.article}</h3>
      <p class="text-sm text-gray-500 mb-2">${date} - ${e.editor || ''}</p>
      <div class="text-sm mb-2">${e.description}</div>`;
    const btn = document.createElement('button');
    btn.className = 'btn-primary px-3 py-1 rounded-md mr-2';
    btn.textContent = 'Wiederherstellen';
    btn.addEventListener('click', async () => {
      try {
        console.log('Restoring entry:', e.id);
        const resp = await fetch(`/api/admin/restore/${e.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (resp.ok) {
          await loadArticles();
          await loadArchive();
          alert('Wiederhergestellt');
        } else {
          console.error('Restore failed:', await resp.json());
        }
      } catch (err) {
        console.error('Restore failed:', err);
      }
    });
    div.appendChild(btn);
    if (insertBefore) {
      archiveList.insertBefore(div, insertBefore);
    } else {
      archiveList.appendChild(div);
    }
  });
}

function initArchive() {
    archiveSearch.addEventListener('input', renderArchive);
    archiveSort.addEventListener('change', renderArchive);
}

export { initArchive, loadArchive };
