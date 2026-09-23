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
-- 2. PANTRY ITEMS TABLE (Master User-Isolated Inventory: pantry_items)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pantry_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  brand TEXT,
  category TEXT NOT NULL DEFAULT 'Pantry',
  barcode TEXT,
  product_image TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  quantity_unit TEXT NOT NULL DEFAULT 'pcs',
  purchase_date DATE,
  expiry_date DATE,
  low_stock_threshold NUMERIC DEFAULT 2,
  notes TEXT,
  storage_location TEXT DEFAULT 'Pantry',
  unit TEXT DEFAULT 'pcs',                 -- Compatibility alias column
  minimum_stock NUMERIC DEFAULT 2,          -- Compatibility alias column
  description TEXT,                         -- Compatibility alias column
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure all columns exist idempotently if pantry_items was created previously
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Pantry';
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS product_image TEXT;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 1;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS quantity_unit TEXT DEFAULT 'pcs';
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC DEFAULT 2;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS storage_location TEXT DEFAULT 'Pantry';
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'pcs';
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS minimum_stock NUMERIC DEFAULT 2;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.pantry_items ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Performance Indexes for Pantry Items
CREATE INDEX IF NOT EXISTS idx_pantry_items_user_id ON public.pantry_items (user_id);
CREATE INDEX IF NOT EXISTS idx_pantry_items_expiry ON public.pantry_items (user_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_pantry_items_barcode ON public.pantry_items (user_id, barcode);
CREATE INDEX IF NOT EXISTS idx_pantry_items_created ON public.pantry_items (user_id, created_at DESC);

-- Enable Row Level Security (RLS) on pantry_items
ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can only view their own pantry items" ON public.pantry_items;
DROP POLICY IF EXISTS "Users can only insert their own pantry items" ON public.pantry_items;
DROP POLICY IF EXISTS "Users can only update their own pantry items" ON public.pantry_items;
DROP POLICY IF EXISTS "Users can only delete their own pantry items" ON public.pantry_items;

CREATE POLICY "Users can only view their own pantry items"
  ON public.pantry_items FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own pantry items"
  ON public.pantry_items FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own pantry items"
  ON public.pantry_items FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own pantry items"
  ON public.pantry_items FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trigger_pantry_items_updated_at ON public.pantry_items;
CREATE TRIGGER trigger_pantry_items_updated_at
  BEFORE UPDATE ON public.pantry_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Synchronize alias columns on insert/update in pantry_items
CREATE OR REPLACE FUNCTION public.sync_pantry_items_aliases()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantity_unit IS NULL AND NEW.unit IS NOT NULL THEN
    NEW.quantity_unit := NEW.unit;
  END IF;
  IF NEW.unit IS NULL AND NEW.quantity_unit IS NOT NULL THEN
    NEW.unit := NEW.quantity_unit;
  END IF;
  IF NEW.low_stock_threshold IS NULL AND NEW.minimum_stock IS NOT NULL THEN
    NEW.low_stock_threshold := NEW.minimum_stock;
  END IF;
  IF NEW.minimum_stock IS NULL AND NEW.low_stock_threshold IS NOT NULL THEN
    NEW.minimum_stock := NEW.low_stock_threshold;
  END IF;
  IF NEW.notes IS NULL AND NEW.description IS NOT NULL THEN
    NEW.notes := NEW.description;
  END IF;
  IF NEW.description IS NULL AND NEW.notes IS NOT NULL THEN
    NEW.description := NEW.notes;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_pantry_items_aliases ON public.pantry_items;
CREATE TRIGGER trigger_sync_pantry_items_aliases
  BEFORE INSERT OR UPDATE ON public.pantry_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_pantry_items_aliases();

-- Backward compatibility table: pantry_products (mirrors pantry_items if already used)
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

-- Backward compatibility migration: Migrate existing data from pantry_products and products to pantry_items
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pantry_products') THEN
    INSERT INTO public.pantry_items (
      id, user_id, product_name, brand, category, barcode, product_image,
      quantity, quantity_unit, unit, purchase_date, expiry_date, low_stock_threshold, minimum_stock, notes, description, storage_location, created_at, updated_at
    )
    SELECT 
      id, user_id, product_name, brand, category, barcode, product_image,
      quantity, unit, unit, purchase_date, expiry_date, COALESCE(minimum_stock, 2), COALESCE(minimum_stock, 2), description, description, COALESCE(storage_location, 'Pantry'), created_at, updated_at
    FROM public.pantry_products
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
    INSERT INTO public.pantry_items (
      id, user_id, product_name, brand, category, barcode, product_image,
      quantity, quantity_unit, unit, purchase_date, expiry_date, low_stock_threshold, minimum_stock, notes, description, storage_location, created_at, updated_at
    )
    SELECT 
      id, user_id, name, brand, category, barcode, image_url,
      quantity, unit, unit, purchase_date, expiry_date, COALESCE(min_stock, 2), COALESCE(min_stock, 2), NULL, NULL, COALESCE(storage_location, 'Pantry'), created_at, updated_at
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
  -- Add pantry_items to realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'pantry_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pantry_items;
  END IF;

  -- Add pantry_products to realtime publication (compatibility)
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
