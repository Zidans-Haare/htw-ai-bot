-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "images" ADD COLUMN "source" TEXT;

-- CreateTable
CREATE TABLE "mcp_servers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "command" JSONB,
    "url" TEXT,
    "headers" JSONB,
    "env" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "timeout" INTEGER DEFAULT 10000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "testQuery" TEXT,

    CONSTRAINT "mcp_servers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_servers_name_key" ON "mcp_servers"("name");