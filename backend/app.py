"""
CookSmart Flask API — Entry Point
"""

import os
from flask import Flask
from flask_cors import CORS
from db import get_db_pool
from routes.search import search_bp
from routes.ingredients import ingredients_bp
from routes.ai_suggest import ai_bp

app = Flask(__name__)

# Allow ALL origins in production — we'll lock this down later
CORS(app, resources={r"/api/*": {"origins": "*"}})

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
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug)