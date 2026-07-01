/*
  Warnings:

  - A unique constraint covering the columns `[roundId,prizeRank]` on the table `Winner` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('NUMBERS', 'EVEN_ODD');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ACTIVE', 'WINNER', 'LOST', 'DISABLED');

-- CreateEnum
CREATE TYPE "PrizeRank" AS ENUM ('FIRST', 'SECOND');

-- AlterTable
ALTER TABLE "GameRound" ADD COLUMN     "gameType" "GameType" NOT NULL DEFAULT 'NUMBERS';

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "status" "ParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "phoneNumber" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'ETB',
ADD COLUMN     "firstPrize" DECIMAL(12,2) NOT NULL DEFAULT 1000,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "secondPrize" DECIMAL(12,2) NOT NULL DEFAULT 200,
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'light',
ADD COLUMN     "ticketPrice" DECIMAL(12,2) NOT NULL DEFAULT 200,
ADD COLUMN     "winnerRate" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Winner" ADD COLUMN     "prizeRank" "PrizeRank" NOT NULL DEFAULT 'FIRST',
ADD COLUMN     "rateDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "selectedNumber" INTEGER NOT NULL,
    "ticketPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gameId" TEXT,
    "gameType" "GameType" NOT NULL,
    "gameCount" INTEGER NOT NULL DEFAULT 1,
    "participantCount" INTEGER NOT NULL,
    "ticketPrice" DECIMAL(12,2) NOT NULL,
    "totalSales" DECIMAL(12,2) NOT NULL,
    "firstPrizePaid" DECIMAL(12,2) NOT NULL,
    "secondPrizePaid" DECIMAL(12,2) NOT NULL,
    "winnerRateDeduction" DECIMAL(12,2) NOT NULL,
    "netIncome" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Entry_tenantId_gameId_idx" ON "Entry"("tenantId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_gameId_participantId_key" ON "Entry"("gameId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_gameId_selectedNumber_key" ON "Entry"("gameId", "selectedNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Report_gameId_key" ON "Report"("gameId");

-- CreateIndex
CREATE INDEX "Report_tenantId_createdAt_idx" ON "Report"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "GameRound_tenantId_gameType_status_idx" ON "GameRound"("tenantId", "gameType", "status");

-- CreateIndex
CREATE INDEX "Participant_tenantId_status_idx" ON "Participant"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Winner_roundId_prizeRank_key" ON "Winner"("roundId", "prizeRank");

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "GameRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "GameRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;
