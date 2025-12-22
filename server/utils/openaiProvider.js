const path = require('path');
const { execSync } = require('child_process');
const { convertToolsToProvider, convertToolCallsFromProvider } = require('./toolConverter');

let OpenAI;
try {
  OpenAI = require('openai');
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.log('OpenAI module not found. Installing automatically...');
    const projectRoot = path.resolve(__dirname, '../../..');
    execSync('npm install openai', { stdio: 'inherit', cwd: projectRoot });
    OpenAI = require('openai');
    console.log('OpenAI module installed and loaded successfully.');
  } else {
    throw error;
  }
}

let sharedClient = null;

function getClient(explicitKey = null, backend = false) {
  const prefix = backend ? 'BACKEND_' : '';
  const apiKey = explicitKey || process.env[prefix + 'AI_OPENAI_API_KEY'] || process.env[prefix + 'AI_API_KEY'];
  if (!apiKey) {
    throw new Error(`${prefix}AI_OPENAI_API_KEY or ${prefix}AI_API_KEY environment variable not set.`);
  }
  const baseURL = process.env[prefix + 'AI_OPENAI_BASE_URL'] || process.env[prefix + 'AI_BASE_URL'] || 'https://api.openai.com/v1';

  if (explicitKey) {
    return new OpenAI({ apiKey, baseURL });
  }

  if (!sharedClient) {
    sharedClient = new OpenAI({ apiKey, baseURL });
  }

  return sharedClient;
}

async function chatCompletion(messages, options = {}) {
  const prefix = options.backend ? 'BACKEND_' : '';
  const client = getClient(options.apiKey, options.backend);
  const model = options.model || process.env[prefix + 'AI_OPENAI_MODEL'] || process.env[prefix + 'AI_MODEL'];
  const temperature = options.temperature || parseFloat(process.env[prefix + 'AI_TEMPERATURE']);
  const maxTokens = options.maxTokens || parseInt(process.env[prefix + 'AI_MAX_TOKENS']);

  const request = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (options.tools && options.tools.length > 0) {
    request.tools = convertToolsToProvider(options.tools, 'openai'); // Uses abstraction layer
    request.tool_choice = options.tool_choice || 'auto';
  }

  const response = await client.chat.completions.create(request);

  const message = response.choices[0].message;
  return {
    content: message.content,
    tool_calls: message.tool_calls,
    finish_reason: response.choices[0].finish_reason,
  };
}

async function* chatCompletionStream(messages, options = {}) {
  const prefix = options.backend ? 'BACKEND_' : '';
  const client = getClient(options.apiKey, options.backend);
  const model = options.model || process.env[prefix + 'AI_OPENAI_MODEL'] || process.env[prefix + 'AI_MODEL'];
  const temperature = options.temperature || parseFloat(process.env[prefix + 'AI_TEMPERATURE']);
  const maxTokens = options.maxTokens || parseInt(process.env[prefix + 'AI_MAX_TOKENS']);

  const stream = await client.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content;
    if (token) {
      yield { token };
    }
  }
}

module.exports = {
  chatCompletion,
  chatCompletionStream,
  getClient,
};
