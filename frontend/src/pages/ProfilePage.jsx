import { useState, useEffect } from "react";
import { api } from "../api/client";

const DIETARY_OPTIONS = [
  { value: "vegetarian",  label: "Vegetarian" },
  { value: "vegan",       label: "Vegan" },
  { value: "halal",       label: "Halal" },
  { value: "gluten-free", label: "Gluten-Free" },
  { value: "dairy-free",  label: "Dairy-Free" },
  { value: "nut-free",    label: "Nut-Free" },
];

const ALLERGY_OPTIONS = [
  { value: "peanuts",   label: "Peanuts" },
  { value: "tree-nuts", label: "Tree Nuts" },
  { value: "dairy",     label: "Dairy / Milk" },
  { value: "eggs",      label: "Eggs" },
  { value: "fish",      label: "Fish" },
  { value: "shellfish", label: "Shellfish" },
  { value: "wheat",     label: "Wheat / Gluten" },
  { value: "soy",       label: "Soy" },
];

const CUISINE_OPTIONS = [
  { value: "african",      label: "African (Ugandan)" },
  { value: "west-african", label: "West African" },
  { value: "east-african", label: "East African" },
  { value: "western",      label: "Western" },
  { value: "asian",        label: "Asian" },
];

function ToggleGrid({ options, selected, onChange }) {
  function toggle(value) {
    onChange(
      selected.includes(value)
        ? selected.filter(v => v !== value)
        : [...selected, value]
    );
  }
  return (
    <div className="profile-toggle-grid">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`profile-toggle-btn${selected.includes(opt.value) ? " active" : ""}`}
          onClick={() => toggle(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function ProfilePage({ user, onBack, onUserUpdate }) {
  const [name, setName]                       = useState(user.name || "");
  const [dietary, setDietary]                 = useState([]);
  const [allergies, setAllergies]             = useState([]);
  const [preferredCuisine, setPreferredCuisine] = useState([]);

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState(false);

  // Load current profile on mount
  useEffect(() => {
    api.getProfile()
      .then(data => {
        setName(data.user.name || "");
        setDietary(data.profile.dietary || []);
        setAllergies(data.profile.allergies || []);
        setPreferredCuisine(data.profile.preferred_cuisine || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setSaving(true);
    try {
      const data = await api.updateProfile({
        name,
        dietary,
        allergies,
        preferred_cuisine: preferredCuisine,
      });
      onUserUpdate(data.user);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const initials = name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || "")
    .join("");

  return (
    <div className="profile-page">
      {/* Navbar */}
      <nav className="navbar">
        <span className="navbar-brand">Cook<span>Smart</span></span>
        <div className="navbar-right">
          <button className="navbar-back" onClick={onBack}>← Back to recipes</button>
        </div>
      </nav>

      <div className="profile-wrap">
        {/* Header card */}
        <div className="profile-header-card">
          <div className="profile-avatar">{initials || "?"}</div>
          <div>
            <h1 className="profile-name">{user.name}</h1>
            <p className="profile-email">{user.email}</p>
          </div>
        </div>

        {loading ? (
          <div className="state-center" style={{ padding: "3rem" }}>
            <div className="spinner" />
          </div>
        ) : (
          <form className="profile-form" onSubmit={handleSave}>

            {/* Personal Info */}
            <div className="profile-section">
              <h2 className="profile-section-title">Personal Info</h2>
              <div className="profile-field">
                <label className="profile-label">Display Name</label>
                <input
                  className="profile-input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>
              <div className="profile-field">
                <label className="profile-label">Email Address</label>
                <input
                  className="profile-input profile-input--readonly"
                  type="email"
                  value={user.email}
                  readOnly
                />
                <p className="profile-hint">Email cannot be changed.</p>
              </div>
            </div>

            {/* Dietary Restrictions */}
            <div className="profile-section">
              <h2 className="profile-section-title">Dietary Restrictions</h2>
              <p className="profile-section-desc">We'll use these to highlight recipes that suit your diet.</p>
              <ToggleGrid
                options={DIETARY_OPTIONS}
                selected={dietary}
                onChange={setDietary}
              />
            </div>

            {/* Allergies */}
            <div className="profile-section">
              <h2 className="profile-section-title">Allergies</h2>
              <p className="profile-section-desc">We'll flag recipes containing these ingredients.</p>
              <ToggleGrid
                options={ALLERGY_OPTIONS}
                selected={allergies}
                onChange={setAllergies}
              />
            </div>

            {/* Preferred Cuisine */}
            <div className="profile-section">
              <h2 className="profile-section-title">Preferred Cuisines</h2>
              <p className="profile-section-desc">Your favourite food cultures — we'll rank these higher for you.</p>
              <ToggleGrid
                options={CUISINE_OPTIONS}
                selected={preferredCuisine}
                onChange={setPreferredCuisine}
              />
            </div>

            {error   && <div className="login-error">{error}</div>}
            {success && <div className="profile-success">Profile saved!</div>}

            <button className="profile-save-btn" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
