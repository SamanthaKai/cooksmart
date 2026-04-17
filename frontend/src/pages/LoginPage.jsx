import { useState } from "react";
import { api } from "../api/client";

function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export default function LoginPage({ onLogin, onBack, isModal = false }) {
  const [tab, setTab]           = useState("login");   // "login" | "register"
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
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
    setShowPw(false);
  }

  if (isModal) {
    return (
      <div className="login-card login-card--modal">
        {onBack && (
          <button className="login-modal-close" onClick={onBack} aria-label="Close">✕</button>
        )}
        <div className="login-brand">Cook<span>Smart</span></div>
        <p className="login-tagline">Sign in to save and like recipes</p>
        <div className="login-tabs">
          <button className={`login-tab${tab === "login" ? " active" : ""}`} onClick={() => switchTab("login")}>Sign In</button>
          <button className={`login-tab${tab === "register" ? " active" : ""}`} onClick={() => switchTab("register")}>Create Account</button>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {tab === "register" && (
            <div className="login-field">
              <label className="login-label">Full Name</label>
              <input className="login-input" type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" autoFocus />
            </div>
          )}
          <div className="login-field">
            <label className="login-label">Email Address</label>
            <input className="login-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus={tab === "login"} />
          </div>
          <div className="login-field">
            <label className="login-label">Password</label>
            <div className="login-pw-wrap">
              <input className="login-input" type={showPw ? "text" : "password"} placeholder={tab === "register" ? "At least 6 characters" : "Your password"} value={password} onChange={e => setPassword(e.target.value)} required autoComplete={tab === "register" ? "new-password" : "current-password"} />
              <button type="button" className="login-pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}><EyeIcon open={showPw} /></button>
            </div>
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? (tab === "register" ? "Creating account…" : "Signing in…") : (tab === "register" ? "Create Account" : "Sign In")}
          </button>
        </form>
        <p className="login-switch">
          {tab === "login"
            ? <><span>Don't have an account? </span><button className="login-link" onClick={() => switchTab("register")}>Sign up free</button></>
            : <><span>Already have an account? </span><button className="login-link" onClick={() => switchTab("login")}>Sign in</button></>
          }
        </p>
      </div>
    );
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
                autoFocus
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
              autoFocus={tab === "login"}
            />
          </div>

          <div className="login-field">
            <label className="login-label">Password</label>
            <div className="login-pw-wrap">
              <input
                className="login-input"
                type={showPw ? "text" : "password"}
                placeholder={tab === "register" ? "At least 6 characters" : "Your password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={tab === "register" ? "new-password" : "current-password"}
              />
              <button
                type="button"
                className="login-pw-toggle"
                onClick={() => setShowPw(v => !v)}
                tabIndex={-1}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                <EyeIcon open={showPw} />
              </button>
            </div>
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

        {onBack && (
          <p className="login-browse-link">
            <button className="login-link" onClick={onBack}>← Browse recipes without signing in</button>
          </p>
        )}
      </div>
    </div>
  );
}
