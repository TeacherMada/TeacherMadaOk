-- ==============================================================================
-- TEACHERMADA - GOLDEN SQL SCHEMA (SUPABASE)
-- ==============================================================================
-- Ce script crée l'architecture de base de données robuste, sécurisée (RLS) 
-- et optimisée pour les performances (JSONB pour les données flexibles).
-- ==============================================================================

-- 1. Extensions requises
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Table des Profils Utilisateurs (Étend auth.users)
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    credits INTEGER DEFAULT 50,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    
    -- Utilisation de JSONB pour les données flexibles (Évite les jointures lourdes)
    preferences JSONB DEFAULT '{}'::jsonb,
    stats JSONB DEFAULT '{"lessonsCompleted": 0, "exercisesCompleted": 0, "vocabularyMastered": 0, "totalStudyTime": 0}'::jsonb,
    learning_profile JSONB DEFAULT '{}'::jsonb,
    ai_memory JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table des Sessions d'Apprentissage (Désengorge le profil)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY, -- Format: tm_session_{userId}_{lang}_{level}_{mode}
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    messages JSONB DEFAULT '[]'::jsonb, -- Historique compressé
    progress INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table des Paramètres Système (Sécurisée)
CREATE TABLE system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    api_keys TEXT[] DEFAULT '{}',
    active_model TEXT DEFAULT 'gemini-3.1-pro-preview',
    credit_price INTEGER DEFAULT 50,
    custom_languages JSONB DEFAULT '[]'::jsonb,
    valid_transaction_refs TEXT[] DEFAULT '{}',
    admin_contact JSONB DEFAULT '{"telma": "0349310268", "airtel": "0333878420", "orange": "0326979017"}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Table des Requêtes Admin (Recharges de crédits)
CREATE TABLE admin_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER,
    message TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- SÉCURITÉ : ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_requests ENABLE ROW LEVEL SECURITY;

-- POLITIQUES PROFILES
CREATE POLICY "Les utilisateurs peuvent lire leur propre profil" 
    ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Les utilisateurs peuvent modifier leur propre profil" 
    ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Les admins voient tous les profils" 
    ON profiles FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Les admins modifient tous les profils" 
    ON profiles FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- POLITIQUES SESSIONS
CREATE POLICY "Les utilisateurs gèrent leurs propres sessions" 
    ON sessions FOR ALL USING (auth.uid() = user_id);

-- POLITIQUES SYSTEM SETTINGS
CREATE POLICY "Tout le monde peut lire les paramètres" 
    ON system_settings FOR SELECT USING (true);

CREATE POLICY "Seuls les admins modifient les paramètres" 
    ON system_settings FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- POLITIQUES ADMIN REQUESTS
CREATE POLICY "Les utilisateurs voient leurs propres requêtes" 
    ON admin_requests FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Les utilisateurs créent leurs propres requêtes" 
    ON admin_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Les admins gèrent toutes les requêtes" 
    ON admin_requests FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ==============================================================================
-- TRIGGERS (Mise à jour automatique de updated_at)
-- ==============================================================================
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_modtime BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_sessions_modtime BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_settings_modtime BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_modified_column();
