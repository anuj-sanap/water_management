CREATE INDEX "WaterSupply_projectId_source_date_idx" ON "WaterSupply"("projectId", "source", "date");
CREATE INDEX "ConsumptionRecord_projectId_activityTypeId_date_idx" ON "ConsumptionRecord"("projectId", "activityTypeId", "date");
CREATE INDEX "ConsumptionRecord_projectId_method_date_idx" ON "ConsumptionRecord"("projectId", "method", "date");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
