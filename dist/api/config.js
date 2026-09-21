/**
 * Vercel Serverless Function: api/config.js
 * Safely provides public, browser-safe environment variables to the frontend.
 * 
 * SECURITY NOTE:
 * NEVER expose RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, or database passwords here.
 */

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");

  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || null;
  const siteUrl = process.env.SITE_URL || "https://www.intellipantry.in";

  return res.status(200).json({
    supabaseUrl,
    supabaseAnonKey,
    siteUrl,
    configured: Boolean(supabaseUrl && supabaseAnonKey && !supabaseUrl.includes("your-project"))
  });
};
