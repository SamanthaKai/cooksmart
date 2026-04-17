import { useState, useEffect, useCallback } from "react";
import Home from "./pages/Home";
import RecipeDetail from "./pages/RecipeDetail";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
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

  function handleLogin(loggedInUser) {
    setUser(loggedInUser);
    setShowLoginModal(false);
    setPage(prev => prev === "login" ? "home" : prev);
    loadInteractions();
  }

  function handleLogout() {
    localStorage.removeItem("cooksmart_token");
    setUser(null);
    setSavedIds(new Set());
    setLikedIds(new Set());
    setPage("home");
    setCurrentRecipeId(null);
  }

  function handleSelectRecipe(id) {
    setCurrentRecipeId(id);
    setPage("recipe");
  }

  // Called by RecipeCard / RecipeDetail when guest taps save/like
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

  if (authLoading) {
    return (
      <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  // Full-page login (navigated to directly)
  if (page === "login") {
    return <LoginPage onLogin={handleLogin} onBack={() => setPage("home")} />;
  }

  // Profile — requires login
  if (page === "profile") {
    if (!user) { setPage("login"); return null; }
    return (
      <ProfilePage
        user={user}
        onBack={() => setPage("home")}
        onUserUpdate={updatedUser => setUser(updatedUser)}
        onSelectRecipe={handleSelectRecipe}
      />
    );
  }

  return (
    <>
      {page === "recipe" && currentRecipeId ? (
        <div className="app">
          <RecipeDetail
            recipeId={currentRecipeId}
            onBack={() => setPage("home")}
            onSelectRecipe={handleSelectRecipe}
            savedIds={savedIds}
            likedIds={likedIds}
            onToggleSave={handleToggleSave}
            onToggleLike={handleToggleLike}
            onRequestLogin={requestLogin}
          />
        </div>
      ) : (
        <div className="app">
          <Home
            onSelectRecipe={handleSelectRecipe}
            user={user}
            onLogout={handleLogout}
            onProfile={() => setPage("profile")}
            onLogin={() => setPage("login")}
            savedIds={savedIds}
            onToggleSave={handleToggleSave}
            onRequestLogin={requestLogin}
          />
        </div>
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
