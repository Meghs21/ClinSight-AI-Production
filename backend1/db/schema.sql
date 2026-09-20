-- ClinSight AI PostgreSQL Database Schema
CREATE EXTENSION IF NOT EXISTS vector;

-- 0. Users Table (System Accounts & Authentication)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'doctor',
    department VARCHAR(255),
    patient_id VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 1. Audit Logs Table (Persistent Audit Trail)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    block_index INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    action VARCHAR(100) NOT NULL,
    actor_id VARCHAR(100) NOT NULL,
    patient_id VARCHAR(100),
    details TEXT,
    previous_hash VARCHAR(64) NOT NULL,
    hash VARCHAR(64) NOT NULL
);

-- 2. Patients Table
CREATE TABLE IF NOT EXISTS patients (
    patient_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    age INTEGER,
    gender VARCHAR(20),
    blood_group VARCHAR(10),
    city VARCHAR(100),
    smoking VARCHAR(50),
    alcohol VARCHAR(50),
    status VARCHAR(50) DEFAULT 'stable',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Patient Visits Table
CREATE TABLE IF NOT EXISTS visits (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(50) REFERENCES patients(patient_id) ON DELETE CASCADE,
    visit_date DATE NOT NULL,
    doctor VARCHAR(255),
    department VARCHAR(255),
    visit_type VARCHAR(100),
    chief_complaint TEXT,
    clinical_note TEXT,
    plan TEXT,
    bp_systolic INTEGER,
    bp_diastolic INTEGER,
    pulse_bpm INTEGER,
    weight_kg NUMERIC(5,2)
);

-- 4. Medications Table
CREATE TABLE IF NOT EXISTS medications (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(50) REFERENCES patients(patient_id) ON DELETE CASCADE,
    drug VARCHAR(255) NOT NULL,
    dose VARCHAR(100),
    frequency VARCHAR(100),
    route VARCHAR(100),
    prescribed_by VARCHAR(255),
    start_date DATE,
    end_date DATE,
    active BOOLEAN DEFAULT TRUE
);

-- 5. Lab Results Table
CREATE TABLE IF NOT EXISTS labs (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(50) REFERENCES patients(patient_id) ON DELETE CASCADE,
    test_name VARCHAR(255) NOT NULL,
    value VARCHAR(100),
    unit VARCHAR(50),
    status VARCHAR(50),
    normal_range VARCHAR(100),
    lab_date DATE NOT NULL
);

-- 6. Document Embeddings Table (Native PostgreSQL pgvector Store)
CREATE TABLE IF NOT EXISTS document_embeddings (
    id SERIAL PRIMARY KEY,
    patient_id VARCHAR(50) REFERENCES patients(patient_id) ON DELETE CASCADE,
    section VARCHAR(50),
    doc_date VARCHAR(50),
    content TEXT NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for rapid lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_audit_patient_id ON audit_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_labs_patient_id ON labs(patient_id);
CREATE INDEX IF NOT EXISTS idx_meds_patient_id ON medications(patient_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_patient_id ON document_embeddings(patient_id);

-- 7. Row Level Security (RLS) Configuration
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Permissive policies for application access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'patients' AND policyname = 'Enable read/write for all') THEN
    CREATE POLICY "Enable read/write for all" ON public.patients FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visits' AND policyname = 'Enable read/write for all') THEN
    CREATE POLICY "Enable read/write for all" ON public.visits FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'medications' AND policyname = 'Enable read/write for all') THEN
    CREATE POLICY "Enable read/write for all" ON public.medications FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'labs' AND policyname = 'Enable read/write for all') THEN
    CREATE POLICY "Enable read/write for all" ON public.labs FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'document_embeddings' AND policyname = 'Enable read/write for all') THEN
    CREATE POLICY "Enable read/write for all" ON public.document_embeddings FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Enable read/write for all') THEN
    CREATE POLICY "Enable read/write for all" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Enable read/write for all') THEN
    CREATE POLICY "Enable read/write for all" ON public.users FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

