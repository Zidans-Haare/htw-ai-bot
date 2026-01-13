import { fetchAndParse } from './utils.js';

let imagesView;
let imagesList;
let imagesOffset = 0;

function buildPreviewUrl(filename, width = 600) {
    if (!filename) return '';
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex === -1) {
        return `/uploads/images/${filename}_${width}px`;
    }
    const base = filename.slice(0, dotIndex);
    const ext = filename.slice(dotIndex);
    return `/uploads/images/${base}_${width}px${ext}`;
}

export function initImages() {
    imagesView = document.getElementById('images-view');
    if (!imagesView) {
        console.error('Images view not found');
        return;
    }

    // Create the UI structure
    imagesView.innerHTML = `
        <div class="p-4 bg-white shadow-md rounded-lg">
            <h2 class="text-xl font-semibold mb-4">Bilder hochladen</h2>
            <div class="flex items-end space-x-4">
                <div>
                    <input type="file" id="image-upload-input" accept="image/*" class="hidden"/>
                    <label for="image-upload-input" class="cursor-pointer btn-primary px-6 py-2 rounded-full">Bild wählen</label>
                    <p id="image-file-name" class="text-sm text-gray-500 mt-2">Kein Bild ausgewählt</p>
                </div>
                <input type="text" id="image-source-input" class="p-2 border border-(--input-border) rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-(--accent-color)" placeholder="Quelle (Pflichtfeld)...">
                <textarea id="image-description-input" class="grow p-2 border border-(--input-border) rounded-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-(--accent-color)" placeholder="Bildbeschreibung..."></textarea>
                <button id="image-upload-button" class="btn-primary px-6 py-2 rounded-full">Hochladen</button>
            </div>
        </div>
        <div class="mt-6 p-4 bg-white shadow-md rounded-lg">
            <h2 class="text-xl font-semibold mb-4">Galerie</h2>
            <div id="images-list" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <!-- Images will be loaded here -->
            </div>
        </div>
    `;

    imagesList = document.getElementById('images-list');
    const uploadInput = document.getElementById('image-upload-input');
    const sourceInput = document.getElementById('image-source-input');
    const descriptionInput = document.getElementById('image-description-input');
    const uploadButton = document.getElementById('image-upload-button');
    const fileNameDisplay = document.getElementById('image-file-name');

    uploadInput.addEventListener('change', () => {
        if (uploadInput.files.length > 0) {
            fileNameDisplay.textContent = uploadInput.files[0].name;
        } else {
            fileNameDisplay.textContent = 'Kein Bild ausgewählt';
        }
    });

    uploadButton.addEventListener('click', () => handleImageUpload(uploadInput, sourceInput, descriptionInput));

    // Load images when the view is shown
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (!imagesView.classList.contains('hidden')) {
                    loadImages();
                }
            }
        }
    });

    observer.observe(imagesView, { attributes: true });

    // Initial load if view is already visible
    if (!imagesView.classList.contains('hidden')) {
        loadImages();
    }
}

async function loadImages(append = false) {
    if (!append) {
        imagesOffset = 0;
        imagesList.innerHTML = '';
    }
    try {
        const images = await fetchAndParse(`/api/admin/images?offset=${imagesOffset}`);
        renderImages(images, append);
        imagesOffset += 100;
        if (images.length === 100) {
            let loadMoreBtn = document.getElementById('load-more-images');
            if (!loadMoreBtn) {
                loadMoreBtn = document.createElement('div');
                loadMoreBtn.id = 'load-more-images';
                loadMoreBtn.className = 'col-span-full text-center mt-4';
                loadMoreBtn.innerHTML = '<button class="px-4 py-2 bg-(--accent-color) text-white rounded hover:bg-opacity-80">Mehr laden</button>';
                loadMoreBtn.querySelector('button').addEventListener('click', () => loadImages(true));
                imagesList.appendChild(loadMoreBtn);
            }
        } else {
            const loadMoreBtn = document.getElementById('load-more-images');
            if (loadMoreBtn) loadMoreBtn.remove();
        }
    } catch (error) {
        console.error('Error loading images:', error);
        if (!append) imagesList.innerHTML = '<p class="text-red-500">Fehler beim Laden der Bilder.</p>';
    }
}

