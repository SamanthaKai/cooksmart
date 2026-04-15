"""
CookSmart — Auth Routes

POST /api/auth/register    { name, email, password } → { token, user }
POST /api/auth/login       { email, password }       → { token, user }
GET  /api/auth/me          Authorization: Bearer <token> → { user }
"""

import os
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from db import query, execute

auth_bp = Blueprint('auth', __name__)

SECRET_KEY = os.getenv('SECRET_KEY', 'cooksmart-dev-key-change-in-prod')
_serializer = None
_table_ready = False


def get_serializer():
    global _serializer
    if _serializer is None:
        _serializer = URLSafeTimedSerializer(SECRET_KEY)
    return _serializer


def ensure_users_table():
    """Create the users table on first auth request (idempotent)."""
    global _table_ready
    if _table_ready:
        return
    execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            SERIAL PRIMARY KEY,
            name          VARCHAR(100) NOT NULL,
            email         VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    _table_ready = True


def make_token(user_id, email):
    return get_serializer().dumps({'id': user_id, 'email': email})


def verify_token(token):
    """Returns payload dict or raises BadSignature/SignatureExpired."""
    return get_serializer().loads(token, max_age=86400 * 30)  # 30-day tokens


# ── Register ──────────────────────────────────────────────────────────────────
@auth_bp.route('/auth/register', methods=['POST'])
def register():
    ensure_users_table()
    data     = request.get_json(force=True) or {}
    name     = data.get('name', '').strip()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not name or not email or not password:
        return jsonify({'error': 'Name, email and password are required.'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters.'}), 400

    existing = query("SELECT id FROM users WHERE email = %s", (email,), many=False)
    if existing:
        return jsonify({'error': 'An account with this email already exists.'}), 409

    pw_hash = generate_password_hash(password)
    user = execute(
        "INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s) RETURNING id, name, email",
        (name, email, pw_hash)
    )
    token = make_token(user['id'], user['email'])
    return jsonify({'token': token, 'user': {'id': user['id'], 'name': user['name'], 'email': user['email']}}), 201


# ── Login ─────────────────────────────────────────────────────────────────────
@auth_bp.route('/auth/login', methods=['POST'])
def login():
    ensure_users_table()
    data     = request.get_json(force=True) or {}
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required.'}), 400

    user = query(
        "SELECT id, name, email, password_hash FROM users WHERE email = %s",
        (email,), many=False
    )
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid email or password.'}), 401

    token = make_token(user['id'], user['email'])
    return jsonify({'token': token, 'user': {'id': user['id'], 'name': user['name'], 'email': user['email']}})


# ── Me (verify token) ─────────────────────────────────────────────────────────
@auth_bp.route('/auth/me', methods=['GET'])
def me():
    ensure_users_table()
    raw = request.headers.get('Authorization', '')
    token = raw.replace('Bearer ', '').strip()
    if not token:
        return jsonify({'error': 'No token provided.'}), 401

    try:
        payload = verify_token(token)
        user = query("SELECT id, name, email FROM users WHERE id = %s", (payload['id'],), many=False)
        if not user:
            return jsonify({'error': 'User not found.'}), 404
        return jsonify({'user': dict(user)})
    except (BadSignature, SignatureExpired):
        return jsonify({'error': 'Invalid or expired token.'}), 401
