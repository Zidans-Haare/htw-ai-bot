
export class GeminiService {
  async generateResponse(
    prompt: string,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[],
    // conversationId and isThinking are optional to match existing calls
    conversationId: string | null = null,
    isThinking: boolean = false
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

  async sendMessageStream(prompt: string, history: any[]) {
    // Streaming not fully ported for this quick integration, falling back to generateResponse structure
    return this.generateResponse(prompt, history);
  }
}

export const gemini = new GeminiService();
