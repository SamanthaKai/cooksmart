import { useState } from "react";
import {
  Home as HomeIcon, Search, LayoutGrid, CalendarDays,
  Heart, Bookmark, ShoppingCart, User, ChevronDown, ChevronRight,
  Globe, Soup, UtensilsCrossed, Cookie, Sun, GlassWater, Crown,
  Sparkles,
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

const NAV_ITEMS = [
  { id: "home",       label: "Home",            Icon: HomeIcon },
  { id: "explore",    label: "Explore Recipes",  Icon: Search },
  { id: "categories", label: "Categories",      Icon: LayoutGrid, hasDropdown: true },
  { id: "airecipes",  label: "AI Recipes",      Icon: Sparkles },
  { id: "mealplan",   label: "Meal Planner",    Icon: CalendarDays },
  { id: "myrecipes",  label: "My Recipes",      Icon: Bookmark },
  { id: "favorites",  label: "Favorites",       Icon: Heart },
  { id: "shopping",   label: "Shopping List",   Icon: ShoppingCart },
  { id: "profile",    label: "My Profile",      Icon: User },
];

export default function LeftSidebar({ user, onRequestLogin, activePage, onNavigate, onCategorySelect }) {
  const [catOpen, setCatOpen]     = useState(false);
  const [premToast, setPremToast] = useState(false);

  function handleNav(item) {
    if (item.id === "categories") { setCatOpen(o => !o); return; }
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
            </button>

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
