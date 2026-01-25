let providerModule = null;

async function loadProvider(provider) {
  if (!providerModule || providerModule.name !== provider) {
    let modulePath;
    switch (provider) {
      case 'openai':
      case 'chatAi':
        modulePath = './openaiProvider.js';
        break;
      case 'google':
        modulePath = './googleProvider.js';
        break;
      case 'claude':
        modulePath = './claudeProvider.js';
        break;
      case 'xai':
        modulePath = './xaiProvider.js';
        break;
      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }
    providerModule = await import(modulePath);
    providerModule.name = provider;
  }
  return providerModule;
}

async function chatCompletion(messages, options = {}) {
  const provider = options.backend ? (process.env.BACKEND_AI_PROVIDER || process.env.AI_PROVIDER) : process.env.AI_PROVIDER;
  if (!provider) {
    throw new Error('AI_PROVIDER environment variable not set.');
  }
  const module = await loadProvider(provider);
  return module.chatCompletion(messages, options);
}

async function* chatCompletionStream(messages, options = {}) {
  const provider = options.backend ? (process.env.BACKEND_AI_PROVIDER || process.env.AI_PROVIDER) : process.env.AI_PROVIDER;
  if (!provider) {
    throw new Error('AI_PROVIDER environment variable not set.');
  }
  const module = await loadProvider(provider);
  yield* module.chatCompletionStream(messages, options);
}

// Cache for tool support checks to avoid repeated API calls
const toolSupportCache = new Map();

/**
 * Checks if the current AI provider and model support tool calls
 * @param {object} options - Options object
 * @returns {Promise<boolean>} True if tool calls are supported
 */
async function supportsToolCalls(options = {}) {
  const provider = options.backend ? (process.env.BACKEND_AI_PROVIDER || process.env.AI_PROVIDER) : process.env.AI_PROVIDER;
  if (!provider) {
    return false;
  }

  const prefix = options.backend ? 'BACKEND_' : '';
  const model = options.model || process.env[prefix + 'AI_MODEL'];

  // Create a cache key based on provider and model
  const cacheKey = `${provider}:${model}`;

  // Check cache first
  if (toolSupportCache.has(cacheKey)) {
    return toolSupportCache.get(cacheKey);
  }

  // Define a helper to set cache and return result
  const cacheAndReturn = (result) => {
    toolSupportCache.set(cacheKey, result);
    return result;
  };

  // For OpenAI provider, try to query model capabilities via API
  if (provider === 'openai') {
    try {
      const module = await loadProvider(provider);
      const client = module.getClient(options.apiKey, options.backend);

      // Try to get model info from OpenAI API
      const modelInfo = await client.models.retrieve(model);
      console.log(`Model ${model} info:`, modelInfo);

      // Check if model supports function calling (some OpenAI-compatible APIs may include this info)
      if (modelInfo && modelInfo.capabilities && modelInfo.capabilities.function_calling) {
        console.log(`Model ${model} explicitly supports function calling`);
        return cacheAndReturn(true);
      }
    } catch (error) {
      console.log(`Failed to query model capabilities for ${model}:`, error.message);
      // Continue to fallback test
    }
  }

  // Fallback: try a simple test call with tools
  // This works for any provider by attempting to use a tool and seeing if it fails or succeeds
  try {
    const testMessages = [{ role: 'user', content: 'Hello' }];
    const testOptions = {
      ...options,
      maxTokens: 1,
      tools: [{
        type: 'function',
        function: {
          name: 'test_tool',
          description: 'Test tool for capability check',
          parameters: { type: 'object', properties: {} }
        }
      }]
    };

    // If this call succeeds (doesn't throw), we assume tool support is either present or benignly ignored.
    // However, some providers might ignore tools silently. 
    // Ideally we'd check if `tool_calls` is in the response, but we can't force the model to use it with 'Hello'.
    // The main goal is to check if passing 'tools' CAUSES an error (e.g. 400 Bad Request).
    await chatCompletion(testMessages, testOptions);
    return cacheAndReturn(true);
  } catch (error) {
    console.log(`Tool call support test failed for ${provider}/${model}:`, error.message);
    // If the error specifically mentions tools/functions being unsupported, return false.
    // Otherwise, it might be a network error, but we'll assume false to be safe for now 
    // or maybe true if we want to be optimistic? 
    // Given the user wants to support "unknown" models, assuming false on error is safer 
    // to prevent breaking the main chat loop.
    return cacheAndReturn(false);
  }
}

module.exports = {
  chatCompletion,
  chatCompletionStream,
  supportsToolCalls,
};
