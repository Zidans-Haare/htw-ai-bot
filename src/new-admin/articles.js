import { fetchAndParse } from './utils.js';
import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';

let currentId = null;
let allArticles = [];
let selectedArticleEl = null;
let originalArticle = '';
let originalDescription = '';
let articlesOffset = 0;

const listEl = document.getElementById('article-list');
const searchEl = document.getElementById('search');
const articleInput = document.getElementById('article-input');
const articleAccessLevel = document.getElementById('article-access-level');
const saveBtn = document.getElementById('save-btn');
const deleteBtn = document.getElementById('delete-btn');
const addBtn = document.getElementById('add-heading');
const aiCheckModal = document.getElementById('ai-check-modal');
const aiCheckCloseBtn = document.getElementById('ai-check-close');
const aiCheckResponseEl = document.getElementById('ai-check-response');
const editorListContainer = document.getElementById('editor-list-container');
const editorEditContainer = document.getElementById('editor-edit-container');
const editorBackBtn = document.getElementById('editor-back-btn');

const loadedScripts = {};

function loadScript(src) {
  if (loadedScripts[src]) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      loadedScripts[src] = true;
      resolve();
    };
    script.onerror = () => {
      reject(new Error(`Script load error for ${src}`));
    };
    document.head.appendChild(script);
  });
}

async function markDiffInMarkdown(originalDescription, improvedText) {

  try {
    const { diff_match_patch } = await import('../components/diff_match_patch.js');

    // Highlight changes in the editor
    const dmp = new diff_match_patch();
    const diff = dmp.diff_main(originalDescription, improvedText);
    dmp.diff_cleanupSemantic(diff);

    let markdown = '';
    diff.forEach(part => {
      const type = part[0];
      const data = part[1];
      const sanitizedData = data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      switch (type) {
        case 0: markdown += sanitizedData; break;
        case 1: markdown += `~~${sanitizedData}~~`; break;
        //case -1: html += `<mark class="ai-delete">${sanitizedData}</mark>`; break;
      }
    });
    return markdown;
  } catch (error) {
    console.error('Diff patch error:', error);
    aiCheckResponseEl.innerText = `Fehler beim Diff: ${error.message}`;
  }

}

async function handleImproveClick(suggestionText, textBeforeAiCheck) {
  let originalDescription = editor.getMarkdown();
  // Remove strikethroughs from the original text
  originalDescription = originalDescription.replace(/~~/g, '');

  // Show loading state
  const improveBtn = document.querySelector(`button[data-suggestion="${suggestionText}"]`);
  if (improveBtn) {
    improveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    improveBtn.disabled = true;
  }

  try {
    // Use the original text for the improvement API call
    const response = await fetch('/api/admin/improve-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: originalDescription, suggestion: suggestionText })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Fehler bei der Verbesserung');
    }

    const result = await response.json();

    // Compare the final result with the original text to mark all changes
    let markdown = await markDiffInMarkdown(textBeforeAiCheck, result.improvedText);

    editor.setMarkdown(markdown);
    aiCheckModal.classList.add('hidden'); // Close modal on success

  } catch (error) {
    console.error('Improve Text Error:', error);
    alert(`Fehler bei der Verbesserung: ${error.message}`);
    if (improveBtn) {
      improveBtn.innerHTML = 'Verbessern';
      improveBtn.disabled = false;
    }
  }
}

