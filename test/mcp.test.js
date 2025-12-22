const { PrismaClient } = require('@prisma/client');
const { getMcpTools, executeMcpTool } = require('../server/utils/mcpTools');

const prisma = new PrismaClient();

// Mock fetch for remote MCP servers
global.fetch = jest.fn();

// Mock child_process for local MCP servers
jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn(), setEncoding: jest.fn() },
    stderr: { on: jest.fn() },
    stdin: { write: jest.fn() },
    on: jest.fn(),
    kill: jest.fn()
  }))
}));

describe('MCP Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('getMcpTools', () => {
    test('should return empty array when no enabled servers', async () => {
      // Mock empty server list
      jest.spyOn(prisma.mcpServer, 'findMany').mockResolvedValue([]);

      const tools = await getMcpTools();
      expect(tools).toEqual([]);
    });

    test('should load tools from enabled servers', async () => {
      const mockServers = [
        {
          id: 1,
          name: 'Test Server',
          type: 'remote',
          enabled: true,
          url: 'http://test.com',
          timeout: 5000
        }
      ];

      const mockToolsResponse = {
        jsonrpc: '2.0',
        result: {
          tools: [
            {
              name: 'test_tool',
              description: 'A test tool',
              inputSchema: {
                type: 'object',
                properties: { param: { type: 'string' } }
              }
            }
          ]
        }
      };

      jest.spyOn(prisma.mcpServer, 'findMany').mockResolvedValue(mockServers);
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockToolsResponse)
      });

      const tools = await getMcpTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].tool.function.name).toBe('Test_Server_test_tool');
      expect(tools[0].tool.function.description).toBe('A test tool');
      expect(tools[0].server).toEqual(mockServers[0]);
    });

    test('should handle server fetch errors gracefully', async () => {
      const mockServers = [
        {
          id: 1,
          name: 'Failing Server',
          type: 'remote',
          enabled: true,
          url: 'http://fail.com'
        }
      ];

      jest.spyOn(prisma.mcpServer, 'findMany').mockResolvedValue(mockServers);
      global.fetch.mockRejectedValue(new Error('Network error'));

      // Should not throw, should return empty array
      const tools = await getMcpTools();
      expect(tools).toEqual([]);
    });

    test('should skip disabled servers', async () => {
      const mockServers = [
        {
          id: 1,
          name: 'Enabled Server',
          enabled: true,
          type: 'remote',
          url: 'http://enabled.com'
        },
        {
          id: 2,
          name: 'Disabled Server',
          enabled: false,
          type: 'remote',
          url: 'http://disabled.com'
        }
      ];

      jest.spyOn(prisma.mcpServer, 'findMany').mockResolvedValue(mockServers);
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          jsonrpc: '2.0',
          result: { tools: [{ name: 'test', description: 'test' }] }
        })
      });

      const tools = await getMcpTools();

      // Should only get tools from enabled server
      expect(tools).toHaveLength(1);
      expect(tools[0].server.name).toBe('Enabled Server');
    });

    test('should handle malformed tool responses', async () => {
      const mockServers = [{
        id: 1,
        name: 'Test Server',
        type: 'remote',
        enabled: true,
        url: 'http://test.com'
      }];

      jest.spyOn(prisma.mcpServer, 'findMany').mockResolvedValue(mockServers);
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          jsonrpc: '2.0',
          result: { tools: null } // Malformed response
        })
      });

      const tools = await getMcpTools();
      expect(tools).toEqual([]);
    });
  });

  describe('executeMcpTool', () => {
    test('should execute remote MCP tool calls', async () => {
      const mockToolCall = {
        id: 'call_123',
        function: {
          name: 'test_function',
          arguments: JSON.stringify({ param: 'value' })
        }
      };

      const mockTools = [{
        serverId: 1,
        server: {
          id: 1,
          name: 'Test Server',
          type: 'remote',
          url: 'http://test.com',
          headers: {}
        },
        tool: {
          type: 'function',
          function: {
            name: 'Test_Server_test_function',
            description: 'Test function'
          }
        }
      }];

      const mockResponse = {
        jsonrpc: '2.0',
        result: { output: 'Tool executed successfully' }
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await executeMcpTool(mockToolCall, mockTools);

      expect(result.content).toBe(JSON.stringify(mockResponse.result));
      expect(result.tool_call_id).toBe('call_123');
      expect(global.fetch).toHaveBeenCalledWith('http://test.com', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'test_function', // Should be cleaned of server prefix
            arguments: { param: 'value' }
          }
        })
      }));
    });

    test('should throw error for unknown tools', async () => {
      const mockToolCall = {
        function: { name: 'unknown_tool' }
      };

      await expect(executeMcpTool(mockToolCall, [])).rejects.toThrow('Tool unknown_tool not found');
    });

    test('should handle tool execution errors', async () => {
      const mockToolCall = {
        id: 'call_123',
        function: { name: 'failing_function', arguments: '{}' }
      };

      const mockTools = [{
        server: { name: 'Test Server', type: 'remote', url: 'http://fail.com' },
        tool: { function: { name: 'Test_Server_failing_function' } }
      }];

      global.fetch.mockResolvedValue({
        ok: false,
        status: 500
      });

      await expect(executeMcpTool(mockToolCall, mockTools)).rejects.toThrow('Tool call failed: HTTP 500');
    });

    test('should clean server prefix from tool names', async () => {
      const mockToolCall = {
        id: 'call_123',
        function: { name: 'test_function', arguments: '{}' }
      };

      const mockTools = [{
        server: {
          name: 'My Server',
          type: 'remote',
          url: 'http://test.com'
        },
        tool: { function: { name: 'My_Server_test_function' } }
      }];

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', result: {} })
      });

      await executeMcpTool(mockToolCall, mockTools);

      // Should call with clean tool name (without server prefix)
      const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callBody.params.name).toBe('test_function');
    });

    test('should handle JSON parsing errors in arguments', async () => {
      const mockToolCall = {
        function: { name: 'test', arguments: 'invalid json' }
      };

      const mockTools = [{
        server: { name: 'Test', type: 'remote', url: 'http://test.com' },
        tool: { function: { name: 'Test_test' } }
      }];

      // Should still attempt to execute (arguments will be passed as string)
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ jsonrpc: '2.0', result: {} })
      });

      const result = await executeMcpTool(mockToolCall, mockTools);
      expect(result).toBeDefined();
    });
  });

  describe('Tool Integration Tests', () => {
    test('should handle complete tool calling workflow', async () => {
      // Mock server with tools
      const mockServer = {
        id: 1,
        name: 'Weather API',
        type: 'remote',
        enabled: true,
        url: 'http://weather.com',
        timeout: 5000
      };

      // Mock tool list response
      const toolListResponse = {
        jsonrpc: '2.0',
        result: {
          tools: [{
            name: 'get_weather',
            description: 'Get current weather',
            inputSchema: {
              type: 'object',
              properties: { city: { type: 'string' } }
            }
          }]
        }
      };

      // Mock tool execution response
      const toolExecuteResponse = {
        jsonrpc: '2.0',
        result: { temperature: 22, condition: 'sunny' }
      };

      jest.spyOn(prisma.mcpServer, 'findMany').mockResolvedValue([mockServer]);
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(toolListResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(toolExecuteResponse)
        });

      // 1. Load tools
      const tools = await getMcpTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].tool.function.name).toBe('Weather_API_get_weather');

      // 2. Simulate AI tool call
      const toolCall = {
        id: 'call_456',
        function: {
          name: 'get_weather',
          arguments: JSON.stringify({ city: 'Berlin' })
        }
      };

      // 3. Execute tool
      const result = await executeMcpTool(toolCall, tools);

      expect(result.tool_call_id).toBe('call_456');
      expect(result.content).toBe(JSON.stringify({ temperature: 22, condition: 'sunny' }));

      // Verify correct API calls were made
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('should handle multiple servers with different tools', async () => {
      const mockServers = [
        {
          id: 1,
          name: 'Weather',
          type: 'remote',
          enabled: true,
          url: 'http://weather.com'
        },
        {
          id: 2,
          name: 'Calendar',
          type: 'remote',
          enabled: true,
          url: 'http://calendar.com'
        }
      ];

      jest.spyOn(prisma.mcpServer, 'findMany').mockResolvedValue(mockServers);

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            jsonrpc: '2.0',
            result: { tools: [{ name: 'get_weather', description: 'Weather tool' }] }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            jsonrpc: '2.0',
            result: { tools: [{ name: 'schedule_event', description: 'Calendar tool' }] }
          })
        });

      const tools = await getMcpTools();

      expect(tools).toHaveLength(2);
      expect(tools[0].tool.function.name).toBe('Weather_get_weather');
      expect(tools[1].tool.function.name).toBe('Calendar_schedule_event');
      expect(tools[0].server.name).toBe('Weather');
      expect(tools[1].server.name).toBe('Calendar');
    });
  });

  describe('Provider Integration Tests', () => {
    test('should work with Google Gemini tool calling', async () => {
      const { chatCompletion } = require('../server/utils/googleProvider');

      // Mock tool that returns current date
      const mockTool = {
        type: 'function',
        function: {
          name: 'get_current_date',
          description: 'Get the current date and time',
          parameters: {
            type: 'object',
            properties: {
              format: {
                type: 'string',
                description: 'Date format (iso, readable)',
                enum: ['iso', 'readable']
              }
            }
          }
        }
      };

      const messages = [
        { role: 'system', content: 'You are a helpful assistant with access to tools.' },
        { role: 'user', content: 'What is the current date?' }
      ];

      const options = {
        tools: [mockTool],
        temperature: 0,
        maxTokens: 100
      };

      try {
        const response = await chatCompletion(messages, options);

        // Check if tool calls were made
        if (response.tool_calls && response.tool_calls.length > 0) {
          const toolCall = response.tool_calls[0];
          expect(toolCall.function.name).toBe('get_current_date');

          // Create tool result message
          const toolResultMessage = {
            role: 'tool',
            tool_call_id: toolCall.id,
            function_name: toolCall.function.name,
            content: JSON.stringify({
              date: new Date().toISOString(),
              format: 'iso'
            })
          };

          // Continue conversation with tool result
          const followUpMessages = [
            ...messages,
            { role: 'assistant', content: response.content, tool_calls: response.tool_calls },
            toolResultMessage
          ];

          const finalResponse = await chatCompletion(followUpMessages, options);

          expect(finalResponse.content).toBeTruthy();
          expect(finalResponse.tool_calls.length).toBe(0); // Should not have more tool calls
        } else {
          // If no tool calls, that's also acceptable (model might answer directly)
          expect(response.content).toBeTruthy();
        }

      } catch (error) {
        // This might fail if Google API key is not set or invalid
        if (error.message.includes('API key') || error.message.includes('invalid')) {
          console.log('⚠️ Skipping Google provider test due to API key issues');
        } else {
          throw error;
        }
      }
    }, 30000); // 30 second timeout for API call
  });

  describe('Error Handling', () => {
    test('should handle network timeouts', async () => {
      const mockServer = {
        id: 1,
        name: 'Slow Server',
        type: 'remote',
        enabled: true,
        url: 'http://slow.com',
        timeout: 100
      };

      jest.spyOn(prisma.mcpServer, 'findMany').mockResolvedValue([mockServer]);

      global.fetch.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          ok: false,
          status: 408
        }), 200)) // Delay longer than timeout
      );

      const tools = await getMcpTools();
      expect(tools).toEqual([]); // Should handle timeout gracefully
    });

    test('should handle invalid JSON-RPC responses', async () => {
      const mockServer = {
        id: 1,
        name: 'Bad Server',
        type: 'remote',
        enabled: true,
        url: 'http://bad.com'
      };

      jest.spyOn(prisma.mcpServer, 'findMany').mockResolvedValue([mockServer]);

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: 'response' }) // Missing jsonrpc
      });

      const tools = await getMcpTools();
      expect(tools).toEqual([]);
    });

    test('should handle server connection failures', async () => {
      const mockServer = {
        id: 1,
        name: 'Down Server',
        type: 'remote',
        enabled: true,
        url: 'http://down.com'
      };

      jest.spyOn(prisma.mcpServer, 'findMany').mockResolvedValue([mockServer]);
      global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const tools = await getMcpTools();
      expect(tools).toEqual([]); // Should not crash the application
    });
  });
});
