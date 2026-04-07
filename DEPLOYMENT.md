# CookSmart Deployment Guide

## 🚀 Deploy to GitHub, Vercel & Railway

### 1. GitHub Setup
1. Create a new repository on GitHub: https://github.com/new
2. Name it: `cooksmart` (or your preferred name)
3. Don't initialize with README, .gitignore, or license
4. Copy the repository URL

### 2. Push to GitHub
```bash
# Replace YOUR_USERNAME with your actual GitHub username
git remote add origin https://github.com/YOUR_USERNAME/cooksmart.git
git branch -M main
git push -u origin main
```

### 3. Vercel Deployment (Frontend)
1. Go to https://vercel.com and sign up/login
2. Click "New Project"
3. Import your GitHub repository
4. Configure build settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add environment variables (if needed):
   - `VITE_API_URL`: Your Railway backend URL (we'll set this after Railway deployment)
6. Click "Deploy"

### 4. Railway Deployment (Backend)
1. Go to https://railway.app and sign up/login
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your `cooksmart` repository
4. Configure the service:
   - **Root Directory**: `backend`
   - **Start Command**: `python app.py`
5. Add environment variables:
   ```
   DB_HOST=containers-us-west-XXX.railway.app
   DB_PORT=XXXX
   DB_NAME=railway
   DB_USER=postgres
   DB_PASSWORD=your_railway_db_password
   ANTHROPIC_API_KEY=your_anthropic_key
   ```
6. Railway will auto-detect Python and install requirements.txt
7. Your backend will be available at: `https://cooksmart-backend.railway.app`

### 5. Update Frontend Environment
1. In Vercel dashboard, go to your project settings
2. Add environment variable:
   - `VITE_API_URL`: `https://cooksmart-backend.railway.app`
3. Redeploy the frontend

### 6. Database Setup on Railway
1. In Railway, add a PostgreSQL database to your project
2. Copy the database credentials to your backend environment variables
3. Run the database migration:
   ```bash
   # Connect to Railway and run:
   python backend/seed.py
   ```

## 📋 Environment Variables Needed

### Backend (.env)
```
DB_HOST=your_railway_db_host
DB_PORT=your_railway_db_port
DB_NAME=railway
DB_USER=postgres
DB_PASSWORD=your_railway_db_password
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Frontend (.env)
```
VITE_API_URL=https://your-railway-backend-url
```

## 🔗 Live URLs
- **Frontend**: https://cooksmart.vercel.app
- **Backend**: https://cooksmart-backend.railway.app
- **GitHub**: https://github.com/YOUR_USERNAME/cooksmart