async function handleAiCheck() {
  let text = editor.getMarkdown();
  // Remove strikethroughs before analysis
  text = text.replace(/~~/g, '');

  // Store the original, clean text
  const textBeforeAiCheck = text;

  if (!text.trim()) {
    alert('Der Editor ist leer.');
    return;
  }

  const loader = document.getElementById('ai-check-loader');
  const resultsEl = document.getElementById('ai-check-results');
  const timerEl = document.getElementById('ai-timer');
  let timerInterval;

  aiCheckModal.classList.remove('hidden');
  resultsEl.innerHTML = '';
  loader.classList.remove('hidden');

  // --- Dynamic Timer Calculation ---
  const baseTime = 15; // Minimum time in seconds
  const charsPerSecond = 100; // Add 1 second for every 100 characters
  const maxTime = 90; // Maximum estimated time
  const estimatedTime = Math.min(maxTime, baseTime + Math.floor(text.length / charsPerSecond));

  let timeLeft = estimatedTime;
  timerEl.textContent = timeLeft;
  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = Math.max(0, timeLeft);
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
    }
  }, 1000);

  try {
    const response = await fetch('/api/admin/analyze-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    clearInterval(timerInterval);
    loader.classList.add('hidden');

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Fehler bei der Analyse');
    }

    const result = await response.json();

    if (typeof result.correctedText !== 'string') {
      throw new Error('AI response did not include the required "correctedText" field.');
    }

    // Mark only the initial grammar/spelling diffs
    let markdown = await markDiffInMarkdown(text, result.correctedText);

    editor.setMarkdown(markdown);

    // Populate the modal with suggestions and contradictions
    resultsEl.innerHTML = '';

    const actualCorrections = result.corrections.filter(item => item.original !== item.corrected);

    if (actualCorrections.length === 0 && result.contradictions.length === 0 && result.suggestions.length === 0) {
      resultsEl.innerHTML = '<p>Keine weiteren Vorschläge oder Widersprüche gefunden. Die Rechtschreibkorrekturen wurden direkt im Text markiert.</p>';
    } else {
      if (actualCorrections.length > 0) {
        const correctionsList = document.createElement('div');
        correctionsList.innerHTML = '<h4 class="font-bold mb-2">Rechtschreib- & Grammatik-Hinweise</h4>';
        actualCorrections.forEach(item => {
          const div = document.createElement('div');
          div.className = 'ai-correction-item p-2 bg-gray-50 rounded mb-2';
          div.innerHTML = `Geändert von "<strong>${item.original}</strong>" zu "<strong>${item.corrected}</strong>" - <em>${item.reason}</em>`;
          correctionsList.appendChild(div);
        });
        resultsEl.appendChild(correctionsList);
      }

      const createSuggestionItem = (item, type) => {
        const suggestionText = type === 'contradiction' ? item.contradiction : item.suggestion;
        const details = document.createElement('details');
        details.className = 'mb-2 cursor-pointer';
        const summary = document.createElement('summary');
        summary.className = `p-2 rounded flex justify-between items-center ${type === 'contradiction' ? 'bg-yellow-100' : 'bg-blue-100'}`;

        const suggestionContent = document.createElement('span');
        suggestionContent.textContent = suggestionText;

        const improveBtn = document.createElement('button');
        improveBtn.className = 'ml-4 px-3 py-1 text-sm rounded-md btn-secondary';
        improveBtn.textContent = 'Verbessern';
        improveBtn.dataset.suggestion = suggestionText;
        improveBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleImproveClick(suggestionText, textBeforeAiCheck);
        };

        summary.appendChild(suggestionContent);
        summary.appendChild(improveBtn);
        details.appendChild(summary);

        const reason = document.createElement('p');
        reason.className = 'p-2 mt-1 bg-gray-50';
        reason.textContent = item.reason;
        details.appendChild(reason);

        return details;
      }

      if (result.contradictions.length > 0) {
        const contradictionsList = document.createElement('div');
        contradictionsList.innerHTML = '<h4 class="font-bold mt-4 mb-2">Widersprüche & Dopplungen</h4>';
        result.contradictions.forEach(item => {
          contradictionsList.appendChild(createSuggestionItem(item, 'contradiction'));
        });
        resultsEl.appendChild(contradictionsList);
      }

      if (result.suggestions.length > 0) {
        const suggestionsList = document.createElement('div');
        suggestionsList.innerHTML = '<h4 class="font-bold mt-4 mb-2">Stil & Tonalität</h4>';
        result.suggestions.forEach(item => {
          suggestionsList.appendChild(createSuggestionItem(item, 'suggestion'));
        });
        resultsEl.appendChild(suggestionsList);
      }
    }

  } catch (error) {
    clearInterval(timerInterval);
    loader.classList.add('hidden');
    console.error('AI Check Error:', error);
    resultsEl.innerText = `Fehler bei der Analyse: ${error.message}`;
  }
}

const redoToolbarItem = {
  name: 'redo',
  tooltip: 'Redo',
  command: 'redo',
  text: '↻',
  className: 'toastui-editor-toolbar-icons redo',
  style: { backgroundImage: 'none' }
};

const undoToolbarItem = {
  name: 'undo',
  tooltip: 'Undo',
  command: 'undo',
  text: '↺',
  className: 'toastui-editor-toolbar-icons undo',
  style: { backgroundImage: 'none' }
};

