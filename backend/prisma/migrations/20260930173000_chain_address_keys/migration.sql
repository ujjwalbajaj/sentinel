DROP INDEX "WatchedWallet_address_chainId_key";
CREATE UNIQUE INDEX "WatchedWallet_chainId_address_key" ON "WatchedWallet"("chainId", "address");

CREATE UNIQUE INDEX "DemoWallet_chainId_address_key" ON "DemoWallet"("chainId", "address");

DROP INDEX "Incident_suspectTxHash_idx";
CREATE INDEX "Incident_chainId_suspectTxHash_idx" ON "Incident"("chainId", "suspectTxHash");
CREATE INDEX "Incident_chainId_attacker_idx" ON "Incident"("chainId", "attacker");
CREATE INDEX "Incident_chainId_attackerContract_idx" ON "Incident"("chainId", "attackerContract");

CREATE UNIQUE INDEX "ActivityEvent_chainId_txHash_type_from_result_valueWei_key" ON "ActivityEvent"("chainId", "txHash", "type", "from", "result", "valueWei");
CREATE INDEX "ActivityEvent_chainId_from_idx" ON "ActivityEvent"("chainId", "from");
CREATE INDEX "ActivityEvent_chainId_txHash_idx" ON "ActivityEvent"("chainId", "txHash");
