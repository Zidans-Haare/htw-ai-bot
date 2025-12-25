import { fetchAndParse } from './utils.js';

let documentsView;
let documentsList;
let documentsOffset = 0;

export function initDocuments() {
    documentsView = document.getElementById('documents-view');
    if (!documentsView) {
        console.error('Documents view not found');
        return;
    }

    // Create the UI structure
    documentsView.innerHTML = `
        <div class="p-4 bg-white shadow-md rounded-lg">
            <h2 class="text-xl font-semibold mb-4">Dokumente hochladen</h2>
            <div class="flex items-end space-x-4">
                <div>
                    <input type="file" id="document-upload-input" accept=".pdf,.docx,.md,.odt,.ods,.odp,.xlsx" class="hidden"/>
                    <label for="document-upload-input" class="cursor-pointer btn-primary px-6 py-2 rounded-full">Dokument wählen</label>
                    <p id="document-file-name" class="text-sm text-gray-500 mt-2">Kein Dokument ausgewählt</p>
                </div>
                <textarea id="document-description-input" class="grow p-2 border border-(--input-border) rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-(--accent-color)" placeholder="Dokument-Beschreibung..."></textarea>
                <div class="custom-select-wrapper w-40">
                  <select id="document-access-level-input" class="custom-select">
                    <option value="public">Öffentlich</option>
                    <option value="intern">Intern</option>
                    <option value="employee" selected>Mitarbeiter</option>
                    <option value="manager">Führungskraft</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div class="custom-select-arrow">
                    <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
                <button id="document-upload-button" class="btn-primary px-6 py-2 rounded-full">Hochladen</button>
            </div>
        </div>
        <div class="mt-6 p-4 bg-white shadow-md rounded-lg">
            <h2 class="text-xl font-semibold mb-4">Dokument-Galerie</h2>
            <div id="documents-list" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <!-- PDFs will be loaded here -->
            </div>
        </div>
    `;

    documentsList = document.getElementById('documents-list');
    const uploadInput = document.getElementById('document-upload-input');
    const descriptionInput = document.getElementById('document-description-input');
    const accessLevelInput = document.getElementById('document-access-level-input');
    const uploadButton = document.getElementById('document-upload-button');
    const fileNameDisplay = document.getElementById('document-file-name');

    uploadInput.addEventListener('change', () => {
        if (uploadInput.files.length > 0) {
            fileNameDisplay.textContent = uploadInput.files[0].name;
        } else {
            fileNameDisplay.textContent = 'Kein Dokument ausgewählt';
        }
    });

    uploadButton.addEventListener('click', () => handleDocumentUpload(uploadInput, descriptionInput, accessLevelInput));

    // Load documents when the view is shown
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (!documentsView.classList.contains('hidden')) {
                    loadDocuments();
                }
            }
        }
    });

    observer.observe(documentsView, { attributes: true });

    // Initial load if view is already visible
    if (!documentsView.classList.contains('hidden')) {
        loadDocuments();
    }
}

async function loadDocuments(append = false) {
    if (!append) {
        documentsOffset = 0;
        documentsList.innerHTML = '';
    }
    try {
        const documents = await fetchAndParse(`/api/admin/documents?offset=${documentsOffset}`);
        renderDocuments(documents, append);
        documentsOffset += 100;
        if (documents.length === 100) {
            let loadMoreBtn = document.getElementById('load-more-documents');
            if (!loadMoreBtn) {
                loadMoreBtn = document.createElement('div');
                loadMoreBtn.id = 'load-more-documents';
                loadMoreBtn.className = 'col-span-full text-center mt-4';
                loadMoreBtn.innerHTML = '<button class="px-4 py-2 bg-(--accent-color) text-white rounded hover:bg-opacity-80">Mehr laden</button>';
                loadMoreBtn.querySelector('button').addEventListener('click', () => loadDocuments(true));
                documentsList.appendChild(loadMoreBtn);
            }
        } else {
            const loadMoreBtn = document.getElementById('load-more-documents');
            if (loadMoreBtn) loadMoreBtn.remove();
        }
    } catch (error) {
        console.error('Error loading documents:', error);
        if (!append) documentsList.innerHTML = '<p class="text-red-500">Fehler beim Laden der Dokumente.</p>';
    }
}

