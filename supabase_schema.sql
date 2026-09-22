-- ==============================================================================
-- INTELLIPANTRY — MASTER PRODUCTION SUPABASE DATABASE SCHEMA
-- Row Level Security (RLS) Enabled & User-Specific Pantry Isolation
-- ==============================================================================
--
-- CONFIGURATION INSTRUCTIONS:
-- 1. Open your Supabase Dashboard -> SQL Editor
-- 2. Paste this entire file and click "Run"
-- 3. Go to Authentication -> URL Configuration:
--    Site URL: https://www.intellipantry.in
--    Redirect URLs:
--      https://www.intellipantry.in/**
--      https://intellipantry.vercel.app/**
--      http://localhost:3000/**
-- ==============================================================================

-- 1. Create the Products Table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Pantry',
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  purchase_date DATE,
  expiry_date DATE,
  barcode TEXT,
  brand TEXT,
  image_url TEXT,
  min_stock NUMERIC DEFAULT 2,
  price NUMERIC DEFAULT 0,
  storage_location TEXT DEFAULT 'Pantry',
  location TEXT DEFAULT 'Pantry',
  emoji TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure brand, image_url, min_stock, and storage_location columns exist if table was previously created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'brand'
  ) THEN
    ALTER TABLE public.products ADD COLUMN brand TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.products ADD COLUMN image_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'min_stock'
  ) THEN
    ALTER TABLE public.products ADD COLUMN min_stock NUMERIC DEFAULT 2;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'storage_location'
  ) THEN
    ALTER TABLE public.products ADD COLUMN storage_location TEXT DEFAULT 'Pantry';
  END IF;
END $$;

-- 2. Performance Indexes for User Queries & Expiry Sorting
CREATE INDEX IF NOT EXISTS idx_products_user_id ON public.products (user_id);
CREATE INDEX IF NOT EXISTS idx_products_user_expiry ON public.products (user_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_products_user_category ON public.products (user_id, category);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they already exist to ensure idempotency
DROP POLICY IF EXISTS "Users can only select their own products" ON public.products;
DROP POLICY IF EXISTS "Users can only insert their own products" ON public.products;
DROP POLICY IF EXISTS "Users can only update their own products" ON public.products;
DROP POLICY IF EXISTS "Users can only delete their own products" ON public.products;

-- 4. Strict Row Level Security Policies
-- SELECT: Users can only query products where user_id matches auth.uid()
CREATE POLICY "Users can only select their own products"
ON public.products
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- INSERT: Users can only insert products where user_id matches auth.uid()
CREATE POLICY "Users can only insert their own products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only modify products where user_id matches auth.uid()
CREATE POLICY "Users can only update their own products"
ON public.products
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can only delete products where user_id matches auth.uid()
CREATE POLICY "Users can only delete their own products"
ON public.products
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 5. Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_products_updated_at ON public.products;
CREATE TRIGGER trigger_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 6. User Settings Table
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{"alert_expiry":true,"alert_expired":true,"alert_low_stock":true,"alert_security":true,"alert_weekly_summary":false}'::jsonb,
  pantry_settings JSONB NOT NULL DEFAULT '{"expiry_warning_days":7,"low_stock_threshold":2,"default_unit":"pcs","default_category":"Pantry"}'::jsonb,
  general_settings JSONB NOT NULL DEFAULT '{"language":"English","timezone":"Asia/Kolkata","currency":"INR","date_format":"DD/MM/YYYY","theme":"light"}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only view their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can delete their own settings" ON public.user_settings;

CREATE POLICY "Users can only view their own settings"
ON public.user_settings FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
ON public.user_settings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
ON public.user_settings FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings"
ON public.user_settings FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trigger_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER trigger_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 7. Pantry Activity Logs Table
CREATE TABLE IF NOT EXISTS public.pantry_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'added', 'updated', 'quantity_changed', 'deleted'
  product_id TEXT,
  product_name TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pantry_activity_user_created ON public.pantry_activity (user_id, created_at DESC);

ALTER TABLE public.pantry_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only view their own activity" ON public.pantry_activity;
DROP POLICY IF EXISTS "Users can insert their own activity" ON public.pantry_activity;
DROP POLICY IF EXISTS "Users can delete their own activity" ON public.pantry_activity;

CREATE POLICY "Users can only view their own activity"
ON public.pantry_activity FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity"
ON public.pantry_activity FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own activity"
ON public.pantry_activity FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 8. Pantry Alerts Table
CREATE TABLE IF NOT EXISTS public.pantry_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'system', -- 'expiry', 'low_stock', 'security', 'system'
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_pantry_alerts_user_unread ON public.pantry_alerts (user_id, is_read, created_at DESC);

ALTER TABLE public.pantry_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only view their own alerts" ON public.pantry_alerts;
DROP POLICY IF EXISTS "Users can insert their own alerts" ON public.pantry_alerts;
DROP POLICY IF EXISTS "Users can update their own alerts" ON public.pantry_alerts;
DROP POLICY IF EXISTS "Users can delete their own alerts" ON public.pantry_alerts;

CREATE POLICY "Users can only view their own alerts"
ON public.pantry_alerts FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own alerts"
ON public.pantry_alerts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
ON public.pantry_alerts FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alerts"
ON public.pantry_alerts FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 9. Enable Realtime Replication for Products, User Settings, Activity & Alerts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'user_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_settings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'pantry_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pantry_activity;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'pantry_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pantry_alerts;
  END IF;
END $$;

