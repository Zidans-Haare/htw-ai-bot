const { convertToolsToProvider, convertToolCallsFromProvider } = require('../server/utils/toolConverter');

describe('Tool Format Converter', () => {
  describe('convertToolsToProvider', () => {
    const mockTools = [
      {
        type: 'function',
        function: {
          name: 'test_function',
          description: 'A test function',
          parameters: {
            type: 'object',
            properties: {
              param1: { type: 'string' }
            }
          }
        }
      }
    ];

    test('converts to OpenAI format (passthrough)', () => {
      const result = convertToolsToProvider(mockTools, 'openai');
      expect(result).toEqual(mockTools);
    });

    test('converts to Google format', () => {
      const result = convertToolsToProvider(mockTools, 'google');
      expect(result).toEqual([{
        functionDeclarations: [{
          name: 'test_function',
          description: 'A test function',
          parameters: {
            type: 'object',
            properties: {
              param1: { type: 'string' }
            }
          }
        }]
      }]);
    });

    test('converts to Claude format', () => {
      const result = convertToolsToProvider(mockTools, 'claude');
      expect(result).toEqual([{
        name: 'test_function',
        description: 'A test function',
        input_schema: {
          type: 'object',
          properties: {
            param1: { type: 'string' }
          }
        }
      }]);
    });

    test('handles unknown provider gracefully', () => {
      const result = convertToolsToProvider(mockTools, 'unknown');
      expect(result).toEqual(mockTools); // fallback to original
    });

    test('handles empty tools', () => {
      const result = convertToolsToProvider([], 'google');
      expect(result).toBeUndefined();
    });

    test('handles null/undefined tools', () => {
      expect(convertToolsToProvider(null, 'google')).toBeUndefined();
      expect(convertToolsToProvider(undefined, 'google')).toBeUndefined();
    });
  });

  describe('convertToolCallsFromProvider', () => {
    test('converts from Google function calls', () => {
      const googleCalls = [
        {
          name: 'test_function',
          args: { param1: 'value1' }
        }
      ];

      const result = convertToolCallsFromProvider(googleCalls, 'google');
      expect(result).toEqual([{
        id: expect.stringMatching(/^call_\d+_\d+$/),
        function: {
          name: 'test_function',
          arguments: JSON.stringify({ param1: 'value1' })
        }
      }]);
    });

    test('converts from OpenAI format (passthrough)', () => {
      const openaiCalls = [{
        id: 'call_123',
        function: { name: 'test', arguments: '{}' }
      }];

      const result = convertToolCallsFromProvider(openaiCalls, 'openai');
      expect(result).toEqual(openaiCalls);
    });

    test('handles empty calls', () => {
      const result = convertToolCallsFromProvider([], 'google');
      expect(result).toEqual([]);
    });

    test('handles null/undefined calls', () => {
      expect(convertToolCallsFromProvider(null, 'google')).toEqual([]);
      expect(convertToolCallsFromProvider(undefined, 'google')).toEqual([]);
    });
  });
});
