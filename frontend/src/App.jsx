import { useState, useEffect } from "react";
import Home from "./pages/Home";
import RecipeDetail from "./pages/RecipeDetail";
import LoginPage from "./pages/LoginPage";
import { api } from "./api/client";
import "./index.css";

export default function App() {
  const [user, setUser]                 = useState(null);
  const [authLoading, setAuthLoading]   = useState(true);
  const [currentRecipeId, setCurrentRecipeId] = useState(null);

  // On mount, verify any stored token
  useEffect(() => {
    const token = localStorage.getItem("cooksmart_token");
    if (!token) {
      setAuthLoading(false);
      return;
    }
    api.me()
      .then(data => setUser(data.user))
      .catch(() => localStorage.removeItem("cooksmart_token"))
      .finally(() => setAuthLoading(false));
  }, []);

  function handleLogin(user) {
    setUser(user);
  }

  function handleLogout() {
    localStorage.removeItem("cooksmart_token");
    setUser(null);
    setCurrentRecipeId(null);
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

  // Logged in — show main app
  return (
    <div className="app">
      {currentRecipeId ? (
        <RecipeDetail
          recipeId={currentRecipeId}
          onBack={() => setCurrentRecipeId(null)}
          onSelectRecipe={setCurrentRecipeId}
        />
      ) : (
        <Home
          onSelectRecipe={setCurrentRecipeId}
          user={user}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
