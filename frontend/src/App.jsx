import { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircle2, X } from "lucide-react";
import Home from "./pages/Home";
import RecipeDetail from "./pages/RecipeDetail";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import MealPlanPage from "./pages/MealPlanPage";
import Footer from "./components/Footer";
import { api } from "./api/client";
import "./index.css";

export default function App() {
  const [user, setUser]               = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage]               = useState("home");
  const [currentRecipeId, setCurrentRecipeId] = useState(null);

  // ── Interaction state (save / like icon data) ─────────────────────────────
  const [savedIds, setSavedIds] = useState(new Set());
  const [likedIds, setLikedIds] = useState(new Set());
  const [showLoginModal, setShowLoginModal] = useState(false);

  // ── Toast state ───────────────────────────────────────────────────────────
  const [signinToast, setSigninToast] = useState(null); // { name, key, exiting }
  const [signoutToast, setSignoutToast] = useState(null);
  const signinTimer  = useRef(null);
  const signinExit   = useRef(null);
  const signoutTimer = useRef(null);

  const loadInteractions = useCallback(async () => {
    try {
      const data = await api.getInteractions();
      setSavedIds(new Set(data.saved));
      setLikedIds(new Set(data.liked));
    } catch {}
  }, []);

  // Verify stored token on mount
  useEffect(() => {
    const token = localStorage.getItem("cooksmart_token");
    if (!token) { setAuthLoading(false); return; }
    api.me()
      .then(data => {
        setUser(data.user);
        return loadInteractions();
      })
      .catch(() => localStorage.removeItem("cooksmart_token"))
      .finally(() => setAuthLoading(false));
  }, [loadInteractions]);

  function dismissSigninToast() {
    clearTimeout(signinTimer.current);
    setSigninToast(prev => prev ? { ...prev, exiting: true } : null);
    signinExit.current = setTimeout(() => setSigninToast(null), 300);
  }

  function handleLogin(loggedInUser) {
    setUser(loggedInUser);
    setShowLoginModal(false);
    setPage(prev => prev === "login" ? "home" : prev);
    loadInteractions();

    clearTimeout(signinTimer.current);
    clearTimeout(signinExit.current);
    setSigninToast({ name: loggedInUser.name.split(" ")[0], key: Date.now(), exiting: false });
    signinTimer.current = setTimeout(dismissSigninToast, 4000);
  }

  function handleLogout() {
    localStorage.removeItem("cooksmart_token");
    setUser(null);
    setSavedIds(new Set());
    setLikedIds(new Set());
    setPage("home");
    setCurrentRecipeId(null);

    clearTimeout(signoutTimer.current);
    setSignoutToast({ key: Date.now() });
    signoutTimer.current = setTimeout(() => setSignoutToast(null), 2800);
  }

  function handleSelectRecipe(id) {
    setCurrentRecipeId(id);
    setPage("recipe");
  }

  function requestLogin() {
    setShowLoginModal(true);
  }

  async function handleToggleSave(recipeId) {
    if (!user) { setShowLoginModal(true); return; }
    try {
      const data = await api.toggleInteraction(recipeId, 'saved');
      setSavedIds(prev => {
        const next = new Set(prev);
        data.active ? next.add(recipeId) : next.delete(recipeId);
        return next;
      });
    } catch {}
  }

  async function handleToggleLike(recipeId) {
    if (!user) { setShowLoginModal(true); return; }
    try {
      const data = await api.toggleInteraction(recipeId, 'liked');
      setLikedIds(prev => {
        const next = new Set(prev);
        data.active ? next.add(recipeId) : next.delete(recipeId);
        return next;
      });
    } catch {}
  }

  async function handleAddToMealPlan(recipeId, day) {
    if (!user) { setShowLoginModal(true); return; }
    try {
      await api.addToMealPlan(recipeId, day);
    } catch {}
  }

  if (authLoading) {
    return (
      <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (page === "login") {
    return (
      <>
        <LoginPage onLogin={handleLogin} onBack={() => setPage("home")} />
        <Footer />
      </>
    );
  }

  return (
    <>
      <Home
        onSelectRecipe={handleSelectRecipe}
        user={user}
        onLogout={handleLogout}
        onLogin={() => setPage("login")}
        onUserUpdate={updatedUser => setUser(updatedUser)}
        savedIds={savedIds}
        likedIds={likedIds}
        onToggleSave={handleToggleSave}
        onToggleLike={handleToggleLike}
        onRequestLogin={requestLogin}
        onAddToMealPlan={handleAddToMealPlan}
        currentRecipeId={currentRecipeId}
        onClearRecipe={() => { setCurrentRecipeId(null); setPage("home"); }}
      />

      <Footer />

      {/* ── Sign-in toast ── */}
      {signinToast && (
        <div key={signinToast.key} className={`signin-toast${signinToast.exiting ? " signin-toast--out" : ""}`}>
          <CheckCircle2 size={20} strokeWidth={2} style={{ flexShrink: 0, color: "#fff" }} />
          <div className="signin-toast-body">
            <div className="signin-toast-title">Welcome back, {signinToast.name}!</div>
            <div className="signin-toast-sub">Ready to cook something great?</div>
          </div>
          <button className="signin-toast-close" onClick={dismissSigninToast} aria-label="Dismiss">
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* ── Sign-out toast ── */}
      {signoutToast && (
        <div key={signoutToast.key} className="auth-toast">Signed out</div>
      )}

      {/* ── Login modal — shown when guest taps save/like ── */}
      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <LoginPage
              isModal
              onLogin={handleLogin}
              onBack={() => setShowLoginModal(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
