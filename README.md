# 🍽️ CookSmart

A modern, AI-powered recipe discovery app featuring authentic African and international cuisine. Search by ingredients, explore cuisines, and discover new recipes with smart AI suggestions.

## ✨ Features

- **Smart Ingredient Search**: Add ingredients and get AI-powered recipe suggestions
- **Cuisine Exploration**: Browse African and international recipes
- **Recipe Details**: Full recipes with ingredients, instructions, and serving suggestions
- **Responsive Design**: Beautiful, mobile-friendly interface
- **Fast Search**: Fuzzy search with autocomplete
- **Image Gallery**: High-quality food photography

## 🛠️ Tech Stack

### Frontend
- **React 18** with Vite
- **Modern CSS** with custom properties
- **Responsive design** for all devices

### Backend
- **Flask** REST API
- **PostgreSQL** database
- **Anthropic Claude** for AI suggestions
- **psycopg2** for database connections

### Deployment
- **Vercel** (Frontend)
- **Render** (Backend + Database)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.8+
- PostgreSQL

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/cooksmart.git
   cd cooksmart
   ```

2. **Backend Setup**
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate  # Windows
   pip install -r requirements.txt
   # Set up your .env file with database credentials
   python seed.py  # Load recipes
   python app.py   # Start backend on port 5000
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev  # Start dev server on port 3000
   ```

4. **Open your browser**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

## 📁 Project Structure

```
cooksmart/
├── backend/                 # Flask API
│   ├── app.py              # Main application
│   ├── db.py               # Database connection
│   ├── seed.py             # Data seeding script
│   ├── routes/             # API endpoints
│   └── db/schema.sql       # Database schema
├── frontend/                # React app
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Page components
│   │   ├── api/            # API client
│   │   └── utils/          # Helper functions
│   └── public/images/      # Recipe images
├── data/                   # CSV data files
└── DEPLOYMENT.md           # Deployment guide
```

## 🎨 Design

- **Color Palette**: Earthy greens and warm neutrals
- **Typography**: DM Sans for modern, clean text
- **Icons**: Custom emoji-based iconography
- **Layout**: Card-based design with smooth animations

## 📊 Database Schema

- **recipes**: Core recipe data
- **ingredients**: Normalized ingredient catalog
- **recipe_ingredients**: Recipe-ingredient relationships
- **tags**: Categorization and filtering tags

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Recipe data sourced from various African culinary traditions
- Images from Unsplash and local photographers
- Special thanks to the African culinary community

---

**Made with ❤️ for food lovers worldwide**