function createMagicWandButton() {
  const button = document.createElement('button');
  button.className = 'toastui-editor-toolbar-icons ai-check-button';
  button.style.backgroundImage = 'none';
  button.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i>`;
  button.addEventListener('click', handleAiCheck);
  return button;
}

const editor = new Editor({
  el: document.getElementById('editor'),
  height: '400px', // initial height
  initialEditType: 'wysiwyg',
  previewStyle: 'vertical',
  toolbarItems: [
    ['heading', 'bold', 'italic', 'link'],
    [undoToolbarItem, redoToolbarItem],
    [{
      name: 'ai-check',
      tooltip: 'AI Check',
      el: createMagicWandButton()
    }]
  ]
});

// Set editor height dynamically to fill available space
function setEditorHeight() {
  const pane = document.getElementById('editor-edit-container');
  if (!pane || pane.classList.contains('hidden')) return;

  // Calculate available height
  const rect = pane.getBoundingClientRect();
  const availableHeight = window.innerHeight - rect.top - 120; // subtract for header/footer
  editor.setHeight(Math.max(availableHeight, 300) + 'px'); // minimum 300px
}

window.addEventListener('load', setEditorHeight);
window.addEventListener('resize', setEditorHeight);

function setSaveButtonState(enabled) {
  if (enabled) {
    saveBtn.disabled = false;
    saveBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
    saveBtn.classList.add('btn-primary');
  } else {
    saveBtn.disabled = true;
    saveBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
    saveBtn.classList.remove('btn-primary');
  }
}

function checkForChanges() {
  const currentArticle = articleInput.value;
  const currentDescription = editor.getMarkdown();
  const hasChanged = currentArticle !== originalArticle || currentDescription !== originalDescription;
  setSaveButtonState(hasChanged);
}

async function loadArticles(append = false) {
  console.log('Fetching articles...');
  if (!append) {
    articlesOffset = 0;
    allArticles = [];
  }
  try {
    const q = encodeURIComponent(searchEl.value.trim());
    const articles = await fetchAndParse(`/api/admin/articles?q=${q}&offset=${articlesOffset}`);
    console.log('Articles received:', articles);
    if (append) {
      allArticles = allArticles.concat(articles);
    } else {
      allArticles = articles;
      selectedArticleEl = null;
    }
    renderArticles(allArticles, append);
    articlesOffset += 100;
    // Add load more if we got 100
    if (articles.length === 100) {
      let loadMoreBtn = document.getElementById('load-more-articles');
      if (!loadMoreBtn) {
        loadMoreBtn = document.createElement('li');
        loadMoreBtn.id = 'load-more-articles';
        loadMoreBtn.className = 'p-2 text-center';
        loadMoreBtn.innerHTML = '<button class="px-4 py-2 bg-(--accent-color) text-white rounded hover:bg-opacity-80">Mehr laden</button>';
        loadMoreBtn.querySelector('button').addEventListener('click', () => loadArticles(true));
        listEl.appendChild(loadMoreBtn);
      }
    } else {
      const loadMoreBtn = document.getElementById('load-more-articles');
      if (loadMoreBtn) loadMoreBtn.remove();
    }
  } catch (err) {
    console.error('Failed to load articles:', err);
    if (!append) listEl.innerHTML = '<div>Fehler beim Laden der Überschriften</div>';
  }
}

function renderArticles(items, append = false) {
  console.log('Rendering articles:', items);
  if (!append) {
    listEl.innerHTML = '';
  }
  if (items.length === 0 && !append) {
    listEl.innerHTML = '<div class="p-2 text-(--secondary-text)">Keine Überschriften gefunden.</div>';
    return;
  }
  const loadMoreBtn = document.getElementById('load-more-articles');
  const insertBefore = append && loadMoreBtn ? loadMoreBtn : null;
  items.forEach(h => {
    const li = document.createElement('li');
    li.textContent = h.article;
    li.className = 'article-item p-2 cursor-pointer rounded transition-colors';
    li.dataset.id = h.id;
    li.addEventListener('click', () => {
      if (selectedArticleEl) {
        selectedArticleEl.classList.remove('active-article');
      }
      li.classList.add('active-article');
      selectedArticleEl = li;
      // Toggle to edit view
      editorListContainer.classList.add('hidden');
      editorEditContainer.classList.remove('hidden');
      setEditorHeight(); // Set height immediately after showing
      loadEntry(h.id);
    });
    if (insertBefore) {
      listEl.insertBefore(li, insertBefore);
    } else {
      listEl.appendChild(li);
    }
    if (currentId && String(currentId) === String(h.id)) {
      li.classList.add('active-article');
      selectedArticleEl = li;
    }
  });
}

async function loadEntry(id) {
  try {
    console.log('Fetching entry:', id);
    const entry = await fetchAndParse(`/api/admin/entries/${id}`);
    console.log('Entry received:', entry);
    currentId = entry.id;
    articleInput.value = entry.article;
    if (articleAccessLevel) articleAccessLevel.value = entry.access_level || 'employee';
    editor.setMarkdown(entry.description);
    originalArticle = entry.article;
    originalDescription = entry.description;
    const timestamp = entry.lastUpdated ? new Date(entry.lastUpdated) : null;
    const formattedDate = timestamp
      ? `${timestamp.getDate()}.${timestamp.getMonth() + 1}.'${String(timestamp.getFullYear()).slice(-2)} ${timestamp.getHours()}:${String(timestamp.getMinutes()).padStart(2, '0')}`
      : '';
    document.getElementById('last-edited-by').innerHTML = `last edit by:<br>${entry.editor || ''}<br>${formattedDate}`;
    setSaveButtonState(false);

    // Adjust editor height after layout changes
    setTimeout(setEditorHeight, 100);
  } catch (err) {
    console.error('Failed to load entry:', err);
  }
}

