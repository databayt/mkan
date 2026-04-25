-- Zero-pad existing departureTime values so lexicographic range filters work
UPDATE "Trip"
SET "departureTime" = lpad("departureTime", 5, '0')
WHERE length("departureTime") < 5;

-- AssemblyPoint
CREATE INDEX IF NOT EXISTS "AssemblyPoint_city_isActive_idx"
  ON "AssemblyPoint"("city", "isActive");

-- Route
CREATE INDEX IF NOT EXISTS "Route_officeId_isActive_idx"
  ON "Route"("officeId", "isActive");

CREATE INDEX IF NOT EXISTS "Route_originId_destinationId_isActive_idx"
  ON "Route"("originId", "destinationId", "isActive");

-- Trip
CREATE INDEX IF NOT EXISTS "Trip_isActive_isCancelled_departureDate_idx"
  ON "Trip"("isActive", "isCancelled", "departureDate");

CREATE INDEX IF NOT EXISTS "Trip_routeId_departureDate_departureTime_idx"
  ON "Trip"("routeId", "departureDate", "departureTime");

-- Bus
CREATE INDEX IF NOT EXISTS "Bus_officeId_idx"
  ON "Bus"("officeId");
