-- Widen the `Amenity` enum so a listing can state what it actually offers.
--
-- The 13 original values had no way to say "kitchen", "TV" or "smoke alarm" —
-- the three most frequent facts in the Sudan Airbnb dataset — so 601 of 1051
-- captured amenity facts (57%) were dropped on import, and the host editor
-- collapsed 12 of its own checkboxes onto the nearest surviving value.
--
-- Additive only. Nothing is renamed, reordered or removed: Postgres stores the
-- label itself on every row, so touching an existing value would silently
-- rewrite what published listings claim. `ADD VALUE` appends, which is why the
-- Prisma enum appends too — the two orders have to agree.
--
-- Safe inside Prisma's transaction on PostgreSQL 12+ (measured: prod is 17.10)
-- because no statement here *uses* a value it just added.

ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'Kitchen';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'TV';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'DedicatedWorkspace';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'Elevator';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'PatioOrBalcony';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'Backyard';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'HotTub';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'Bathtub';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'BbqGrill';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'OutdoorDining';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'OutdoorShower';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'FirePit';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'IndoorFireplace';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'PoolTable';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'Piano';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'BeachAccess';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'LakeAccess';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'EVCharger';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'Crib';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'Breakfast';
-- "Hair dryer" matched the /dryer/ rule and recorded a washer/dryer on 2 homes.
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'HairDryer';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'LuggageDropoff';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'BedroomLock';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'SmokeAlarm';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'CarbonMonoxideAlarm';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'FireExtinguisher';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'FirstAidKit';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'SecurityCameras';
