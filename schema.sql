CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(180) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin','receptionist','doctor')),
  doctor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(120) NOT NULL,
  specialty VARCHAR(120) NOT NULL,
  phone VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_doctor_id_fkey;
ALTER TABLE users ADD CONSTRAINT users_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(140) NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 480),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(140) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(180),
  birth_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(phone)
);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  doctor_id UUID NOT NULL REFERENCES doctors(id),
  service_id UUID NOT NULL REFERENCES services(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','completed','cancelled','no_show')),
  source VARCHAR(20) NOT NULL DEFAULT 'website'
    CHECK (source IN ('website','admin','phone')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

-- Prevent overlapping active appointments for the same doctor.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS no_doctor_overlap;
ALTER TABLE appointments ADD CONSTRAINT no_doctor_overlap
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending','confirmed'));

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  method VARCHAR(20) NOT NULL CHECK (method IN ('cash','card','transfer')),
  status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','refunded')),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctor_working_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_working BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (end_time > start_time),
  UNIQUE(doctor_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name);
