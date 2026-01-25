import { fetchAndParse } from './utils.js';

export function initQuestions({ updateOpenCount, showEditor }) {
  const tabOpen = document.getElementById('tab-open');
  const tabAnswered = document.getElementById('tab-answered');
  const openList = document.getElementById('open-list');
  const answeredList = document.getElementById('answered-list');
  const questionSearch = document.getElementById('question-search');
  const deleteSelectedBtn = document.getElementById('delete-selected');
  const openCountSpan = document.getElementById('open-count');
  const btnEditQuestions = document.getElementById('btn-edit-questions');
  const markAsAnsweredBtn = document.getElementById('mark-as-answered-btn');

  let selectedQuestions = new Set();
  let openOffset = 0;
  let answeredOffset = 0;

  async function handleMarkAsAnswered() {
    const questionId = document.getElementById('question-edit-id').value;

    if (!questionId) {
        alert('Keine Frage zum Markieren ausgewählt.');
        return;
    }

    try {
        const response = await fetch('/api/admin/mark-answered', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questionId: questionId })
        });

        if (response.ok) {
            // alert('Frage als beantwortet markiert.');
            document.getElementById('question-edit-banner').classList.add('hidden');
            document.getElementById('question-context-actions').classList.add('hidden');
            document.getElementById('delete-btn').classList.remove('hidden');
            document.getElementById('save-btn').classList.remove('hidden');
            loadOpen();
            loadAnswered();
        } else {
            const error = await response.json();
            alert(`Fehler: ${error.message}`);
        }
    } catch (error) {
        console.error('Fehler beim Markieren als beantwortet:', error);
        alert('Ein unerwarteter Fehler ist aufgetreten.');
    }
  }

  async function loadOpen(append = false) {
    if (!append) {
      openList.innerHTML = '';
      selectedQuestions.clear();
      deleteSelectedBtn.classList.add('hidden');
      openOffset = 0;
    }
    try {
      const questions = await fetchAndParse(`/api/admin/unanswered?offset=${openOffset}`);
      if (!Array.isArray(questions)) {
        if (!append) openList.innerHTML = '<div class="text-gray-500">Keine offenen Fragen gefunden.</div>';
        return;
      }
      if (!append) updateOpenCount(questions.length); // Only update count on initial load
      const qFilter = questionSearch.value.toLowerCase();
      const filtered = questions.filter(q => !qFilter || q.question.toLowerCase().includes(qFilter));
      if (filtered.length === 0 && !append) {
        openList.innerHTML = '<div class="text-gray-500">Keine offenen Fragen gefunden.</div>';
        return;
      }
       const loadMoreBtn = document.getElementById('load-more-open');
       const insertBefore = append && loadMoreBtn ? loadMoreBtn : null;
       filtered.forEach(q => {
         const div = document.createElement('div');
         div.className = 'border border-(--border-color) p-4 rounded-lg';

         const header = document.createElement('div');
         header.className = 'flex justify-between items-start mb-2';

         const left = document.createElement('div');
         left.className = 'flex items-start space-x-3';

         const cb = document.createElement('input');
         cb.type = 'checkbox';
         cb.className = 'mt-1 h-4 w-4 text-(--accent-color) focus:ring-(--accent-color) border-(--input-border) rounded';
         cb.addEventListener('change', () => {
           if (cb.checked) selectedQuestions.add(q.question); else selectedQuestions.delete(q.question);
           deleteSelectedBtn.classList.toggle('hidden', selectedQuestions.size === 0);
         });

         const textContainer = document.createElement('div');
         const p = document.createElement('p');
         p.className = 'font-medium';
         p.textContent = q.question;
         textContainer.appendChild(p);

         if (q.translation) {
           const t = document.createElement('p');
           t.className = 'text-sm text-(--secondary-text) mt-1';
           t.textContent = `Übersetzung: ${q.translation}`;
           textContainer.appendChild(t);
         }

         left.appendChild(cb);
         left.appendChild(textContainer);

         const del = document.createElement('button');
         del.type = 'button';
         del.innerHTML = '<i class="fas fa-trash"></i>';
         del.className = 'text-red-500 hover:text-red-700';
         del.addEventListener('click', () => handleDelete([q.question]));

         header.appendChild(left);
         header.appendChild(del);

         div.appendChild(header);

         const form = document.createElement('form');
         form.innerHTML = `
           <input type="hidden" name="question" value="${q.question}">
           <!--
           <textarea name="answer" class="border border-(--input-border) p-2 w-full mb-2 rounded-md" placeholder="Antwort hier eingeben..." required rows="3"></textarea>
           <button class="btn-primary px-4 py-2 rounded-md" type="submit">Antworten</button>
           -->
           <button type="button" class="btn-primary px-4 py-2 rounded-md text-white btn-edit-question">Bearbeiten</button>
         `;
         form.addEventListener('submit', async e => {
           e.preventDefault();
           const data = { question: q.question, answer: form.answer.value };
           try {
             const resp = await fetch('/api/admin/answer', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(data),
             });
             if (resp.ok) {
               div.remove();
               updateOpenCount(Math.max(0, parseInt(openCountSpan.textContent) - 1));
               loadAnswered();
             } else {
               console.error('Answer submission failed:', await resp.json());
             }
           } catch (err) {
             console.error('Answer submission error:', err);
           }
         });

         const editButton = form.querySelector('.btn-edit-question');
         editButton.addEventListener('click', () => {
             document.getElementById('question-edit-label').textContent = q.question;
             document.getElementById('question-edit-id').value = q.id;

             const translationEl = document.getElementById('question-edit-translation');
             if (q.translation) {
                 translationEl.textContent = q.translation;
                 translationEl.style.display = 'block';
             } else {
                 translationEl.style.display = 'none';
             }

             const answeredInDiv = document.getElementById('question-answered-in');
             if (answeredInDiv) {
                 answeredInDiv.style.display = 'none';
                 answeredInDiv.textContent = '';
             }

             // Disable the button initially
             const markAsAnsweredBtn = document.getElementById('mark-as-answered-btn');
             markAsAnsweredBtn.disabled = true;
             markAsAnsweredBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
             markAsAnsweredBtn.classList.remove('btn-primary');

             document.getElementById('question-edit-banner').classList.remove('hidden');
             document.getElementById('question-context-actions').classList.remove('hidden');
             document.getElementById('delete-btn').classList.add('hidden');
             document.getElementById('save-btn').classList.add('hidden');
             showEditor();
             // Manually trigger change check to set initial button states
             document.getElementById('headline-input').dispatchEvent(new Event('input'));
         });

         div.appendChild(form);
         if (insertBefore) {
           openList.insertBefore(div, insertBefore);
         } else {
           openList.appendChild(div);
         }
       });
       openOffset += 100;
       // Add load more button if we got 100 items
       if (questions.length === 100) {
        let loadMoreBtn = document.getElementById('load-more-open');
        if (!loadMoreBtn) {
          loadMoreBtn = document.createElement('button');
          loadMoreBtn.id = 'load-more-open';
          loadMoreBtn.className = 'mt-4 px-4 py-2 bg-(--accent-color) text-white rounded hover:bg-opacity-80';
          loadMoreBtn.textContent = 'Mehr laden';
          loadMoreBtn.addEventListener('click', () => loadOpen(true));
          openList.appendChild(loadMoreBtn);
        }
      } else {
        // Remove load more if exists
        const loadMoreBtn = document.getElementById('load-more-open');
        if (loadMoreBtn) loadMoreBtn.remove();
      }
    } catch (err) {
      if (!append) openList.innerHTML = '<div class="text-red-500">Fehler beim Laden der offenen Fragen.</div>';
      console.error('Error loading unanswered questions:', err);
    }
  }

  async function handleDelete(questions) {
    if (!questions || questions.length === 0) return;
    const text = questions.length === 1
      ? `Soll die folgende Frage wirklich gelöscht werden?\n\n"${questions[0]}"`
      : `Sollen ${questions.length} Fragen wirklich gelöscht werden?`;
    if (!confirm(text)) return;
    try {
      const resp = await fetch('/api/admin/unanswered', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions }),
      });
      if (resp.ok) {
        selectedQuestions.clear();
        deleteSelectedBtn.classList.add('hidden');
        loadOpen();
      } else {
        console.error('Delete failed:', await resp.json());
      }
    } catch (err)
    {
      console.error('Delete error:', err);
    }
  }

  async function loadAnswered(append = false) {
    if (!append) {
      answeredList.innerHTML = '';
      answeredOffset = 0;
    }
    try {
      const pairs = await fetchAndParse(`/api/admin/answered?offset=${answeredOffset}`);
      if (!Array.isArray(pairs)) {
        if (!append) answeredList.innerHTML = '<div class="text-gray-500">Keine beantworteten Fragen gefunden.</div>';
        return;
      }
      const qFilter = questionSearch.value.toLowerCase();
      const filtered = pairs.filter(p => !qFilter || p.question.toLowerCase().includes(qFilter));
      if (filtered.length === 0 && !append) {
        answeredList.innerHTML = '<div class="text-gray-500">Keine beantworteten Fragen gefunden.</div>';
        return;
      }
       const loadMoreBtn = document.getElementById('load-more-answered');
       const insertBefore = append && loadMoreBtn ? loadMoreBtn : null;
       filtered.forEach(p => {
         const div = document.createElement('div');
         div.className = 'border border-(--border-color) p-4 rounded-lg';
         const form = document.createElement('form');

         let answerValue = p.answer || '';
          if (p.HochschuhlABC && p.HochschuhlABC.article && p.HochschuhlABC.description) {
            answerValue = `${p.HochschuhlABC.article}<br><br>${p.HochschuhlABC.description}`;
         }

         form.innerHTML = `
           <p class="mb-2 font-medium">${p.question}</p>
           <input type="hidden" name="question" value="${p.question}">
           <div class="border border-gray-300 p-2 w-full mb-2 rounded-md">${answerValue}</div>
           <div class="flex space-x-2">
             <button type="button" class="btn-secondary px-4 py-2 rounded-md edit-again-btn">erneut Bearbeiten</button>
           </div>
         `;

         form.querySelector('.edit-again-btn').addEventListener('click', () => {
           document.getElementById('question-edit-label').textContent = p.question;
           document.getElementById('question-edit-id').value = p.id;

           const translationEl = document.getElementById('question-edit-translation');
           if (p.translation) {
               translationEl.textContent = p.translation;
               translationEl.style.display = 'block';
           } else {
               translationEl.style.display = 'none';
           }

           const answeredInDiv = document.getElementById('question-answered-in');
            if (p.HochschuhlABC && p.HochschuhlABC.article) {
                answeredInDiv.style.display = 'block';
                answeredInDiv.textContent = `Beantwortet in: ${p.HochschuhlABC.article}`;
            } else {
               answeredInDiv.style.display = 'none';
               answeredInDiv.textContent = '';
           }

           const markAsAnsweredBtn = document.getElementById('mark-as-answered-btn');
           markAsAnsweredBtn.disabled = true;
           markAsAnsweredBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
           markAsAnsweredBtn.classList.remove('btn-primary');

           document.getElementById('question-edit-banner').classList.remove('hidden');
           document.getElementById('question-context-actions').classList.remove('hidden');
           document.getElementById('delete-btn').classList.add('hidden');
           document.getElementById('save-btn').classList.add('hidden');
           showEditor();
           document.getElementById('headline-input').dispatchEvent(new Event('input'));
         });
         div.appendChild(form);
         if (insertBefore) {
           answeredList.insertBefore(div, insertBefore);
         } else {
           answeredList.appendChild(div);
         }
       });
       answeredOffset += 100;
       // Add load more button if we got 100 items
       if (questions.length === 100) {
        let loadMoreBtn = document.getElementById('load-more-answered');
        if (!loadMoreBtn) {
          loadMoreBtn = document.createElement('button');
          loadMoreBtn.id = 'load-more-answered';
          loadMoreBtn.className = 'mt-4 px-4 py-2 bg-(--accent-color) text-white rounded hover:bg-opacity-80';
          loadMoreBtn.textContent = 'Mehr laden';
          loadMoreBtn.addEventListener('click', () => loadAnswered(true));
          answeredList.appendChild(loadMoreBtn);
        }
      } else {
        // Remove load more if exists
        const loadMoreBtn = document.getElementById('load-more-answered');
        if (loadMoreBtn) loadMoreBtn.remove();
      }
    } catch (err) {
      if (!append) answeredList.innerHTML = '<div class="text-red-500">Fehler beim Laden der beantworteten Fragen.</div>';
      console.error('Error loading answered questions:', err);
    }
  }

  function showOpen() {
    openList.classList.remove('hidden');
    answeredList.classList.add('hidden');
    tabOpen.classList.remove('btn-secondary');
    tabOpen.classList.add('btn-primary');
    tabAnswered.classList.remove('btn-primary');
    tabAnswered.classList.add('btn-secondary');
    selectedQuestions.clear();
    deleteSelectedBtn.classList.add('hidden');
    loadOpen();
  }

  function showAnswered() {
    answeredList.classList.remove('hidden');
    openList.classList.add('hidden');
    tabAnswered.classList.remove('btn-secondary');
    tabAnswered.classList.add('btn-primary');
    tabOpen.classList.remove('btn-primary');
    tabOpen.classList.add('btn-secondary');
    loadAnswered();
  }

  

  tabOpen.addEventListener('click', showOpen);
  tabAnswered.addEventListener('click', showAnswered);
  questionSearch.addEventListener('input', () => {
    if (!openList.classList.contains('hidden')) {
        loadOpen();
    }
    if (!answeredList.classList.contains('hidden')) {
        loadAnswered();
    }
  });
  deleteSelectedBtn.addEventListener('click', () => handleDelete(Array.from(selectedQuestions)));

  // Initial state
  showOpen();

  markAsAnsweredBtn.addEventListener('click', handleMarkAsAnswered);

  return { loadOpen, loadAnswered };
}