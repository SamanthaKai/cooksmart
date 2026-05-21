import { useState } from "react";
import {
  Home as HomeIcon, Search, LayoutGrid, CalendarDays,
  Heart, Bookmark, ShoppingCart, User, ChevronDown, ChevronRight,
  Globe, Soup, UtensilsCrossed, Cookie, Sun, GlassWater, Crown,
  Sparkles, Lock, X,
} from "lucide-react";

const CATEGORIES = [
  { label: "All Recipes",  Icon: LayoutGrid,      type: "all" },
  { label: "African",      Icon: Globe,           type: "cuisine", value: "african" },
  { label: "Soups",        Icon: Soup,            type: "course",  value: "soup" },
  { label: "Main Dishes",  Icon: UtensilsCrossed, type: "course",  value: "main" },
  { label: "Snacks",       Icon: Cookie,          type: "course",  value: "snack" },
  { label: "Breakfast",    Icon: Sun,             type: "course",  value: "breakfast" },
  { label: "Drinks",       Icon: GlassWater,      type: "course",  value: "beverage" },
];

const GUEST_MESSAGES = {
  airecipes: "Sign in to save and view your AI-generated recipes.",
  mealplan:  "Save your meal plan — sign in (free)",
  myrecipes: "Save recipes you love. Sign in to build your collection.",
  favorites: "Favorites are saved with your account. Sign in to keep them.",
  shopping:  "Keep your shopping list across any device. Sign in to save it.",
};

const NAV_ITEMS = [
  { id: "home",       label: "Home",           Icon: HomeIcon },
  { id: "explore",    label: "Explore Recipes", Icon: Search },
  { id: "categories", label: "Categories",     Icon: LayoutGrid, hasDropdown: true },
  { id: "airecipes",  label: "AI Recipes",     Icon: Sparkles,   requireAuth: true },
  { id: "mealplan",   label: "Meal Planner",   Icon: CalendarDays, requireAuth: true },
  { id: "myrecipes",  label: "My Recipes",     Icon: Bookmark,   requireAuth: true },
  { id: "favorites",  label: "Favorites",      Icon: Heart,      requireAuth: true },
  { id: "shopping",   label: "Shopping List",  Icon: ShoppingCart },
  { id: "profile",    label: "My Profile",     Icon: User,       requireAuth: true },
];

export default function LeftSidebar({ user, onRequestLogin, activePage, onNavigate, onCategorySelect }) {
  const [catOpen, setCatOpen]       = useState(false);
  const [premToast, setPremToast]   = useState(false);
  const [guestToast, setGuestToast] = useState(null);

  function handleNav(item) {
    if (item.requireAuth && !user) {
      setGuestToast(prev => prev?.id === item.id ? null : {
        id: item.id,
        message: GUEST_MESSAGES[item.id] || "Sign in to access this feature.",
      });
      return;
    }
    if (item.id === "categories") { setCatOpen(o => !o); return; }
    setGuestToast(null);
    onNavigate(item.id);
  }

  function handleCatSelect(cat) {
    setCatOpen(false);
    onCategorySelect(cat);
  }

  function showPremium() {
    setPremToast(true);
    setTimeout(() => setPremToast(false), 2400);
  }

  return (
    <aside className="left-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">Cook<span>Smart</span></span>
        <p className="sidebar-tagline">Discover. Cook. Enjoy.</p>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <div key={item.id}>
            <button
              className={`sidebar-nav-item${activePage === item.id ? " active" : ""}`}
              onClick={() => handleNav(item)}
            >
              <item.Icon size={17} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.hasDropdown && (
                <span className="sidebar-cat-chevron">
                  {catOpen
                    ? <ChevronDown size={13} strokeWidth={2} />
                    : <ChevronRight size={13} strokeWidth={2} />}
                </span>
              )}
              {item.requireAuth && !user && (
                <Lock size={11} strokeWidth={2} style={{ marginLeft: "auto", opacity: 0.4 }} />
              )}
            </button>

            {guestToast?.id === item.id && (
              <div className="sidebar-guest-toast">
                <p>{guestToast.message}</p>
                <div className="sidebar-guest-toast-actions">
                  <button
                    className="sidebar-guest-signin"
                    onClick={() => { setGuestToast(null); onRequestLogin(); }}
                  >
                    Sign In
                  </button>
                  <button
                    className="sidebar-guest-dismiss"
                    onClick={() => setGuestToast(null)}
                    aria-label="Dismiss"
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                </div>
              </div>
            )}

            {item.id === "categories" && catOpen && (
              <div className="sidebar-cat-dropdown">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.label}
                    className="sidebar-cat-item"
                    onClick={() => handleCatSelect(cat)}
                  >
                    <cat.Icon size={14} strokeWidth={1.8} />
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {user && (
        <div className="sidebar-premium">
          <button className="sidebar-premium-btn" onClick={showPremium}>
            <Crown size={14} strokeWidth={1.8} />
            <span>Try Premium</span>
          </button>
          {premToast && <div className="sidebar-premium-toast">Coming soon!</div>}
        </div>
      )}
    </aside>
  );
}