function renderDocuments(documents, append = false) {
    if (!documents || documents.length === 0) {
        if (!append) documentsList.innerHTML = '<p class="text-gray-500">Keine Dokumente gefunden.</p>';
        return;
    }

    const html = documents.map(doc => `
        <div class="group border rounded-lg overflow-hidden shadow-sm flex flex-col">
            <div class="relative">
                <div class="w-full h-48 bg-gray-200 flex items-center justify-center">
                    <i class="fas fa-file fa-3x text-blue-500"></i>
                </div>
                  <div class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                       <button class="view-document-btn text-white hover:text-green-400 transition-colors" data-url="/uploads/documents/${doc.filepath}" title="Anzeigen">
                          <i class="fas fa-eye fa-lg"></i>
                       </button>
                       <button class="copy-url-btn text-white hover:text-(--accent-color) transition-colors ml-4" data-url="/uploads/documents/${doc.filepath}" title="URL kopieren">
                          <i class="fas fa-copy fa-lg"></i>
                       </button>
                       <button class="edit-document-btn text-white hover:text-yellow-400 transition-colors ml-4" data-id="${doc.id}" data-description="${doc.description || ''}" data-access-level="${doc.access_level || 'employee'}" title="Beschreibung bearbeiten">
                          <i class="fas fa-pencil-alt fa-lg"></i>
                       </button>
                      <button class="delete-document-btn text-white hover:text-red-500 transition-colors ml-4" data-id="${doc.id}" title="Löschen">
                         <i class="fas fa-trash-alt fa-lg"></i>
                      </button>
                 </div>
            </div>
            <div class="p-2">
                <p class="text-sm text-gray-700 truncate" title="${doc.description || ''}">${doc.description || ''}</p>
                <p class="text-xs text-gray-500 truncate" title="${doc.filepath} (${doc.file_type})">${doc.filepath} (${doc.file_type})</p>
            </div>
        </div>
    `).join('');

    if (append) {
        const loadMoreBtn = document.getElementById('load-more-documents');
        if (loadMoreBtn) {
            loadMoreBtn.insertAdjacentHTML('beforebegin', html);
        } else {
            documentsList.insertAdjacentHTML('beforeend', html);
        }
    } else {
        documentsList.innerHTML = html;
    }

    // Add event listeners for the new buttons
    documentsList.querySelectorAll('.view-document-btn').forEach(button => {
        button.addEventListener('click', handleViewDocument);
    });
    documentsList.querySelectorAll('.copy-url-btn').forEach(button => {
        button.addEventListener('click', handleCopyUrl);
    });
    documentsList.querySelectorAll('.edit-document-btn').forEach(button => {
        button.addEventListener('click', handleEditDocument);
    });
    documentsList.querySelectorAll('.delete-document-btn').forEach(button => {
        button.addEventListener('click', handleDeleteDocument);
    });
}

async function handleDocumentUpload(inputElement, descriptionElement, accessLevelElement) {
    const file = inputElement.files[0];
    const description = descriptionElement.value.trim();
    const accessLevel = accessLevelElement ? accessLevelElement.value : 'employee';

    if (!file) {
        alert('Noch kein Dokument gewählt.');
        return;
    }
    if (!description) {
        alert('Bitte eine Beschreibung eingeben.');
        return;
    }

    const formData = new FormData();
    formData.append('document', file);
    formData.append('description', description);
    formData.append('access_level', accessLevel);

    try {
        const response = await fetch('/api/admin/documents/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        if (!response.ok) {
            let errorMessage = 'Upload fehlgeschlagen';
            try {
                const text = await response.text();
                console.error('Error response text:', text);
                try {
                    const errorData = JSON.parse(text);
                    console.error('Parsed error data:', errorData);
                    errorMessage = errorData.message || errorMessage;
                } catch (jsonError) {
                    console.error('Failed to parse as JSON:', jsonError);
                    errorMessage = 'Server error: ' + text.substring(0, 100);
                }
            } catch (e) {
                console.error('Failed to read response:', e);
                errorMessage = 'Failed to read server response';
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();
        inputElement.value = ''; // Clear the input
        descriptionElement.value = ''; // Clear the textarea
        document.getElementById('document-file-name').textContent = 'Kein Dokument ausgewählt';
        await loadDocuments(); // Refresh the gallery
    } catch (error) {
        console.error('Error uploading document:', error);
        alert(`Fehler beim Hochladen des Dokuments: ${error.message}`);
    }
}

function handleViewDocument(event) {
    const url = event.currentTarget.dataset.url;
    window.open(url, '_blank');
}

function handleCopyUrl(event) {
    const url = event.currentTarget.dataset.url;
    const fullUrl = window.location.origin + url;
    navigator.clipboard.writeText(fullUrl).then(() => {
        alert('URL in die Zwischenablage kopiert!');
    }).catch(err => {
        console.error('Could not copy text: ', err);
        alert('Fehler beim Kopieren der URL.');
    });
}

function handleEditDocument(event) {
    const button = event.currentTarget;
    const id = button.dataset.id;
    const currentDescription = button.dataset.description;
    const currentAccessLevel = button.dataset.accessLevel || 'employee';

    const modal = document.getElementById('edit-document-modal');
    const descriptionInput = document.getElementById('edit-document-description-input');
    const accessLevelInput = document.getElementById('edit-document-access-level');
    const cancelButton = document.getElementById('edit-document-cancel');
    const saveButton = document.getElementById('edit-document-save');

    descriptionInput.value = currentDescription;
    if (accessLevelInput) accessLevelInput.value = currentAccessLevel;

    modal.classList.remove('hidden');

    const closeAndCleanup = () => {
        modal.classList.add('hidden');
        saveButton.onclick = null; // Remove the specific listener
    };

    cancelButton.onclick = closeAndCleanup;

    saveButton.onclick = async () => {
        const newDescription = descriptionInput.value.trim();
        const newAccessLevel = accessLevelInput ? accessLevelInput.value : 'employee';

        if (newDescription === currentDescription && newAccessLevel === currentAccessLevel) {
            closeAndCleanup();
            return;
        }

        try {
            const response = await fetch(`/api/admin/documents/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ description: newDescription, access_level: newAccessLevel })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Update fehlgeschlagen');
            }

            await loadDocuments(); // Refresh the gallery
        } catch (error) {
            console.error('Error updating document description:', error);
            alert(`Fehler beim Aktualisieren der Beschreibung: ${error.message}`);
        } finally {
            closeAndCleanup();
        }
    };
}

async function handleDeleteDocument(event) {
    const id = event.currentTarget.dataset.id;
    if (!confirm(`Sind Sie sicher, dass Sie das Dokument löschen möchten?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/documents/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Löschen fehlgeschlagen');
        }

        await loadDocuments(); // Refresh the gallery
    } catch (error) {
        console.error('Error deleting document:', error);
        alert(`Fehler beim Löschen des Dokuments: ${error.message}`);
    }
}