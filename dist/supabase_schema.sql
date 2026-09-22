-- ==============================================================================
-- INTELLIPANTRY — MASTER MULTI-USER REAL-TIME DATABASE SCHEMA
-- PostgreSQL + Row Level Security (RLS) + Realtime Replication
-- ==============================================================================
--
-- INSTRUCTIONS FOR SUPABASE DASHBOARD:
-- 1. Open Supabase Dashboard -> SQL Editor
-- 2. Paste this entire script and click "Run"
-- 3. Everything is idempotent (safe to run multiple times without data loss)
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. PROFILES TABLE (Linked 1:1 with auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Auto-create profile trigger on auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ==============================================================================
-- 2. PANTRY PRODUCTS TABLE (User-Isolated Inventory)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pantry_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  brand TEXT,
  category TEXT NOT NULL DEFAULT 'Pantry',
  barcode TEXT,
  product_image TEXT,
  description TEXT,
  ingredients TEXT,
  nutrition JSONB,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  purchase_date DATE,
  expiry_date DATE,
  minimum_stock NUMERIC DEFAULT 2,
  storage_location TEXT DEFAULT 'Pantry',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Performance Indexes for Pantry Products
CREATE INDEX IF NOT EXISTS idx_pantry_products_user_id ON public.pantry_products (user_id);
CREATE INDEX IF NOT EXISTS idx_pantry_products_expiry ON public.pantry_products (user_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_pantry_products_barcode ON public.pantry_products (user_id, barcode);
CREATE INDEX IF NOT EXISTS idx_pantry_products_created ON public.pantry_products (user_id, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.pantry_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only view their own pantry products" ON public.pantry_products;
DROP POLICY IF EXISTS "Users can only insert their own pantry products" ON public.pantry_products;
DROP POLICY IF EXISTS "Users can only update their own pantry products" ON public.pantry_products;
DROP POLICY IF EXISTS "Users can only delete their own pantry products" ON public.pantry_products;

CREATE POLICY "Users can only view their own pantry products"
  ON public.pantry_products FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own pantry products"
  ON public.pantry_products FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own pantry products"
  ON public.pantry_products FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own pantry products"
  ON public.pantry_products FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trigger_pantry_products_updated_at ON public.pantry_products;
CREATE TRIGGER trigger_pantry_products_updated_at
  BEFORE UPDATE ON public.pantry_products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Backward compatibility: If public.products already existed, migrate any rows to pantry_products
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
    INSERT INTO public.pantry_products (
      id, user_id, product_name, brand, category, barcode, product_image, 
      quantity, unit, purchase_date, expiry_date, minimum_stock, storage_location, created_at, updated_at
    )
    SELECT 
      id, user_id, name, brand, category, barcode, image_url,
      quantity, unit, purchase_date, expiry_date, COALESCE(min_stock, 2), COALESCE(storage_location, 'Pantry'), created_at, updated_at
    FROM public.products
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;


-- ==============================================================================
-- 3. ALERTS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'system', -- 'expiry', 'low_stock', 'security', 'system'
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_unread ON public.alerts (user_id, is_read, created_at DESC);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only view their own alerts" ON public.alerts;
DROP POLICY IF EXISTS "Users can insert their own alerts" ON public.alerts;
DROP POLICY IF EXISTS "Users can update their own alerts" ON public.alerts;
DROP POLICY IF EXISTS "Users can delete their own alerts" ON public.alerts;

CREATE POLICY "Users can only view their own alerts"
  ON public.alerts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own alerts"
  ON public.alerts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
  ON public.alerts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alerts"
  ON public.alerts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Backward compatibility: Migrate from public.pantry_alerts if existing
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pantry_alerts') THEN
    INSERT INTO public.alerts (id, user_id, title, message, type, is_read, created_at)
    SELECT id, user_id, title, message, type, is_read, created_at
    FROM public.pantry_alerts
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;


-- ==============================================================================
-- 4. NOTIFICATION PREFERENCES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{"alert_expiry":true,"alert_expired":true,"alert_low_stock":true,"alert_security":true,"alert_weekly_summary":false}'::jsonb,
  pantry_settings JSONB NOT NULL DEFAULT '{"expiry_warning_days":7,"low_stock_threshold":2,"default_unit":"pcs","default_category":"Pantry"}'::jsonb,
  general_settings JSONB NOT NULL DEFAULT '{"language":"English","timezone":"Asia/Kolkata","currency":"INR","date_format":"DD/MM/YYYY","theme":"light"}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can delete their own preferences" ON public.notification_preferences;

CREATE POLICY "Users can view their own preferences"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preferences"
  ON public.notification_preferences FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trigger_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER trigger_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Backward compatibility: Migrate from public.user_settings if existing
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_settings') THEN
    INSERT INTO public.notification_preferences (user_id, preferences, pantry_settings, general_settings, updated_at)
    SELECT user_id, preferences, pantry_settings, general_settings, updated_at
    FROM public.user_settings
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;


-- ==============================================================================
-- 5. ACTIVITY LOGS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'added', 'updated', 'quantity_changed', 'deleted'
  product_id TEXT,
  product_name TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON public.activity_logs (user_id, created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can insert their own activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can delete their own activity logs" ON public.activity_logs;

CREATE POLICY "Users can view their own activity logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity logs"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own activity logs"
  ON public.activity_logs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Backward compatibility: Migrate from public.pantry_activity if existing
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pantry_activity') THEN
    INSERT INTO public.activity_logs (id, user_id, action, product_id, product_name, details, created_at)
    SELECT id, user_id, action, product_id, product_name, details, created_at
    FROM public.pantry_activity
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;


-- ==============================================================================
-- 6. EMAIL NOTIFICATIONS AUDIT TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'login_security',
  status TEXT NOT NULL DEFAULT 'sent',
  provider TEXT NOT NULL DEFAULT 'resend',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.email_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own email audit" ON public.email_notifications;
CREATE POLICY "Users can view their own email audit"
  ON public.email_notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);


-- ==============================================================================
-- 7. SUPABASE REALTIME REPLICATION CONFIGURATION
-- ==============================================================================
DO $$
BEGIN
  -- Add pantry_products to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'pantry_products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pantry_products;
  END IF;

  -- Add alerts to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
  END IF;

  -- Add notification_preferences to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'notification_preferences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_preferences;
  END IF;

  -- Add activity_logs to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
  END IF;
END $$;
