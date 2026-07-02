-- CreateIndex
CREATE INDEX "TicketEvent_toState_createdAt_idx" ON "TicketEvent"("toState", "createdAt");

-- CreateIndex
CREATE INDEX "TicketEvent_actorUserId_createdAt_idx" ON "TicketEvent"("actorUserId", "createdAt");
