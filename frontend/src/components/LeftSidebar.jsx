import {
  Home as HomeIcon, Search, LayoutGrid, CalendarDays,
  Heart, Bookmark, ShoppingCart, BookOpen, Sparkles,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "home",      label: "Home",           Icon: HomeIcon },
  { id: "explore",   label: "Explore Recipes", Icon: Search },
  { id: "categories",label: "Categories",      Icon: LayoutGrid },
  { id: "mealplan",  label: "Meal Planner",    Icon: CalendarDays, requireAuth: true },
  { id: "myrecipes", label: "My Recipes",      Icon: Heart,        requireAuth: true },
  { id: "favorites", label: "Favorites",       Icon: Bookmark,     requireAuth: true },
  { id: "shopping",  label: "Shopping List",   Icon: ShoppingCart },
  { id: "cookbooks", label: "My Cookbooks",    Icon: BookOpen },
];

export default function LeftSidebar({ user, onLogin, onMealPlan, onProfile, activePage, onNavigate }) {
  function handleNav(item) {
    if (item.requireAuth && !user) { onLogin(); return; }
    if (item.id === "mealplan")              { onMealPlan(); return; }
    if (item.id === "myrecipes" || item.id === "favorites") { onProfile(); return; }
    onNavigate(item.id);
  }

  return (
    <aside className="left-sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <span className="sidebar-logo">Cook<span>Smart</span></span>
        <p className="sidebar-tagline">Discover. Cook. Enjoy.</p>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`sidebar-nav-item${activePage === item.id ? " active" : ""}`}
            onClick={() => handleNav(item)}
          >
            <item.Icon size={17} strokeWidth={1.8} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* CookSmart AI */}
      <div className="sidebar-ai-card">
        <div className="sidebar-ai-header">
          <Sparkles size={14} strokeWidth={1.8} />
          <span>CookSmart AI</span>
        </div>
        <p className="sidebar-ai-desc">Ask anything about ingredients, cooking or recipes.</p>
        <button className="sidebar-ai-btn">Ask AI Assistant</button>
      </div>

      {/* Meal Plan card */}
      <div className="sidebar-mp-card">
        <div className="sidebar-mp-art">🥘</div>
        <h4 className="sidebar-mp-title">Create your meal plan</h4>
        <p className="sidebar-mp-desc">Plan your meals for the week and shop smart.</p>
        <button className="sidebar-mp-btn" onClick={user ? onMealPlan : onLogin}>
          Start Planning
        </button>
      </div>
    </aside>
  );
}
