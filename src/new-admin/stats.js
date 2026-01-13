export function initStats() {
    const statsBtn = document.getElementById('btn-stats');
    const statsView = document.getElementById('stats-view');

    if (!statsBtn || !statsView) return;

    statsBtn.addEventListener('click', () => {
        loadStats();
    });
}

export async function loadStats() {
    const statsView = document.getElementById('stats-view');
    const statsContent = document.getElementById('stats-content');

    if (!statsView || !statsContent) return;

    try {
        const response = await fetch('/api/admin/stats');
        if (!response.ok) throw new Error('Failed to fetch stats');
        const data = await response.json();

        statsContent.innerHTML = `
            <div class="p-6 space-y-4">
                <h2 class="text-2xl font-bold">Statistiken</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="bg-white p-4 rounded-lg shadow">
                        <h3 class="text-lg font-semibold mb-2">Gesamt Einträge</h3>
                        <p class="text-3xl font-bold text-blue-600">${data.total}</p>
                    </div>
                    <div class="bg-white p-4 rounded-lg shadow">
                        <h3 class="text-lg font-semibold mb-2">Einträge pro Editor</h3>
                        <ul class="space-y-1">
                            ${Object.entries(data.perEditor).map(([editor, count]) => `
                                <li class="flex justify-between">
                                    <span>${editor}</span>
                                    <span class="font-semibold">${count}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading stats:', error);
        statsContent.innerHTML = '<p class="text-red-500">Fehler beim Laden der Statistiken.</p>';
    }
}