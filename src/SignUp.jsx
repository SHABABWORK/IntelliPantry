import React, { useState } from "react";
import { supabase, signInWithGoogle } from "./supabaseClient.js";

export default function SignUp({ onNavigateToSignIn }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignUp(e) {
    e.preventDefault();
    setErrorMsg("");

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : "/"
        }
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
        return;
      }

      // 1) After a successful Supabase signUp({ email, password }):
      // - Do NOT auto-login.
      // - If data.session is null, don't redirect to the dashboard.
      // - Redirect the user to the Sign In page with email pre-filled.
      if (!data.session) {
        if (typeof onNavigateToSignIn === "function") {
          onNavigateToSignIn(
            email,
            "Your account has been created. Please check your email and verify your address before logging in."
          );
        } else {
          // Fallback redirect with query params to prefill email on Sign In page
          const targetUrl = `/login.html?email=${encodeURIComponent(email)}&registered=true`;
          window.location.href = targetUrl;
        }
        return;
      }

      // If a session exists (auto-confirm enabled), redirect to Home
      window.location.href = "/";
    } catch (err) {
      setErrorMsg(err.message || "Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    setErrorMsg("");
    try {
      await signInWithGoogle();
    } catch (err) {
      setErrorMsg(err.message || "Failed to continue with Google.");
    }
  }

  return (
    <div className="auth-card">
      <h2 className="view-title">Create Your Account</h2>
      <p className="view-sub">Join thousands of users managing their food smarter.</p>

      <form onSubmit={handleSignUp}>
        <div className="input-group">
          <label className="input-label">Full Name</label>
          <input
            type="text"
            className="auth-input"
            placeholder="e.g. Alex Johnson"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>

        <div className="input-group">
          <label className="input-label">Email Address</label>
          <input
            type="email"
            className="auth-input"
            placeholder="name@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="input-group">
          <label className="input-label">Password</label>
          <input
            type="password"
            className="auth-input"
            placeholder="Create a password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        <div className="input-group">
          <label className="input-label">Confirm Password</label>
          <input
            type="password"
            className="auth-input"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        {/* Small error message under the form if signup fails */}
        {errorMsg && (
          <div className="alert-banner error" style={{ margin: "10px 0", padding: "10px", borderRadius: "8px", background: "#fee2e2", color: "#991b1b", fontSize: "13px" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <button type="submit" className="btn-forest-submit" disabled={loading} style={{ width: "100%", padding: "12px", background: "#1e392a", color: "#ffffff", borderRadius: "10px", border: "none", fontWeight: 700, cursor: "pointer", marginTop: "12px" }}>
          {loading ? "Creating Account..." : "Create Account"}
        </button>

        {/* Continue with Google Button */}
        <div style={{ display: "flex", alignItems: "center", margin: "16px 0", color: "#8c968f", fontSize: "12px" }}>
          <div style={{ flex: 1, height: "1px", background: "#e6e3da" }} />
          <span style={{ padding: "0 10px", textTransform: "uppercase", fontWeight: 600 }}>or</span>
          <div style={{ flex: 1, height: "1px", background: "#e6e3da" }} />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignUp}
          className="btn-google-oauth"
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "11px", borderRadius: "10px", border: "1px solid #d9d6cd", background: "#ffffff", color: "#1e392a", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24Z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/></svg>
          Continue with Google
        </button>
      </form>

      <div className="auth-toggle-footer" style={{ marginTop: "20px", textAlign: "center", fontSize: "13px" }}>
        Already have an account?{" "}
        <a onClick={() => onNavigateToSignIn && onNavigateToSignIn()} style={{ color: "#1e392a", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
          Log In
        </a>
      </div>
    </div>
  );
}
