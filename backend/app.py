"""
CookSmart Flask API — Entry Point
Run: python app.py
"""

from flask import Flask
from flask_cors import CORS
from db import get_db_pool
from routes.search import search_bp
from routes.ingredients import ingredients_bp
from routes.ai_suggest import ai_bp

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])  # Allow React frontend (localhost:3000) to call this API

# Initialise DB connection pool on startup
get_db_pool()

# Register route blueprints
app.register_blueprint(search_bp,      url_prefix='/api')
app.register_blueprint(ingredients_bp, url_prefix='/api')
app.register_blueprint(ai_bp,          url_prefix='/api')

@app.route('/api/health')
def health():
    return {'status': 'ok', 'service': 'CookSmart API'}

if __name__ == '__main__':
    app.run(debug=True, port=5000)