function renderImages(images, append = false) {
    if (!images || images.length === 0) {
        if (!append) imagesList.innerHTML = '<p class="text-gray-500">Keine Bilder gefunden.</p>';
        return;
    }

    const html = images.map(image => {
        return `
        <div class="group border rounded-lg overflow-hidden shadow-sm flex flex-col">
            <div class="relative">
                <img src="${buildPreviewUrl(image.filename, 600)}" alt="${image.description || image.filename}" class="w-full h-48 object-cover">
                 <div class="absolute inset-0 bg-transparent md:bg-black md:bg-opacity-50 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button class="copy-url-btn text-white hover:text-(--accent-color) transition-colors" data-url="/uploads/images/${image.filename}" title="URL kopieren">
                        <i class="fas fa-copy fa-lg"></i>
                    </button>
                    <button class="edit-image-btn text-white hover:text-yellow-400 transition-colors ml-4" data-filename="${image.filename}" data-description="${image.description || ''}" data-source="${image.source || ''}" title="Bearbeiten">
                        <i class="fas fa-pencil-alt fa-lg"></i>
                    </button>
                    <button class="delete-image-btn text-white hover:text-red-500 transition-colors ml-4" data-filename="${image.filename}" title="Löschen">
                        <i class="fas fa-trash-alt fa-lg"></i>
                    </button>
                </div>
            </div>
            <div class="p-2">
                <p class="text-sm text-gray-700 truncate" title="${image.description || ''}">${image.description || ''}</p>
                <p class="text-xs text-gray-500 truncate" title="Quelle: ${image.source || 'Unbekannt'}">Quelle: ${image.source || 'Unbekannt'}</p>
                <p class="text-xs text-gray-500 truncate" title="${image.filename}">${image.filename}</p>
            </div>
        </div>
        `;
    }).join('');

    if (append) {
        const loadMoreBtn = document.getElementById('load-more-images');
        if (loadMoreBtn) {
            loadMoreBtn.insertAdjacentHTML('beforebegin', html);
        } else {
            imagesList.insertAdjacentHTML('beforeend', html);
        }
    } else {
        imagesList.innerHTML = html;
    }

    // Add event listeners for the new buttons
    imagesList.querySelectorAll('.copy-url-btn').forEach(button => {
        button.addEventListener('click', handleCopyUrl);
    });
    imagesList.querySelectorAll('.edit-image-btn').forEach(button => {
        button.addEventListener('click', handleEditImage);
    });
    imagesList.querySelectorAll('.delete-image-btn').forEach(button => {
        button.addEventListener('click', handleDeleteImage);
    });
}

async function handleImageUpload(inputElement, sourceElement, descriptionElement) {
    const file = inputElement.files[0];
    const source = sourceElement.value.trim();
    const description = descriptionElement.value.trim();

    if (!file) {
        alert('Noch kein Bild gewählt.');
        return;
    }
    if (!source) {
        alert('Bitte eine Quelle angeben.');
        return;
    }
    if (!description) {
        alert('Bitte eine Beschreibung eingeben.');
        return;
    }

    const formData = new FormData();
    formData.append('image', file);
    formData.append('source', source);
    formData.append('description', description);

    try {
        const response = await fetch('/api/admin/images/upload', {
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
        sourceElement.value = ''; // Clear source
        descriptionElement.value = ''; // Clear the textarea
        document.getElementById('image-file-name').textContent = 'Kein Bild ausgewählt';
        await loadImages(); // Refresh the gallery
    } catch (error) {
        console.error('Error uploading image:', error);
        alert(`Fehler beim Hochladen des Bildes: ${error.message}`);
    }
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

function handleEditImage(event) {
    const button = event.currentTarget;
    const filename = button.dataset.filename;
    const currentDescription = button.dataset.description;
    const currentSource = button.dataset.source;

    const modal = document.getElementById('edit-image-modal');
    const preview = document.getElementById('edit-image-preview');
    const sourceInput = document.getElementById('edit-image-source-input');
    const descriptionInput = document.getElementById('edit-image-description-input');
    const cancelButton = document.getElementById('edit-image-cancel');
    const saveButton = document.getElementById('edit-image-save');

    preview.src = `/uploads/images/${filename}`;
    sourceInput.value = currentSource;
    descriptionInput.value = currentDescription;

    modal.classList.remove('hidden');

    const closeAndCleanup = () => {
        modal.classList.add('hidden');
        saveButton.onclick = null; // Remove the specific listener
    };

    cancelButton.onclick = closeAndCleanup;

    saveButton.onclick = async () => {
        const newDescription = descriptionInput.value.trim();
        const newSource = sourceInput.value.trim();

        if (newDescription === currentDescription && newSource === currentSource) {
            closeAndCleanup();
            return;
        }

        try {
            const response = await fetch(`/api/admin/images/${filename}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    description: newDescription,
                    source: newSource
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Update fehlgeschlagen');
            }

            await loadImages(); // Refresh the gallery
        } catch (error) {
            console.error('Error updating image description:', error);
            alert(`Fehler beim Aktualisieren der Beschreibung: ${error.message}`);
        } finally {
            closeAndCleanup();
        }
    };
}

async function handleDeleteImage(event) {
    const filename = event.currentTarget.dataset.filename;
    if (!confirm(`Sind Sie sicher, dass Sie das Bild "${filename}" löschen möchten?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/images/${filename}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Löschen fehlgeschlagen');
        }

        await loadImages(); // Refresh the gallery
    } catch (error) {
        console.error('Error deleting image:', error);
        alert(`Fehler beim Löschen des Bildes: ${error.message}`);
    }
}
