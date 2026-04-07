# CookSmart Deployment Guide

## 🚀 Deploy to GitHub, Vercel & Render

### Option 1: Separate Deployments (Recommended)
- **Frontend**: Vercel
- **Backend + Database**: Render
- **Best for**: Clear separation, optimal performance

### Option 2: Full Stack on Vercel
- **Both services**: Vercel (requires vercel.json)
- **Best for**: Simplicity, single deployment

---

## 📌 Prerequisites
- GitHub account (https://github.com)
- Vercel account (https://vercel.com)
- Render account (https://render.com)
- Anthropic API key (for Claude AI suggestions)

---

## 🎯 Step 1: Push to GitHub

1. Create a new repository on GitHub: https://github.com/new
2. Name it: `cooksmart`
3. Don't initialize with README, .gitignore, or license
4. Copy the HTTPS URL

```bash
# Replace YOUR_USERNAME with your actual GitHub username
$env:Path += ";C:\Program Files\Git\cmd"
git remote set-url origin https://github.com/YOUR_USERNAME/cooksmart.git
git branch -M main
git push -u origin main
```

---

## 🔷 Step 2: Deploy Frontend to Vercel (Recommended)

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select your `cooksmart` repository
4. Configure build settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add Environment Variables:
   - `VITE_API_URL`: Leave blank for now (set after Render deployment)
6. Click "Deploy"

Your frontend will be live at: `https://cooksmart.vercel.app` (or custom domain)

---

## 🚂 Step 3: Deploy Backend to Render

### 3a. Create a Render Project

1. Go to https://render.com
2. Click "New" → "Web Service"
3. Connect your GitHub account and select the `cooksmart` repository
4. Choose branch: `main`

### 3b. Add PostgreSQL Database

1. Go to https://render.com
2. Click "New" → "Database"
3. Choose PostgreSQL
4. Name it `cooksmart-db`
5. Select the free plan
6. Create the database and note the credentials

### 3c. Configure Backend Service

1. In Render, open your backend service
2. Set the environment to **Docker**
3. Use `backend/Dockerfile`
4. Set the start command:
   ```bash
   python app.py
   ```
5. Add these environment variables:
   ```
   DB_HOST=<render_db_host>
   DB_PORT=<render_db_port>
   DB_NAME=<render_db_name>
   DB_USER=<render_db_user>
   DB_PASSWORD=<render_db_password>
   ANTHROPIC_API_KEY=<your_anthropic_key>
   FLASK_ENV=production
   ```
6. Save and deploy the service

### 3d. Get Backend URL

1. In Render, open your backend service
2. Copy the public service URL (e.g. `https://cooksmart-backend.onrender.com`)
3. Save this for the next step

### 3e. Seed Production Database

Use Render's shell or connect from your local machine with the Render database credentials:
```bash
python backend/seed.py
```

Or use `psql` if connected:
```bash
psql -h <render_db_host> -U <render_db_user> -d <render_db_name>
# Then run seed.py contents
```

---

## 🔗 Step 4: Connect Frontend to Backend

1. Go to your Vercel dashboard
2. Select your `cooksmart` project
3. Go to **Settings** → **Environment Variables**
4. Add a new variable:
   - **Name**: `VITE_API_URL`
   - **Value**: `https://your-render-backend-url` (from Step 3d)
   - **Environments**: Select all
5. Click "Add"
6. Go to **Deployments** → Click the latest deployment
7. Click **Redeploy**

---

## ⚙️ Configuration Files Explained

### `vercel.json`
- **Purpose**: Tells Vercel how to build and route your monorepo
- **Contains**: Build configurations for both frontend and backend
- **Used if**: You want to deploy both to Vercel

### `.vercelignore`
- **Purpose**: Files to exclude from Vercel deployment
- **Contains**: Backend, data, node_modules, etc.

### `backend/Dockerfile`
- **Purpose**: Containerization for Render deployment
- **Contains**: Python environment setup, dependencies, Flask app

### `backend/Procfile`
- **Purpose**: Optional start command for Render if using buildpacks
- **Contains**: Command to start the Flask app

### `render.yaml`
- **Purpose**: Render service configuration
- **Contains**: backend web service and database definitions

---

## 🌐 Live URLs (After Deployment)

```
Frontend:  https://cooksmart.vercel.app
Backend:   https://cooksmart-backend.onrender.com
GitHub:    https://github.com/YOUR_USERNAME/cooksmart
```

---

## 🔐 Environment Variables Reference

### Frontend (`VITE_*` variables)
```
VITE_API_URL=https://your-render-backend-url
```

### Backend (PostgreSQL + Claude)
```
DB_HOST=your_render_db_host
DB_PORT=5432
DB_NAME=your_render_db_name
DB_USER=postgres
DB_PASSWORD=your_render_db_password
ANTHROPIC_API_KEY=sk-ant-v7-...
FLASK_ENV=production
```

---

## ✅ Deployment Checklist

- [ ] Repository pushed to GitHub
- [ ] Frontend deployed to Vercel
- [ ] Backend deployed to Render
- [ ] PostgreSQL database created on Render
- [ ] `seed.py` executed to load 90 recipes
- [ ] `VITE_API_URL` set in Vercel
- [ ] Frontend redeployed after env vars added
- [ ] Images displaying correctly
- [ ] Search and ingredient features working
- [ ] AI suggestions functioning (requires Anthropic key)

---

## 🐛 Troubleshooting

### Frontend shows "Cannot reach API"
- ✅ Check `VITE_API_URL` in Vercel env vars
- ✅ Verify Render backend is running
- ✅ Check CORS headers in backend

### Images not loading
- ✅ Verify image files exist in `frontend/public/images/`
- ✅ Check browser console for 404 errors
- ✅ Ensure image naming matches database recipe IDs

### Database connection error
- ✅ Verify credentials in Render env vars
- ✅ Check database is created and running
- ✅ Run `python backend/seed.py` to populate data

### Build fails on Vercel
- ✅ Check Node.js version (needs 18+)
- ✅ Verify `frontend/package.json` exists
- ✅ Check build logs in Vercel dashboard

---

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Render Documentation](https://render.com/docs)
- [Flask Deployment Guide](https://flask.palletsprojects.com/deployment/)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)

---

**Questions?** Check the README.md or open an issue on GitHub! 🚀