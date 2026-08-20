-- CreateSchema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "device_type" TEXT NOT NULL,
    "os_version" TEXT NOT NULL DEFAULT '',
    "token_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "sender" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "caller" TEXT NOT NULL,
    "call_state" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "devices_device_id_key" ON "devices"("device_id");
CREATE INDEX "devices_is_active_last_seen_idx" ON "devices"("is_active", "last_seen");
CREATE INDEX "messages_device_id_timestamp_idx" ON "messages"("device_id", "timestamp" DESC);
CREATE INDEX "messages_synced_created_at_idx" ON "messages"("synced", "created_at");
CREATE INDEX "messages_sender_device_id_idx" ON "messages"("sender", "device_id");
CREATE INDEX "calls_device_id_timestamp_idx" ON "calls"("device_id", "timestamp" DESC);
CREATE INDEX "calls_synced_created_at_idx" ON "calls"("synced", "created_at");
CREATE INDEX "calls_caller_device_id_idx" ON "calls"("caller", "device_id");

ALTER TABLE "messages" ADD CONSTRAINT "messages_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calls" ADD CONSTRAINT "calls_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
