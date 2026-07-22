DROP INDEX IF EXISTS "Entry_gameId_selectedNumber_key";
DROP INDEX IF EXISTS "Winner_roundId_prizeRank_key";

CREATE UNIQUE INDEX "Entry_gameId_participantId_selectedNumber_key" ON "Entry"("gameId", "participantId", "selectedNumber");
CREATE INDEX "Entry_gameId_selectedNumber_idx" ON "Entry"("gameId", "selectedNumber");
CREATE INDEX "Winner_roundId_prizeRank_idx" ON "Winner"("roundId", "prizeRank");
