-- A used bike's component can already carry km that the bike's Strava
-- distance doesn't know about (15 000 km cassette on a bike tracked for 2 000).
-- At reset time the rider states how much was already on the component;
-- bike health adds it to the km ridden since the reset.
ALTER TABLE bike_component_resets ADD COLUMN IF NOT EXISTS initial_km NUMERIC NOT NULL DEFAULT 0;
