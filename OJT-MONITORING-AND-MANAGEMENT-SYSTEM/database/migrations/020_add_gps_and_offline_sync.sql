-- MIGRATION 020: ADD GPS GEOFENCING AND OFFLINE ATTENDANCE SYNC
-- Purely additive and non-breaking: all new columns are nullable or have safe defaults.

-- 1. Extend companies table with workplace coordinates & geofence perimeter
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS geofence_radius_meters INTEGER DEFAULT 150,
  ADD COLUMN IF NOT EXISTS geofence_enabled BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_geofence_enabled ON companies(geofence_enabled);

-- 2. Extend attendance table with GPS coordinates, distance, location status, and sync timestamp
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS time_in_lat DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS time_in_lng DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS time_in_distance_meters INTEGER NULL,
  ADD COLUMN IF NOT EXISTS time_in_location_status TEXT DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS time_in_flag_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS time_out_lat DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS time_out_lng DECIMAL(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS time_out_distance_meters INTEGER NULL,
  ADD COLUMN IF NOT EXISTS time_out_location_status TEXT DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS time_out_flag_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NULL;

-- 3. Add constraint checks safely (dropping existing constraint if re-run)
DO $$
BEGIN
  ALTER TABLE attendance DROP CONSTRAINT IF EXISTS chk_attendance_time_in_location_status;
  ALTER TABLE attendance ADD CONSTRAINT chk_attendance_time_in_location_status 
    CHECK (time_in_location_status IN ('verified', 'flagged_out_of_bounds', 'location_unavailable', 'not_applicable'));

  ALTER TABLE attendance DROP CONSTRAINT IF EXISTS chk_attendance_time_out_location_status;
  ALTER TABLE attendance ADD CONSTRAINT chk_attendance_time_out_location_status 
    CHECK (time_out_location_status IN ('verified', 'flagged_out_of_bounds', 'location_unavailable', 'not_applicable'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 4. Helpful indexes for performance queries
CREATE INDEX IF NOT EXISTS idx_attendance_time_in_location_status ON attendance(time_in_location_status);
CREATE INDEX IF NOT EXISTS idx_attendance_synced_at ON attendance(synced_at);
