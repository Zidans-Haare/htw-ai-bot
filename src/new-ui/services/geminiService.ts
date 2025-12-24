
export class GeminiService {
  async generateResponse(
    prompt: string,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[],
    conversationId: string | null = null,
    isThinking: boolean = false,
    userMetadata?: {
      anonymousUserId?: string;
      userDisplayName?: string;
      profilePreferences?: any;
    }
  ) {
    try {
      // Bridge to existing HTW Bot Backend
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt,
          conversationId: conversationId,
          timezoneOffset: new Date().getTimezoneOffset(),
          anonymousUserId: userMetadata?.anonymousUserId,
          userDisplayName: userMetadata?.userDisplayName,
          profilePreferences: userMetadata?.profilePreferences
        })
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      // The backend returns { response: "...", conversationId: "..." }
      // We return the text and the new conversationId
      return {
        text: data.response || "No response received.",
        conversationId: data.conversationId
      };
    } catch (error) {
      console.error("Backend Error:", error);
      throw error;
    }
  }

  async sendMessageStream(prompt: string, history: any[], userMetadata?: any) {
    // Streaming not fully ported for this quick integration, falling back to generateResponse structure
    return this.generateResponse(prompt, history, null, false, userMetadata);
  }
}

export const gemini = new GeminiService();
