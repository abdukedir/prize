ALTER TABLE "GameRound" ADD COLUMN "createdById" TEXT;
ALTER TABLE "EvenOddRound" ADD COLUMN "createdById" TEXT;

UPDATE "GameRound" gr
SET "createdById" = COALESCE(
  (
    SELECT p."createdById"
    FROM "Entry" e
    JOIN "Participant" p ON p."id" = e."participantId"
    WHERE e."gameId" = gr."id"
      AND p."createdById" IS NOT NULL
    ORDER BY e."createdAt" ASC
    LIMIT 1
  ),
  (
    SELECT u."id"
    FROM "User" u
    WHERE u."tenantId" = gr."tenantId"
    ORDER BY CASE WHEN u."role" = 'ADMIN' THEN 0 WHEN u."role" = 'SUPERADMIN' THEN 1 ELSE 2 END, u."createdAt" ASC
    LIMIT 1
  )
);

UPDATE "EvenOddRound" eor
SET "createdById" = COALESCE(
  (
    SELECT p."createdById"
    FROM "EvenOddRoom" room
    JOIN "EvenOddBet" bet ON bet."roomId" = room."id"
    JOIN "Participant" p ON p."id" = bet."participantId"
    WHERE room."roundId" = eor."id"
      AND p."createdById" IS NOT NULL
    ORDER BY bet."createdAt" ASC
    LIMIT 1
  ),
  (
    SELECT u."id"
    FROM "User" u
    WHERE u."tenantId" = eor."tenantId"
    ORDER BY CASE WHEN u."role" = 'ADMIN' THEN 0 WHEN u."role" = 'SUPERADMIN' THEN 1 ELSE 2 END, u."createdAt" ASC
    LIMIT 1
  )
);

ALTER TABLE "GameRound" ALTER COLUMN "createdById" SET NOT NULL;
ALTER TABLE "EvenOddRound" ALTER COLUMN "createdById" SET NOT NULL;

DROP INDEX "GameRound_tenantId_number_key";
DROP INDEX "EvenOddRound_tenantId_number_key";

CREATE UNIQUE INDEX "GameRound_tenantId_createdById_gameType_number_key" ON "GameRound"("tenantId", "createdById", "gameType", "number");
CREATE INDEX "GameRound_tenantId_createdById_gameType_status_idx" ON "GameRound"("tenantId", "createdById", "gameType", "status");
CREATE UNIQUE INDEX "EvenOddRound_tenantId_createdById_number_key" ON "EvenOddRound"("tenantId", "createdById", "number");
CREATE INDEX "EvenOddRound_tenantId_createdById_status_idx" ON "EvenOddRound"("tenantId", "createdById", "status");
