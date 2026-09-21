-- ==============================================================================
-- SMART PANTRY — PRODUCTION SUPABASE DATABASE SCHEMA
-- Row Level Security (RLS) Enabled & User-Specific Pantry Isolation
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
  price NUMERIC DEFAULT 0,
  location TEXT DEFAULT 'Pantry',
  emoji TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

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

-- 6. Enable Realtime Replication for Products
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
END $$;
