import { useState } from "react";
import Home from "./pages/Home";
import RecipeDetail from "./pages/RecipeDetail";
import "./index.css";

export default function App() {
  const [currentRecipeId, setCurrentRecipeId] = useState(null);

  return (
    <div className="app">
      {currentRecipeId ? (
        <RecipeDetail
          recipeId={currentRecipeId}
          onBack={() => setCurrentRecipeId(null)}
          onSelectRecipe={setCurrentRecipeId}
        />
      ) : (
        <Home onSelectRecipe={setCurrentRecipeId} />
      )}
    </div>
  );
}
