# CookSmart – Project Context Brief for Claude Code

## What this project is
**CookSmart** is a university graded project: an AI-powered recipe recommendation system focused on Ugandan cuisine. It is built by a student group at Mbarara University of Science and Technology.

---

## What was proposed (the original pitch)
- A system for hotels/restaurants to standardize Ugandan recipes
- Users (chefs/staff) search by available ingredients and get matching recipes
- AI recommends the best ingredient combinations and cooking steps
- Machine learning for personalized recommendations (content-based + collaborative filtering)
- Computer vision to monitor portion sizes and presentation
- Culturally-specific dataset of authentic Ugandan dishes
- User accounts with saved preferences and dietary filters

---

## What actually got built (current state)
- A web app where users type in ingredients and get back a list of recipes that contain those ingredients
- It is essentially a **search/filter**, not a recommendation engine
- **No login/authentication**
- **No AI or generative features** — pure keyword matching
- **No algorithm** that scores, ranks, or personalizes results

---

## Professor's feedback (must address these)
1. **Add a login page** — users need to be able to sign up and log in
2. **What is the algorithm?** — the system must have a visible, explainable AI/recommendation algorithm
3. **Where is the AI?** — there must be a clear, demonstrable generative AI feature (not just search)

---

## Features to add (priority order)

### 1. Login / Sign-up page (HIGH PRIORITY)
- Simple authentication: sign up with name, email, password; log in with email + password
- Can use localStorage or a simple backend (SQLite/JSON file) — does not need to be production-secure
- After login, user has a profile/session

### 2. AI Recipe Generator — the core generative feature (HIGH PRIORITY)
- User types in ingredients they have available
- System calls the **Anthropic Claude API** (`claude-sonnet-4-20250514`) to generate a full recipe
- The AI returns: dish name, ingredients with quantities, step-by-step cooking instructions, estimated cooking time, portion size
- This must be clearly labeled in the UI as "AI-Generated Recipe"
- The prompt to the API should specify Ugandan/East African cuisine context
- API endpoint: `https://api.anthropic.com/v1/messages` — **no API key needed in frontend if proxied; check environment for ANTHROPIC_API_KEY**

### 3. Ingredient Match Scoring — make the algorithm visible (MEDIUM PRIORITY)
- When showing search results, display a match score: e.g., "5 of 7 ingredients matched (71%)"
- Sort results by match percentage descending
- This makes the recommendation logic visible and explainable to the professor

### 4. Dietary/preference filters (LOWER PRIORITY, add if time allows)
- Checkboxes: vegetarian, no nuts, quick meals (<30 min)
- Filter recipe results based on these tags

---

## Tech stack context
- The existing app is a web app (assumed HTML/CSS/JS or a simple Python/Node backend — adapt to whatever stack already exists)
- The Anthropic API call should go through a backend route to avoid exposing keys in frontend code
- Use `claude-sonnet-4-20250514` model, `max_tokens: 1024`

---

## Anthropic API call example (backend route)
```javascript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01"
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a Ugandan cuisine expert. The user has these ingredients: ${ingredients}. 
Generate a complete Ugandan or East African recipe using some or all of these ingredients. 
Return: dish name, list of ingredients with quantities, step-by-step cooking instructions, cooking time, and serving size.`
      }
    ]
  })
});
```

---

## Summary of what the grader wants to see
| Requirement | Status | Action |
|---|---|---|
| Login page | ❌ Missing | Build sign up + login UI with session |
| Visible AI algorithm | ❌ Missing | Add ingredient match % scoring |
| Generative AI feature | ❌ Missing | Add AI recipe generator via Anthropic API |
| Ingredient search | ✅ Exists | Keep, but improve with match scoring |
| Ugandan cuisine focus | ⚠️ Partial | Ensure AI prompts specify Ugandan/East African context |