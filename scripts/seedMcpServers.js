const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedMcpServers() {
  const servers = [
    {
      name: 'Context7 MCP',
      type: 'local',
      command: ['npx', '-y', '@upstash/context7-mcp', '--api-key', 'ctx7sk-436883d0-4766-41bc-87c5-c6774816ac8d'],
      enabled: true,
      timeout: 10000,
    },
    {
      name: 'OpenMensa MCP',
      type: 'local',
      command: ['node', '/home/thomas/dev/mcp_openmensa/dist/index.js'],
      enabled: true,
      timeout: 10000,
    },
    {
      name: 'Context7 Web MCP',
      type: 'remote',
      url: 'https://mcp.context7.com/mcp',
      headers: {
        'CONTEXT7_API_KEY': 'ctx7sk-436883d0-4766-41bc-87c5-c6774816ac8d'
      },
      enabled: false,
      timeout: 10000,
    },
  ];

  for (const server of servers) {
    try {
      await prisma.mcpServer.upsert({
        where: { name: server.name },
        update: server,
        create: server,
      });
      console.log(`Seeded ${server.name}`);
    } catch (error) {
      console.error(`Failed to seed ${server.name}:`, error);
    }
  }

  await prisma.$disconnect();
}

seedMcpServers();