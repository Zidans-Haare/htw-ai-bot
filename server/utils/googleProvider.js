const { convertToolsToProvider, convertToolCallsFromProvider } = require('./toolConverter');

let GoogleGenerativeAI = null;

async function loadGoogleSDK() {
  if (!GoogleGenerativeAI) {
    const { GoogleGenerativeAI: SDK } = await import('@google/generative-ai');
    GoogleGenerativeAI = SDK;
  }
  return GoogleGenerativeAI;
}

let sharedClient = null;

async function getClient(explicitKey = null, backend = false) {
  const prefix = backend ? 'BACKEND_' : '';
  const apiKey = explicitKey || process.env[prefix + 'AI_GOOGLE_API_KEY'] || process.env[prefix + 'AI_API_KEY'];
  if (!apiKey) {
    throw new Error(`${prefix}AI_GOOGLE_API_KEY or ${prefix}AI_API_KEY environment variable not set.`);
  }

  if (explicitKey) {
    const SDK = await loadGoogleSDK();
    return new SDK(apiKey);
  }

  if (!sharedClient) {
    const SDK = await loadGoogleSDK();
    sharedClient = new SDK(apiKey);
  }

  return sharedClient;
}

async function chatCompletion(messages, options = {}) {
  const prefix = options.backend ? 'BACKEND_' : '';
  const client = await getClient(options.apiKey, options.backend);
  const modelName = options.model || process.env[prefix + 'AI_GOOGLE_MODEL'] || process.env[prefix + 'AI_MODEL'] || 'gemini-2.5-flash';

  // Convert OpenAI tool format to Google function calling format using abstraction layer
  const tools = convertToolsToProvider(options.tools, 'google');

  const model = client.getGenerativeModel({
    model: modelName,
    tools: tools
  });

  // Convert messages to Gemini format
  const contents = messages.map(msg => {
    if (msg.role === 'tool') {
      // Handle tool result messages for Google function calling
      const functionName = msg.function_name || msg.tool_call_id; // Prefer function_name for Google compatibility
      return {
        role: 'user',
        parts: [{
          functionResponse: {
            name: functionName,
            response: JSON.parse(msg.content)
          }
        }]
      };
    } else {
      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      };
    }
  });

  const config = {
    temperature: options.temperature || parseFloat(process.env[prefix + 'AI_TEMPERATURE']),
    maxOutputTokens: options.maxTokens || parseInt(process.env[prefix + 'AI_MAX_TOKENS']),
  };

  const result = await model.generateContent({
    contents,
    generationConfig: config,
  });

  const response = result.response;

  // Check if response contains function calls
  const functionCalls = response.functionCalls();
  if (functionCalls && functionCalls.length > 0) {
    // Convert Google function calls to OpenAI tool_calls format using abstraction layer
    const tool_calls = convertToolCallsFromProvider(functionCalls, 'google');

    return {
      content: response.text() || '',
      tool_calls: tool_calls,
      finish_reason: 'tool_calls'
    };
  }

  return {
    content: response.text() || '',
    tool_calls: [],
    finish_reason: 'stop'
  };
}

async function* chatCompletionStream(messages, options = {}) {
  const prefix = options.backend ? 'BACKEND_' : '';
  const client = await getClient(options.apiKey, options.backend);
  const modelName = options.model || process.env[prefix + 'AI_GOOGLE_MODEL'] || process.env[prefix + 'AI_MODEL'] || 'gemini-2.5-flash';
  const model = client.getGenerativeModel({ model: modelName });

  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const config = {
    temperature: options.temperature || parseFloat(process.env[prefix + 'AI_TEMPERATURE']),
    maxOutputTokens: options.maxTokens || parseInt(process.env[prefix + 'AI_MAX_TOKENS']),
  };

  const streamingResponse = await model.generateContentStream({
    contents,
    generationConfig: config,
  });

  for await (const chunk of streamingResponse.stream) {
    const token = chunk.text();
    if (token) {
      yield { token };
    }
  }
}

module.exports = {
  chatCompletion,
  chatCompletionStream,
};
