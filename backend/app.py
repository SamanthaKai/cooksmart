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
from routes.auth import auth_bp
from routes.profile import profile_bp
from routes.nlp import nlp_bp
from routes.interactions import interactions_bp
from routes.generated_recipes import gen_recipes_bp

app = Flask(__name__)

# Allow ALL origins in production — we'll lock this down later
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Initialise DB connection pool on startup
get_db_pool()

# Register route blueprints
app.register_blueprint(search_bp,      url_prefix='/api')
app.register_blueprint(ingredients_bp, url_prefix='/api')
app.register_blueprint(ai_bp,          url_prefix='/api')
app.register_blueprint(auth_bp,        url_prefix='/api')
app.register_blueprint(profile_bp,     url_prefix='/api')
app.register_blueprint(nlp_bp,          url_prefix='/api')
app.register_blueprint(interactions_bp,   url_prefix='/api')
app.register_blueprint(gen_recipes_bp,   url_prefix='/api')

@app.route('/api/health')
def health():
    return {'status': 'ok', 'service': 'CookSmart API'}

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug)