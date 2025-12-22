let providerModule = null;

async function loadProvider(provider) {
  if (!providerModule || providerModule.name !== provider) {
    let modulePath;
    switch (provider) {
      case 'openai':
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

  // Known models that support tool calls
  const toolCallSupportedModels = {
    // OpenAI models
    'gpt-4': true,
    'gpt-4-turbo': true,
    'gpt-4-turbo-preview': true,
    'gpt-4-0125-preview': true,
    'gpt-4-1106-preview': true,
    'gpt-4o': true,
    'gpt-4o-mini': true,
    'gpt-3.5-turbo': true,
    'gpt-3.5-turbo-0125': true,
    'gpt-3.5-turbo-1106': true,
    // Custom OpenAI-compatible models that support tool calls
    'openai-gpt-oss-120b': true,

    // Google models
    'gemini-1.5-pro': true,
    'gemini-1.5-flash': true,
    'gemini-pro': true,

    // Anthropic models
    'claude-3-opus': true,
    'claude-3-sonnet': true,
    'claude-3-haiku': true,
    'claude-3-5-sonnet': true,

    // XAI models
    'grok-beta': true,
    'grok-vision-beta': true,
  };

  // Check if the specific model is known to support tool calls
  if (model && toolCallSupportedModels[model.toLowerCase()]) {
    return true;
  }

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
        return true;
      }
    } catch (error) {
      console.log(`Failed to query model capabilities for ${model}:`, error.message);
      // Continue to fallback test
    }
  }

  // For unknown models, try a simple test call with tools
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

    await chatCompletion(testMessages, testOptions);
    return true;
  } catch (error) {
    console.log(`Tool call support test failed for ${provider}/${model}:`, error.message);
    return false;
  }
}

module.exports = {
  chatCompletion,
  chatCompletionStream,
  supportsToolCalls,
};
