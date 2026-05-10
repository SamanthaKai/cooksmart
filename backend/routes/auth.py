"""
CookSmart — Auth Routes

POST /api/auth/register    { name, email, password } → { message }
POST /api/auth/login       { email, password }       → { token, user }
GET  /api/auth/verify      ?token=<token>            → { message }
GET  /api/auth/me          Authorization: Bearer <token> → { user }
"""

import os
import re
import secrets
import smtplib
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from db import query, execute

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

auth_bp = Blueprint('auth', __name__)

SECRET_KEY    = os.getenv('SECRET_KEY', 'cooksmart-dev-key-change-in-prod')
MAIL_USERNAME = os.getenv('MAIL_USERNAME', '')
MAIL_PASSWORD = os.getenv('MAIL_PASSWORD', '')
BASE_URL      = os.getenv('BASE_URL', 'https://cooksmart-api.railway.app')

_serializer  = None
_table_ready = False


def get_serializer():
    global _serializer
    if _serializer is None:
        _serializer = URLSafeTimedSerializer(SECRET_KEY)
    return _serializer


def ensure_users_table():
    """Create users table and add verification columns idempotently."""
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
    execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified       BOOLEAN                  DEFAULT FALSE")
    execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)")
    execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS token_expires_at  TIMESTAMP WITH TIME ZONE")
    _table_ready = True


def make_token(user_id, email):
    return get_serializer().dumps({'id': user_id, 'email': email})


def verify_token(token):
    """Returns payload dict or raises BadSignature/SignatureExpired."""
    return get_serializer().loads(token, max_age=86400 * 30)  # 30-day tokens


def send_verification_email(to_email, ver_token):
    """Send a verification email via Gmail SMTP. No-ops if credentials are missing."""
    if not MAIL_USERNAME or not MAIL_PASSWORD:
        return
    verify_url = f"{BASE_URL}/api/auth/verify?token={ver_token}"
    msg = MIMEMultipart('alternative')
    msg['Subject'] = 'Verify your CookSmart account'
    msg['From']    = MAIL_USERNAME
    msg['To']      = to_email

    text = (
        f"Welcome to CookSmart!\n\n"
        f"Please verify your email by visiting:\n{verify_url}\n\n"
        f"This link expires in 24 hours."
    )
    html = f"""
<html><body style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;">
  <h2 style="color:#e85d04;">Welcome to CookSmart!</h2>
  <p>Thank you for signing up. Click the button below to verify your email address and activate your account.</p>
  <a href="{verify_url}"
     style="display:inline-block;background:#e85d04;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">
    Verify Email
  </a>
  <p style="color:#666;font-size:13px;">
    This link expires in 24 hours. If you didn't sign up for CookSmart, you can safely ignore this email.
  </p>
</body></html>
"""
    msg.attach(MIMEText(text, 'plain'))
    msg.attach(MIMEText(html, 'html'))
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(MAIL_USERNAME, MAIL_PASSWORD)
            smtp.sendmail(MAIL_USERNAME, to_email, msg.as_string())
    except Exception:
        pass  # Never block registration due to mail failure


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
    if not _EMAIL_RE.match(email):
        return jsonify({'error': 'Please enter a valid email address.'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters.'}), 400

    existing = query("SELECT id FROM users WHERE email = %s", (email,), many=False)
    if existing:
        return jsonify({'error': 'An account with this email already exists.'}), 409

    pw_hash    = generate_password_hash(password)
    ver_token  = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    execute(
        """INSERT INTO users (name, email, password_hash, verification_token, token_expires_at)
           VALUES (%s, %s, %s, %s, %s)""",
        (name, email, pw_hash, ver_token, expires_at)
    )
    send_verification_email(email, ver_token)
    return jsonify({'message': 'Registration successful. Please check your email to verify your account.'}), 201


# ── Verify Email ──────────────────────────────────────────────────────────────
@auth_bp.route('/auth/verify', methods=['GET'])
def verify_email():
    ensure_users_table()
    token = request.args.get('token', '').strip()
    if not token:
        return jsonify({'error': 'Verification token is required.'}), 400

    user = query(
        "SELECT id, is_verified, token_expires_at FROM users WHERE verification_token = %s",
        (token,), many=False
    )
    if not user:
        return jsonify({'error': 'Invalid or expired verification link.'}), 400

    if user['is_verified']:
        return jsonify({'message': 'Your email is already verified. You can log in.'}), 200

    expires_at = user['token_expires_at']
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        return jsonify({'error': 'Verification link has expired. Please register again.'}), 400

    execute(
        "UPDATE users SET is_verified = TRUE, verification_token = NULL, token_expires_at = NULL WHERE id = %s",
        (user['id'],)
    )
    return jsonify({'message': 'Email verified successfully! You can now log in.'}), 200


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
        "SELECT id, name, email, password_hash, is_verified FROM users WHERE email = %s",
        (email,), many=False
    )
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid email or password.'}), 401

    if not user['is_verified']:
        return jsonify({'error': 'Please verify your email before logging in.'}), 403

    token = make_token(user['id'], user['email'])
    return jsonify({'token': token, 'user': {'id': user['id'], 'name': user['name'], 'email': user['email']}})


# ── Me (verify token) ─────────────────────────────────────────────────────────
@auth_bp.route('/auth/me', methods=['GET'])
def me():
    ensure_users_table()
    raw   = request.headers.get('Authorization', '')
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
