
export class GeminiService {
  async generateResponse(
    prompt: string,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[],
    conversationId: string | null = null,
    settings?: any, // Using any to avoid circular dependency or import AppSettings
    userMetadata?: {
      anonymousUserId?: string;
      userDisplayName?: string;
      profilePreferences?: any;
    }
  ) {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };

      if (settings?.apiKey) {
        headers['x-user-api-key'] = settings.apiKey;
      }

      // Bridge to existing HTW Bot Backend
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          prompt: prompt,
          conversationId: conversationId,
          timezoneOffset: new Date().getTimezoneOffset(),
          anonymousUserId: userMetadata?.anonymousUserId,
          userDisplayName: userMetadata?.userDisplayName,
          profilePreferences: userMetadata?.profilePreferences,
          temperature: settings?.temperature,
          maxTokens: settings?.maxTokens
        })
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      // The backend returns { response: "...", conversationId: "...", images: [...] }
      // We return the text and the new conversationId
      return {
        text: data.response || "No response received.",
        conversationId: data.conversationId,
        images: data.images
      };
    } catch (error) {
      console.error("Backend Error:", error);
      throw error;
    }
  }

  async sendMessageStream(prompt: string, history: any[], settings?: any, userMetadata?: any) {
    // Streaming not fully ported for this quick integration, falling back to generateResponse structure
    return this.generateResponse(prompt, history, null, settings, userMetadata);
  }
}

export const gemini = new GeminiService();