async function saveEntry() {
  // remove strikethroughs from the editor content 
  const cleanedText = editor.getMarkdown().replace(/~~/g, '');
  const payload = {
    article: articleInput.value.trim(),
    description: cleanedText.trim(),
    access_level: articleAccessLevel ? articleAccessLevel.value : 'employee',
    active: true
  };
  if (!payload.article || !payload.description) return;
  try {
    console.log('Saving entry:', payload);
    let res;
    if (currentId) {
      res = await fetch(`/api/admin/entries/${currentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch('/api/admin/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    if (!res.ok) {
      const error = await res.json();
      throw new Error(`HTTP error ${res.status}: ${error.error || 'Unknown error'}`);
    }
    const data = await res.json();
    console.log('Entry saved:', data);
    currentId = data.id;

    // If question banner is visible, link the article
    const questionBanner = document.getElementById('question-edit-banner');
    if (!questionBanner.classList.contains('hidden')) {
      const questionId = document.getElementById('question-edit-id').value;
      if (questionId && currentId) {
        await fetch('/api/admin/questions/link-article', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId: questionId, articleId: currentId }),
        });
        // Update banner text
        const answeredInDiv = document.getElementById('question-answered-in');
        if (answeredInDiv) {
          answeredInDiv.innerHTML = `<strong>Beantwortet in:</strong> ${payload.article}`;
          answeredInDiv.style.display = 'block';
        }
      }
    }

    await loadArticles();
    await loadEntry(currentId);
  } catch (err) {
    console.error('Failed to save entry:', err);
    alert('Failed to save entry: ' + err.message);
  }
}

async function deleteEntry() {
  if (!currentId) return;
  try {
    console.log('Deleting entry:', currentId);
    await fetchAndParse(`/api/admin/entries/${currentId}`, { method: 'DELETE' });
    console.log('Entry deleted');
    currentId = null;
    articleInput.value = '';
    editor.setMarkdown('');
    document.getElementById('last-edited-by').innerHTML = `last edit by:<br>`;
    await loadArticles();
    alert('Gelöscht');

    // Show list after delete
    editorEditContainer.classList.add('hidden');
    editorListContainer.classList.remove('hidden');
    editorListContainer.scrollTop = 0;
  } catch (err) {
    console.error('Failed to delete entry:', err);
    alert('Failed to delete entry: ' + err.message);
  }
}

function selectArticle(id) {
  const articleElement = listEl.querySelector(`li[data-id='${id}']`);
  if (articleElement) {
    articleElement.click();
  }
}

function getCurrentId() {
  return currentId;
}

function initArticles() {
  saveBtn.addEventListener('click', saveEntry);
  deleteBtn.addEventListener('click', deleteEntry);
  addBtn.addEventListener('click', () => {
    console.log('Adding new heading...');
    currentId = null;
    articleInput.value = '';
    if (articleAccessLevel) articleAccessLevel.value = 'employee';
    editor.setMarkdown('');
    originalArticle = '';
    originalDescription = '';
    document.getElementById('last-edited-by').innerHTML = `last edit by:<br>`;
    checkForChanges();

    // Toggle to edit view
    editorListContainer.classList.add('hidden');
    editorEditContainer.classList.remove('hidden');
    setEditorHeight(); // Set height immediately

    // Adjust editor height after layout changes
    setTimeout(setEditorHeight, 100);
  });
  searchEl.addEventListener('input', () => {
    console.log('Search input changed, loading articles...');
    loadArticles();
  });

  articleInput.addEventListener('input', checkForChanges);
  editor.addHook('change', checkForChanges);

  aiCheckCloseBtn.addEventListener('click', () => {
    aiCheckModal.classList.add('hidden');
  });

  // Back button
  editorBackBtn.addEventListener('click', () => {
    editorEditContainer.classList.add('hidden');
    editorListContainer.classList.remove('hidden');
    // Scroll to the last viewed item
    setTimeout(() => {
      const activeLi = editorListContainer.querySelector('.active-article');
      if (activeLi) {
        activeLi.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        editorListContainer.scrollTop = 0;
      }
    }, 100);
    // Adjust editor height after layout changes
    setTimeout(setEditorHeight, 100);
  });

  // Cancel edit question button
  document.getElementById('cancel-edit-question').addEventListener('click', () => {
    editorEditContainer.classList.add('hidden');
    editorListContainer.classList.remove('hidden');
    editorListContainer.scrollTop = 0;
  });



  loadArticles();
}

export { initArticles, allArticles, loadArticles, selectArticle, getCurrentId, loadEntry, saveEntry };