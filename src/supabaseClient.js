import { createClient } from "@supabase/supabase-js";

// ==============================================================================
// SUPABASE CLIENT CONFIGURATION
// Paste your Supabase Project URL and Public Anon Key below:
// Your Supabase Project ID: oubfjolxhvkujjjnzvol
// ==============================================================================

// 1. Paste your Supabase Project URL here:
const SUPABASE_URL = "{{SUPABASE_URL}}"; // e.g. "https://oubfjolxhvkujjjnzvol.supabase.co"

// 2. Paste your Supabase Public/Anon Key here:
const SUPABASE_PUBLIC_KEY = "{{SUPABASE_KEY}}"; // e.g. "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

// Export the initialized Supabase client:
export const supabase = createClient(
  SUPABASE_URL.startsWith("{{") ? "https://oubfjolxhvkujjjnzvol.supabase.co" : SUPABASE_URL,
  SUPABASE_PUBLIC_KEY.startsWith("{{") ? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91YmZqb2x4aHZrdWpqam56dm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDk1NzMsImV4cCI6MjEwNTU4NTU3M30.v637P_FSQIKQq4PrfujlXGa2ciGR9UD68UY9vH_cqN4" : SUPABASE_PUBLIC_KEY
);

// Helper for "Continue with Google" OAuth Login
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : "/"
    }
  });
  if (error) throw error;
  return data;
}
