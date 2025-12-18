const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { spawn } = require('child_process');
const { checkLocalActive, checkRemoteActive } = require('../../utils/mcpHealth');

const prisma = new PrismaClient();
const processes = new Map(); // id -> { process, config }

module.exports = (adminAuth) => {
  const router = express.Router();

/**
 * Validates MCP server data.
 * @param {object} data - Input data.
 * @returns {object} Validated data or throws error.
 */
function validateMcpServer(data) {
  const { name, type, command, url, headers, env, enabled, timeout } = data;
  if (!name || typeof name !== 'string') throw new Error('Invalid name');
  if (!['local', 'remote'].includes(type)) throw new Error('Invalid type');
  if (type === 'local' && (!Array.isArray(command) || command.some(c => typeof c !== 'string'))) {
    throw new Error('Invalid command array');
  }
  if (type === 'remote' && (!url || typeof url !== 'string')) throw new Error('Invalid URL');
  if (headers && typeof headers !== 'object') throw new Error('Invalid headers');
  if (env && typeof env !== 'object') throw new Error('Invalid env');
  if (typeof enabled !== 'boolean') throw new Error('Invalid enabled');
  if (timeout && (typeof timeout !== 'number' || timeout < 1000)) throw new Error('Invalid timeout');
  return { name, type, command, url, headers, env, enabled, timeout };
}

/**
 * Spawns a local MCP server process.
 * @param {object} server - Server config.
 * @returns {object} Process instance.
 */
function spawnLocalServer(server) {
  const env = { ...process.env, ...(server.env || {}) };
  const proc = spawn(server.command[0], server.command.slice(1), { env });
  const entry = { process: proc, config: server, started: false };
  processes.set(server.id, entry);

  // Mark as started after 5 seconds if still running
  const timer = setTimeout(() => {
    if (processes.has(server.id)) {
      entry.started = true;
    }
  }, 5000);

  proc.on('exit', (code) => {
    clearTimeout(timer);
    processes.delete(server.id);
  });
  proc.on('error', (err) => {
    clearTimeout(timer);
    processes.delete(server.id);
  });

  return proc;
}

/**
 * Gets server status.
 * @param {object} server - Server from DB.
 * @returns {Promise<string>} 'active' or 'inactive'.
 */
async function getServerStatus(server) {
  if (!server.enabled) return 'inactive';
  if (server.type === 'local') {
    let entry = processes.get(server.id);
    if (!entry) {
      spawnLocalServer(server);
      entry = processes.get(server.id);
    }
    return entry && entry.started && checkLocalActive(entry.process.pid) ? 'active' : 'inactive';
  } else if (server.type === 'remote') {
    return (await checkRemoteActive(server.url, server.headers, server.timeout)) ? 'active' : 'inactive';
  }
  return 'inactive';
}

// GET / - List servers with status
router.get('/', adminAuth, async (req, res) => {
  try {
    const servers = await prisma.mcpServer.findMany();
    const serversWithStatus = await Promise.all(
      servers.map(async (server) => ({
        ...server,
        status: await getServerStatus(server),
      }))
    );
    res.json(serversWithStatus);
  } catch (error) {
    console.error('Error fetching MCP servers:', error);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

// POST / - Add server
router.post('/', adminAuth, async (req, res) => {
  try {
    const data = validateMcpServer(req.body);
    const server = await prisma.mcpServer.create({ data });
    if (server.type === 'local' && server.enabled) {
      spawnLocalServer(server);
    }
    res.json(server);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /:id - Update server
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = validateMcpServer(req.body);
    const existing = await prisma.mcpServer.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Server not found' });

    const server = await prisma.mcpServer.update({ where: { id }, data });

    // Restart if local and enabled changed
    if (server.type === 'local') {
      const proc = processes.get(id);
      if (proc) proc.process.kill();
      if (server.enabled) spawnLocalServer(server);
    }

    res.json(server);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /:id - Delete server (with confirm)
router.delete('/:id', adminAuth, async (req, res) => {
  if (req.query.confirm !== 'true') {
    return res.status(400).json({ error: 'Confirmation required' });
  }
  try {
    const id = parseInt(req.params.id);
    const proc = processes.get(id);
    if (proc) proc.process.kill();
    await prisma.mcpServer.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// POST /:id/test - Test server with AI chat simulation
router.post('/:id/test', adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    const server = await prisma.mcpServer.findUnique({ where: { id } });
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (!server.enabled) {
      return res.status(400).json({ error: 'Server is not enabled' });
    }

    // Get MCP tools for this server only
    const { getMcpTools, executeMcpTool } = require('../../utils/mcpTools');
    const allMcpTools = await getMcpTools();

    // Filter tools to only this server
    const serverMcpTools = allMcpTools.filter(tool => tool.serverId === id);
    const tools = serverMcpTools.map(t => t.tool);

    if (tools.length === 0) {
      return res.status(400).json({ error: 'No tools available from this server' });
    }

    console.log(`Testing MCP server ${server.name} with ${tools.length} tools`);

    // Simulate AI chat with tool calling
    const { chatCompletion } = require('../../utils/aiProvider');
    const messages = [
      { role: 'system', content: 'You are a helpful assistant. Use available tools when needed.' },
      { role: 'user', content: query },
    ];

    let fullResponseText = '';
    let toolsUsed = [];
    const maxIterations = 3; // Limit iterations for testing

    for (let i = 0; i < maxIterations; i++) {
      const response = await chatCompletion(messages, {
        temperature: 0.2,
        tools: tools.length > 0 ? tools : undefined,
      });

      if (response.tool_calls && response.tool_calls.length > 0) {
        // Execute tools
        messages.push({ role: 'assistant', content: response.content, tool_calls: response.tool_calls });

        for (const toolCall of response.tool_calls) {
          try {
            console.log(`Executing tool: ${toolCall.function.name}`);
            const result = await executeMcpTool(toolCall, serverMcpTools);
            console.log(`Tool result (${toolCall.function.name}):`, result.content.substring(0, 200) + (result.content.length > 200 ? '...' : ''));
            toolsUsed.push(toolCall.function.name.replace(`${server.name}_`, ''));
            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result.content });
          } catch (error) {
            console.error('Tool execution error:', error);
            messages.push({ role: 'tool', tool_call_id: toolCall.id, content: `Error: ${error.message}` });
          }
        }

        // After the last iteration, give AI one more chance to respond without tools
        if (i === maxIterations - 1) {
          const finalResponse = await chatCompletion(messages, {
            temperature: 0.2,
            tools: [], // No tools for final response
          });
          fullResponseText = finalResponse.content || 'AI completed tool calls but generated no final response.';
          break;
        }
      } else {
        fullResponseText = response.content || 'No response generated.';
        break;
      }
    }

    if (!fullResponseText) {
      fullResponseText = 'Tool calls completed but no final response generated.';
    }

    res.json({
      response: fullResponseText,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : null,
      serverName: server.name,
    });

  } catch (error) {
    console.error('Error testing MCP server:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

  return router;
};
