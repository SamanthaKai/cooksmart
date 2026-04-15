import { useState, useEffect } from "react";
import Home from "./pages/Home";
import RecipeDetail from "./pages/RecipeDetail";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import { api } from "./api/client";
import "./index.css";

export default function App() {
  const [user, setUser]               = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage]               = useState("home"); // "home" | "recipe" | "profile"
  const [currentRecipeId, setCurrentRecipeId] = useState(null);

  // On mount, verify any stored token
  useEffect(() => {
    const token = localStorage.getItem("cooksmart_token");
    if (!token) { setAuthLoading(false); return; }
    api.me()
      .then(data => setUser(data.user))
      .catch(() => localStorage.removeItem("cooksmart_token"))
      .finally(() => setAuthLoading(false));
  }, []);

  function handleLogin(loggedInUser) {
    setUser(loggedInUser);
    setPage("home");
  }

  function handleLogout() {
    localStorage.removeItem("cooksmart_token");
    setUser(null);
    setPage("home");
    setCurrentRecipeId(null);
  }

  function handleSelectRecipe(id) {
    setCurrentRecipeId(id);
    setPage("recipe");
  }

  // Still verifying stored token
  if (authLoading) {
    return (
      <div className="app" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  // Not logged in — show login/signup
  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Profile page
  if (page === "profile") {
    return (
      <ProfilePage
        user={user}
        onBack={() => setPage("home")}
        onUserUpdate={updatedUser => setUser(updatedUser)}
      />
    );
  }

  // Recipe detail
  if (page === "recipe" && currentRecipeId) {
    return (
      <div className="app">
        <RecipeDetail
          recipeId={currentRecipeId}
          onBack={() => setPage("home")}
          onSelectRecipe={handleSelectRecipe}
        />
      </div>
    );
  }

  // Home
  return (
    <div className="app">
      <Home
        onSelectRecipe={handleSelectRecipe}
        user={user}
        onLogout={handleLogout}
        onProfile={() => setPage("profile")}
      />
    </div>
  );
}
