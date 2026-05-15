/*
  Warnings:

  - You are about to drop the column `websites` on the `Client` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Task" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "Task" ADD COLUMN "approvedBy" TEXT;

-- CreateTable
CREATE TABLE "ClientWebsite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ProtocolVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Trishul Protocol',
    "content" TEXT NOT NULL DEFAULT '',
    "stageDescriptions" TEXT NOT NULL DEFAULT '[]',
    "agentSkills" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProtocolInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocolId" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "targetName" TEXT,
    "agentAccess" TEXT NOT NULL DEFAULT '[]',
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "usedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProtocolAccessLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviteId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "agentAccess" TEXT NOT NULL DEFAULT '[]',
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserProtocolAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "userName" TEXT,
    "protocolId" TEXT NOT NULL,
    "agentAccess" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedVia" TEXT NOT NULL,
    "lastAccessAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "url" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "website" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT,
    "notes" TEXT,
    "projectType" TEXT,
    "projectStartDate" DATETIME,
    "deliveryDate" DATETIME,
    "mediatorName" TEXT,
    "mediatorPhone" TEXT,
    "mediatorEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Client" ("company", "createdAt", "deliveryDate", "email", "id", "mediatorEmail", "mediatorName", "mediatorPhone", "name", "notes", "phone", "projectStartDate", "projectType", "status", "updatedAt", "userId", "website") SELECT "company", "createdAt", "deliveryDate", "email", "id", "mediatorEmail", "mediatorName", "mediatorPhone", "name", "notes", "phone", "projectStartDate", "projectType", "status", "updatedAt", "userId", "website" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ClientWebsite_clientId_idx" ON "ClientWebsite"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolVersion_version_key" ON "ProtocolVersion"("version");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolInvite_inviteCode_key" ON "ProtocolInvite"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "UserProtocolAccess_userId_key" ON "UserProtocolAccess"("userId");

-- CreateIndex
CREATE INDEX "UserCredential_userId_idx" ON "UserCredential"("userId");
