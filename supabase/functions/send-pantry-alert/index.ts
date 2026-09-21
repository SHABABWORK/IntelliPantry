// Supabase Edge Function: send-pantry-alert
// Deploy with: supabase functions deploy send-pantry-alert --no-verify-jwt
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, type, items = [] } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "IntelliPantry <onboarding@resend.dev>";

    if (!resendKey) {
      return new Response(
        JSON.stringify({ success: false, message: "RESEND_API_KEY not set in Supabase secrets" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const itemListText = items.map((i: any) => `- ${i.name} (${i.quantity} ${i.unit || 'pcs'}) ${i.expiryDate ? 'Expires: ' + i.expiryDate : ''}`).join('\n');
    const isExpiry = type === 'expiry';
    const subject = isExpiry ? "Pantry Alert: Items Expiring Soon — IntelliPantry" : "Pantry Alert: Low Stock Warning — IntelliPantry";

    const textContent = `Hello,

This is an automated pantry alert from IntelliPantry.

Alert: ${isExpiry ? 'Items approaching expiry' : 'Low stock items needing restock'}

Items:
${itemListText || 'Check your pantry dashboard for details.'}

Log in to manage your inventory:
https://www.intellipantry.in

Regards,
IntelliPantry`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        reply_to: "intellipantrynotify@gmail.com",
        subject,
        text: textContent,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
