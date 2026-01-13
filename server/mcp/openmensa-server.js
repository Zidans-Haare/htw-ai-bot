#!/usr/bin/env node

const { buildOpenMensaContext, shouldHandleOpenMensa } = require('../utils/openmensa');

// MCP Server Implementation
async function main() {
    console.error('OpenMensa MCP Server starting...');

    process.stdin.setEncoding('utf8');

    let buffer = '';
    process.stdin.on('data', async (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const request = JSON.parse(line);
                await handleRequest(request);
            } catch (error) {
                console.error('Error processing request:', error);
            }
        }
    });
}

async function handleRequest(request) {
    const { id, method, params } = request;

    if (method === 'tools/list') {
        const tools = [
            {
                name: 'get_mensa_info',
                description: 'Get information about Mensa meals and canteens. Use this when the user asks about food, menus, or canteens.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        prompt: {
                            type: 'string',
                            description: 'The user\'s query or prompt about the Mensa (e.g., "Was gibt es heute in der Mensa?", "Gibt es Burger?")'
                        },
                        vegan: {
                            type: 'boolean',
                            description: 'Whether the user requested vegan food'
                        }
                    },
                    required: ['prompt']
                }
            }
        ];

        sendResponse({
            jsonrpc: '2.0',
            id,
            result: { tools }
        });
    } else if (method === 'tools/call') {
        const { name, arguments: args } = params;

        if (name === 'get_mensa_info') {
            try {
                const context = await buildOpenMensaContext({
                    prompt: args.prompt,
                    force: true, // Force lookup since we successfully called the tool
                    preferences: args.vegan ? { vegan: true } : {}
                });

                sendResponse({
                    jsonrpc: '2.0',
                    id,
                    result: {
                        content: [{ type: 'text', text: context ? context.contextText : 'No information found.' }]
                    }
                });
            } catch (error) {
                sendResponse({
                    jsonrpc: '2.0',
                    id,
                    error: { code: -32000, message: error.message }
                });
            }
        } else {
            sendResponse({
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: 'Method not found' }
            });
        }
    } else {
        // Ignore other methods or respond with error if strictly needed
    }
}

function sendResponse(response) {
    process.stdout.write(JSON.stringify(response) + '\n');
}

main().catch(console.error);
