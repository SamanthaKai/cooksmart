"""
CookSmart — PostgreSQL connection pool
Uses DATABASE_URL if available (Railway), otherwise falls back to individual DB_* vars.
"""

import os
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

_pool = None

def get_db_pool():
    global _pool
    if _pool is None:
        database_url = os.getenv('DATABASE_URL')
        if database_url:
            _pool = psycopg2.pool.SimpleConnectionPool(
                minconn=1,
                maxconn=10,
                dsn=database_url,
            )
        else:
            _pool = psycopg2.pool.SimpleConnectionPool(
                minconn=1,
                maxconn=10,
                host=os.getenv('DB_HOST', 'localhost'),
                port=int(os.getenv('DB_PORT', 5432)),
                dbname=os.getenv('DB_NAME', 'cooksmart'),
                user=os.getenv('DB_USER', 'postgres'),
                password=os.getenv('DB_PASSWORD', ''),
            )
    return _pool

def get_conn():
    return get_db_pool().getconn()

def release_conn(conn):
    get_db_pool().putconn(conn)

def query(sql, params=None, many=True):
    """Run a SELECT and return list of dicts (or single dict)."""
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return cur.fetchall() if many else cur.fetchone()
    finally:
        release_conn(conn)

def execute(sql, params=None):
    """Run INSERT/UPDATE/DELETE/DDL. Returns the first row if RETURNING is used, else None."""
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            conn.commit()
            if cur.description:
                row = cur.fetchone()
                return dict(row) if row else None
            return None
    except Exception:
        conn.rollback()
        raise
    finally:
        release_conn(conn)
