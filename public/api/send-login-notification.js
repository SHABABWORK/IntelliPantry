/**
 * Vercel Serverless Function: api/send-login-notification.js
 * Securely sends real-time login alerts via Resend API
 * 
 * Target Sender: intellipantrynotify@gmail.com / IntelliPantry <onboarding@resend.dev>
 * Subject: New login detected — IntelliPantry
 */

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const data = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { email, name, loginDate, loginTime, browser, device } = data;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: "Valid email address required" });
    }

    const userName = name || email.split("@")[0] || "User";
    const actualDate = loginDate || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const actualTime = loginTime || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
    const userBrowser = browser || "Web Browser";
    const userDevice = device || "Desktop / Mobile";

    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM_EMAIL || "IntelliPantry <onboarding@resend.dev>";

    if (!apiKey) {
      console.warn("[IntelliPantry Backend] RESEND_API_KEY is not configured in Vercel environment variables.");
      return res.status(200).json({
        success: true,
        status: "pending_config",
        message: "Login recorded. Set RESEND_API_KEY in Vercel to deliver real emails."
      });
    }

    const emailSubject = "New login detected — IntelliPantry";

    // Plain text format matching specification
    const textContent = `Hello,

A new login to your IntelliPantry account was detected.

Account:
${email}

Time:
${actualDate} at ${actualTime}

Browser & Device:
${userBrowser} (${userDevice})

If this was you, no action is required.

If you do not recognize this login, please secure your account.

Regards,
IntelliPantry`;

    // Polished HTML format matching specification
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #fbfaf5; margin: 0; padding: 24px; color: #1f2823; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #e6e3da; overflow: hidden; box-shadow: 0 4px 24px rgba(30, 57, 42, 0.05); }
    .header { background: #1e392a; padding: 28px 32px; color: #ffffff; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
    .header p { margin: 6px 0 0; font-size: 13px; color: #bbf7d0; }
    .content { padding: 32px; }
    .greeting { font-size: 16px; font-weight: 700; color: #1e392a; margin-bottom: 14px; }
    .details-box { background: #f8f7f1; border: 1px solid #e8e5dc; border-radius: 14px; padding: 18px 20px; margin: 20px 0; font-size: 13.5px; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ede9df; }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #6b756e; font-weight: 600; }
    .detail-val { color: #1e392a; font-weight: 700; text-align: right; }
    .security-notice { background: #eef6f0; border-left: 4px solid #2e9e5b; padding: 14px 16px; border-radius: 8px; font-size: 13px; color: #1e392a; line-height: 1.5; margin: 20px 0; }
    .footer { text-align: center; padding: 24px; background: #faf9f5; border-top: 1px solid #e6e3da; font-size: 12px; color: #8c968f; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🍃 IntelliPantry</h1>
      <p>Smart Inventory & Expiry Management</p>
    </div>
    <div class="content">
      <div class="greeting">Hello,</div>
      <p style="font-size: 14px; color: #4b554e; line-height: 1.6; margin: 0 0 16px;">
        A new login to your IntelliPantry account was detected.
      </p>

      <div class="details-box">
        <div class="detail-row">
          <span class="detail-label">Account:</span>
          <span class="detail-val">${email}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Time:</span>
          <span class="detail-val">${actualDate} at ${actualTime}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Device & Browser:</span>
          <span class="detail-val">${userDevice} • ${userBrowser}</span>
        </div>
      </div>

      <div class="security-notice">
        <strong>Security Notice:</strong> If this was you, no action is required. If you do not recognize this login, please secure your account immediately.
      </div>

      <p style="font-size: 13.5px; color: #64748b; margin-top: 24px;">
        Regards,<br>
        <strong style="color: #1e392a;">IntelliPantry</strong>
      </p>
    </div>
    <div class="footer">
      © 2026 IntelliPantry • Fresh Food, Brighter Days.
    </div>
  </div>
</body>
</html>`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        subject: emailSubject,
        text: textContent,
        html: htmlContent
      })
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("[Resend API Error]", resendData);
      return res.status(200).json({
        success: false,
        error: "Email delivery failed on server",
        details: resendData.message || "Resend error"
      });
    }

    console.log(`[IntelliPantry] Login alert email sent successfully to ${email} (ID: ${resendData.id})`);

    return res.status(200).json({
      success: true,
      id: resendData.id,
      message: "Login notification sent"
    });

  } catch (err) {
    console.error("[Server Error in send-login-notification]", err);
    return res.status(200).json({
      success: false,
      error: "Server processing error"
    });
  }
};
