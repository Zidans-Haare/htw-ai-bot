/**
 * Centralized tool format conversion utilities
 * Converts between different AI provider tool formats
 */

/**
 * Convert OpenAI-style tools to provider-specific formats
 * @param {Array} tools - OpenAI format tools
 * @param {string} provider - Target provider ('openai', 'google', 'claude', etc.)
 * @returns {Array} Tools in provider-specific format
 */
function convertToolsToProvider(tools, provider) {
  if (!tools || !Array.isArray(tools)) return undefined;

  const converters = {
    openai: convertToOpenAI,
    google: convertToGoogle,
    claude: convertToClaude,
    xai: convertToXAI,
  };

  const converter = converters[provider];
  if (!converter) {
    console.warn(`No tool converter found for provider: ${provider}`);
    return tools; // fallback to original format
  }

  return converter(tools);
}

/**
 * Convert tool results from provider format back to OpenAI format
 * @param {*} toolCalls - Provider-specific tool calls
 * @param {string} provider - Source provider
 * @returns {Array} OpenAI format tool calls
 */
function convertToolCallsFromProvider(toolCalls, provider) {
  if (!toolCalls || !Array.isArray(toolCalls)) return [];

  const converters = {
    openai: (calls) => calls, // already in OpenAI format
    google: convertFromGoogle,
    claude: convertFromClaude,
    xai: convertFromXAI,
  };

  const converter = converters[provider];
  if (!converter) {
    console.warn(`No tool result converter found for provider: ${provider}`);
    return toolCalls;
  }

  return converter(toolCalls);
}

// OpenAI format (source/target format)
function convertToOpenAI(tools) {
  return tools; // passthrough
}

// Google Gemini format
function convertToGoogle(tools) {
  return [{
    functionDeclarations: tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: cleanGoogleParameters(tool.function.parameters)
    }))
  }];
}

function cleanGoogleParameters(parameters) {
  if (!parameters || typeof parameters !== 'object') return parameters;

  // Create a deep copy to avoid mutating original
  const clean = JSON.parse(JSON.stringify(parameters));

  const removeForbidden = (obj) => {
    if (obj && typeof obj === 'object') {
      delete obj.$schema;
      delete obj.additionalProperties;
      for (const key in obj) {
        removeForbidden(obj[key]);
      }
    }
  };

  removeForbidden(clean);
  return clean;
}

// Anthropic Claude format
function convertToClaude(tools) {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters
  }));
}

// XAI format
function convertToXAI(tools) {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters
  }));
}

// Convert from Google function calls to OpenAI tool_calls format
function convertFromGoogle(functionCalls) {
  if (!functionCalls || !Array.isArray(functionCalls)) return [];

  return functionCalls.map((call, index) => ({
    id: `call_${Date.now()}_${index}`,
    function: {
      name: call.name,
      arguments: JSON.stringify(call.args)
    }
  }));
}

// Convert from Claude tool calls to OpenAI format
function convertFromClaude(toolCalls) {
  // Claude tool call format would go here when implemented
  return toolCalls;
}

// Convert from XAI tool calls to OpenAI format
function convertFromXAI(toolCalls) {
  // XAI tool call format would go here when implemented
  return toolCalls;
}

module.exports = {
  convertToolsToProvider,
  convertToolCallsFromProvider,
};
