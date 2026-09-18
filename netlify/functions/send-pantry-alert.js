/**
 * Netlify Serverless Function: send-pantry-alert
 * Modular email dispatch system for:
 * - Expiry Alerts
 * - Expired Items Alerts
 * - Low-Stock Alerts
 * - Out-of-Stock Alerts
 * - Weekly Summary
 * - Test Email Alerts
 * 
 * SECURITY:
 * - RESEND_API_KEY is read strictly server-side from process.env
 * - Never returns or leaks the API key to the client
 */

exports.handler = async function (event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: "Method Not Allowed" })
    };
  }

  try {
    const data = JSON.parse(event.body || "{}");
    const { email, type, items = [], customMessage } = data;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: "Valid email address required" })
      };
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM_EMAIL || "Smart Pantry <onboarding@resend.dev>";

    if (!apiKey) {
      console.warn("[Smart Pantry Backend] RESEND_API_KEY is not set in Netlify environment variables.");
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          status: "pending_config",
          message: "Alert triggered. Set RESEND_API_KEY in Netlify to deliver real emails."
        })
      };
    }

    // Determine subject & template based on type
    let subject = "Smart Pantry - Notification";
    let heading = "Smart Pantry Notification";
    let bodyIntro = "Here is an update regarding your pantry inventory:";

    switch (type) {
      case "test":
        subject = "Smart Pantry - Test Email Alert";
        heading = "🌿 Test Email Alert Successful!";
        bodyIntro = "This is a real test notification from your Smart Pantry application. Your Resend API integration is working properly!";
        break;
      case "expiry":
        subject = "Smart Pantry - Items Expiring Soon Alert";
        heading = "⏰ Items Expiring Soon in Your Pantry";
        bodyIntro = "The following items in your pantry will expire within the next 7 days. Plan your meals to reduce waste:";
        break;
      case "expired":
        subject = "Smart Pantry - Expired Items Notice";
        heading = "⚠️ Expired Items Detected";
        bodyIntro = "The following items in your pantry have passed their expiration date:";
        break;
      case "low_stock":
        subject = "Smart Pantry - Low Stock Alert";
        heading = "📉 Low Stock in Your Pantry";
        bodyIntro = "You are running low on the following pantry essentials:";
        break;
      case "stock_out":
        subject = "Smart Pantry - Out of Stock Alert";
        heading = "🚫 Out of Stock Alert";
        bodyIntro = "The following items have run out and should be added to your shopping list:";
        break;
      case "weekly_summary":
        subject = "Smart Pantry - Your Weekly Pantry Summary";
        heading = "📊 Weekly Pantry & Waste Reduction Summary";
        bodyIntro = "Here is your weekly summary of tracked items, fresh foods, and waste reduction:";
        break;
      default:
        subject = "Smart Pantry - Inventory Update";
        heading = "🍃 Pantry Update";
    }

    // Format items list if provided
    let itemsHtml = "";
    let itemsText = "";
    if (items && items.length > 0) {
      itemsText = "\n\nItems:\n" + items.map(i => `- ${i.name || i} (${i.quantity || ""} ${i.unit || ""}) - Status: ${i.status || "Check"}`).join("\n");
      itemsHtml = `<div style="background:#f8f7f1; border-radius:14px; padding:16px; margin:18px 0; border:1px solid #e8e5dc;">
        <h4 style="margin:0 0 10px; font-size:13px; color:#1e392a; text-transform:uppercase;">Affected Items</h4>
        <ul style="margin:0; padding-left:20px; font-size:13.5px; color:#334139;">
          ${items.map(i => `<li style="padding:4px 0;"><strong>${i.name || i}</strong> ${i.quantity ? `— ${i.quantity} ${i.unit || ''}` : ''} <span style="color:#c28829; font-size:12px;">(${i.status || 'Active'})</span></li>`).join("")}
        </ul>
      </div>`;
    }

    const textContent = `${heading}

${bodyIntro}
${customMessage ? `\nNote: ${customMessage}\n` : ""}
${itemsText}

Manage your inventory online anytime at Smart Pantry.

Smart Pantry
Inventory & Expiry Management`;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #fbfaf5; margin: 0; padding: 24px; color: #1f2823; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #e6e3da; overflow: hidden; box-shadow: 0 4px 24px rgba(30, 57, 42, 0.05); }
    .header { background: #1e392a; padding: 24px 32px; color: #ffffff; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; }
    .content { padding: 30px; }
    .footer { text-align: center; padding: 20px; background: #faf9f5; border-top: 1px solid #e6e3da; font-size: 12px; color: #8c968f; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🍃 Smart Pantry</h1>
      <p style="margin:4px 0 0; font-size:12.5px; color:#bbf7d0;">${heading}</p>
    </div>
    <div class="content">
      <p style="font-size: 14.5px; color: #334139; line-height: 1.6; margin-top: 0;">
        ${bodyIntro}
      </p>
      ${customMessage ? `<p style="font-size:13.5px; color:#556258; background:#f4f8f5; padding:12px; border-radius:10px;">${customMessage}</p>` : ""}
      ${itemsHtml}
    </div>
    <div class="footer">
      © 2025 Smart Pantry • Inventory & Expiry Management
    </div>
  </div>
</body>
</html>`;

    // Send via Resend REST API
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        subject: subject,
        text: textContent,
        html: htmlContent
      })
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("[Resend API Alert Error]", resendData);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Alert email delivery failed on server",
          details: resendData.message || "Resend error"
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id: resendData.id,
        message: "Alert email sent successfully"
      })
    };
  } catch (err) {
    console.error("[Server Error in send-pantry-alert]", err);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: "Server processing error"
      })
    };
  }
};
