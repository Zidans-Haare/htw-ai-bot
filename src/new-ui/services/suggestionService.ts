
export interface Suggestion {
    article: string;
    description: string;
}

export const suggestionService = {
    async getSuggestions(): Promise<Suggestion[]> {
        try {
            const response = await fetch('/api/suggestions');
            if (!response.ok) {
                throw new Error('Failed to fetch suggestions');
            }
            return await response.json();
        } catch (error) {
            console.error('Error loading suggestions:', error);
            return [];
        }
    }
};
