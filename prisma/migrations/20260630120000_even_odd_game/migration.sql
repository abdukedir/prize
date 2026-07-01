CREATE TYPE "EvenOddSide" AS ENUM ('EVEN', 'ODD');
CREATE TYPE "EvenOddRoomStatus" AS ENUM ('WAITING', 'MATCHED', 'COMPLETED', 'CANCELLED', 'REFUNDED');
CREATE TYPE "EvenOddRoundStatus" AS ENUM ('OPEN', 'PUBLISHED');

CREATE TABLE "EvenOddRound" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "EvenOddRoundStatus" NOT NULL DEFAULT 'OPEN',
    "selectedNumber" INTEGER,
    "winningSide" "EvenOddSide",
    "publishedById" TEXT,
    "publishedByName" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvenOddRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvenOddRoom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "roomNumber" INTEGER NOT NULL,
    "creatorSide" "EvenOddSide" NOT NULL,
    "targetAmount" DECIMAL(18,2) NOT NULL,
    "status" "EvenOddRoomStatus" NOT NULL DEFAULT 'WAITING',
    "winnerSide" "EvenOddSide",
    "platformFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalPayout" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "matchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvenOddRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvenOddBet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "side" "EvenOddSide" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payout" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvenOddBet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvenOddRound_tenantId_number_key" ON "EvenOddRound"("tenantId", "number");
CREATE INDEX "EvenOddRound_tenantId_status_idx" ON "EvenOddRound"("tenantId", "status");
CREATE UNIQUE INDEX "EvenOddRoom_tenantId_roomNumber_key" ON "EvenOddRoom"("tenantId", "roomNumber");
CREATE INDEX "EvenOddRoom_tenantId_roundId_status_idx" ON "EvenOddRoom"("tenantId", "roundId", "status");
CREATE INDEX "EvenOddBet_tenantId_roomId_idx" ON "EvenOddBet"("tenantId", "roomId");
CREATE INDEX "EvenOddBet_tenantId_participantId_idx" ON "EvenOddBet"("tenantId", "participantId");

ALTER TABLE "EvenOddRound" ADD CONSTRAINT "EvenOddRound_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvenOddRound" ADD CONSTRAINT "EvenOddRound_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvenOddRoom" ADD CONSTRAINT "EvenOddRoom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvenOddRoom" ADD CONSTRAINT "EvenOddRoom_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "EvenOddRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvenOddBet" ADD CONSTRAINT "EvenOddBet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvenOddBet" ADD CONSTRAINT "EvenOddBet_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "EvenOddRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvenOddBet" ADD CONSTRAINT "EvenOddBet_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
