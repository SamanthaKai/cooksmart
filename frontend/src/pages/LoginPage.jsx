import { useState } from "react";
import { api } from "../api/client";

export default function LoginPage({ onLogin }) {
  const [tab, setTab]           = useState("login");   // "login" | "register"
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body = tab === "register"
        ? { name, email, password }
        : { email, password };
      const data = tab === "register"
        ? await api.register(body)
        : await api.login(body);
      localStorage.setItem("cooksmart_token", data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function switchTab(t) {
    setTab(t);
    setError("");
    setName("");
    setEmail("");
    setPassword("");
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Brand */}
        <div className="login-brand">
          Cook<span>Smart</span>
        </div>
        <p className="login-tagline">Authentic Ugandan &amp; African recipes</p>

        {/* Tab toggle */}
        <div className="login-tabs">
          <button
            className={`login-tab${tab === "login" ? " active" : ""}`}
            onClick={() => switchTab("login")}
          >
            Sign In
          </button>
          <button
            className={`login-tab${tab === "register" ? " active" : ""}`}
            onClick={() => switchTab("register")}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          {tab === "register" && (
            <div className="login-field">
              <label className="login-label">Full Name</label>
              <input
                className="login-input"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div className="login-field">
            <label className="login-label">Email Address</label>
            <input
              className="login-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="login-field">
            <label className="login-label">Password</label>
            <input
              className="login-input"
              type="password"
              placeholder={tab === "register" ? "At least 6 characters" : "Your password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={tab === "register" ? "new-password" : "current-password"}
            />
          </div>

          {error && (
            <div className="login-error">{error}</div>
          )}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading
              ? (tab === "register" ? "Creating account…" : "Signing in…")
              : (tab === "register" ? "Create Account" : "Sign In")}
          </button>
        </form>

        <p className="login-switch">
          {tab === "login" ? (
            <>Don't have an account?{" "}
              <button className="login-link" onClick={() => switchTab("register")}>Sign up free</button>
            </>
          ) : (
            <>Already have an account?{" "}
              <button className="login-link" onClick={() => switchTab("login")}>Sign in</button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
