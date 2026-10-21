import os
import random
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__)
CORS(app)

# Optional Gmail SMTP settings for sending real recovery emails
# To send real emails, set your Gmail and 16-char Google App Password here or in environment variables:
SMTP_EMAIL = os.environ.get("SMTP_EMAIL", "")          # e.g. "yourname@gmail.com"
SMTP_APP_PASSWORD = os.environ.get("SMTP_APP_PASSWORD", "")  # e.g. "abcd efgh ijkl mnop"

def get_db_connection():
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return psycopg2.connect(database_url)
    return psycopg2.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        database=os.environ.get("DB_NAME", "todo_db"),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ.get("DB_PASSWORD", "1234"),
        port=int(os.environ.get("DB_PORT", 5432))
    )

def init_db():
    """Automatically creates or upgrades the users and todos tables on startup."""
    conn = get_db_connection()
    cur = conn.cursor()

    # 1. Create users table for Sign Up / Log In / Password Recovery
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(120) DEFAULT '',
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(12);")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMP;")

    # 2. Ensure todos table exists and has rich fields
    cur.execute("""
        CREATE TABLE IF NOT EXISTS todos (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            completed BOOLEAN DEFAULT FALSE
        );
    """)
    cur.execute("ALTER TABLE todos ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;")
    cur.execute("ALTER TABLE todos ADD COLUMN IF NOT EXISTS category VARCHAR(60) DEFAULT 'Personal';")
    cur.execute("ALTER TABLE todos ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';")
    cur.execute("ALTER TABLE todos ADD COLUMN IF NOT EXISTS due_date VARCHAR(32) DEFAULT '';")
    cur.execute("ALTER TABLE todos ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;")

    conn.commit()
    cur.close()
    conn.close()

try:
    init_db()
except Exception as e:
    print("Database init notice:", e)


def send_recovery_email(to_email, otp_code, user_name):
    """Sends a 6-digit password reset code via Gmail SMTP if configured."""
    if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
        print(f"[DEV MAILBOX] Password Reset OTP for {to_email}: {otp_code}")
        return False

    try:
        msg = EmailMessage()
        msg["Subject"] = f"ShriPalan — Your Password Reset Code ({otp_code})"
        msg["From"] = f"ShriPalan <{SMTP_EMAIL}>"
        msg["To"] = to_email
        msg.set_content(
            f"Hi {user_name or 'there'},\n\n"
            f"Your 6-digit password recovery code for ShriPalan is:\n\n"
            f"    {otp_code}\n\n"
            f"This code expires in 15 minutes.\n"
            f"If you did not request a password reset, you can safely ignore this email."
        )

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception as err:
        print("SMTP send error:", err)
        return False


@app.route("/")
def home():
    return jsonify({"status": "ok", "message": "ShriPalan API with Auth, Password Recovery & PostgreSQL is running."}), 200


# ---------------- AUTHENTICATION & PASSWORD RECOVERY ROUTES ---------------- #

@app.route("/auth/signup", methods=["POST"])
def signup():
    data = request.get_json() or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    name = str(data.get("name", "")).strip() or email.split("@")[0].capitalize()

    if not email or "@" not in email:
        return jsonify({"error": "Please enter a valid email address."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("SELECT id FROM users WHERE email = %s;", (email,))
    if cur.fetchone():
        cur.close()
        conn.close()
        return jsonify({"error": "An account with this email already exists. Please log in."}), 409

    pw_hash = generate_password_hash(password)
    cur.execute(
        "INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s) RETURNING id, name, email, created_at;",
        (name, email, pw_hash)
    )
    user = cur.fetchone()

    # Seed 2 starter tasks for the new user
    cur.execute(
        """
        INSERT INTO todos (user_id, title, category, priority, due_date, completed)
        VALUES
          (%s, 'Plan my top 3 priorities before 2027', 'Goals', 'high', '2026-10-22', false),
          (%s, 'Complete daily focus session', 'Work', 'medium', '2026-10-21', false);
        """,
        (user["id"], user["id"])
    )

    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"user": user, "message": "Account created successfully!"}), 201


@app.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("SELECT id, name, email, password_hash, created_at FROM users WHERE email = %s;", (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid email or password."}), 401

    user_data = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "created_at": user["created_at"]
    }
    return jsonify({"user": user_data, "message": "Logged in successfully!"}), 200


@app.route("/auth/forgot-password", methods=["POST"])
def forgot_password():
    """Generates a 6-digit recovery OTP, stores it in PostgreSQL, and sends it to the user's email."""
    data = request.get_json() or {}
    email = str(data.get("email", "")).strip().lower()

    if not email or "@" not in email:
        return jsonify({"error": "Please enter your registered email address."}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("SELECT id, name, email FROM users WHERE email = %s;", (email,))
    user = cur.fetchone()
    if not user:
        cur.close()
        conn.close()
        return jsonify({"error": "No account found with that email address."}), 404

    otp_code = f"{random.randint(100000, 999999)}"
    expires_at = datetime.utcnow() + timedelta(minutes=15)

    cur.execute(
        "UPDATE users SET reset_code = %s, reset_expires = %s WHERE id = %s;",
        (otp_code, expires_at, user["id"])
    )
    conn.commit()
    cur.close()
    conn.close()

    sent_via_smtp = send_recovery_email(email, otp_code, user["name"])

    if sent_via_smtp:
        return jsonify({
            "message": f"A 6-digit recovery code has been sent to {email}.",
            "smtp_sent": True
        }), 200
    else:
        return jsonify({
            "message": f"Recovery code generated for {email}! (Dev Mode preview code: {otp_code})",
            "smtp_sent": False,
            "dev_otp": otp_code
        }), 200


@app.route("/auth/reset-password", methods=["POST"])
def reset_password():
    """Verifies the 6-digit OTP code and sets a new password."""
    data = request.get_json() or {}
    email = str(data.get("email", "")).strip().lower()
    otp_code = str(data.get("otp_code", "")).strip()
    new_password = str(data.get("new_password", ""))

    if not email or not otp_code or not new_password:
        return jsonify({"error": "Email, 6-digit recovery code, and new password are required."}), 400

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters long."}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(
        "SELECT id, name, email, reset_code, reset_expires FROM users WHERE email = %s;",
        (email,)
    )
    user = cur.fetchone()

    if not user or not user.get("reset_code") or user["reset_code"] != otp_code:
        cur.close()
        conn.close()
        return jsonify({"error": "Invalid 6-digit recovery code."}), 400

    if user.get("reset_expires") and datetime.utcnow() > user["reset_expires"]:
        cur.close()
        conn.close()
        return jsonify({"error": "Recovery code has expired. Please request a new one."}), 400

    new_hash = generate_password_hash(new_password)
    cur.execute(
        "UPDATE users SET password_hash = %s, reset_code = NULL, reset_expires = NULL WHERE id = %s;",
        (new_hash, user["id"])
    )
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "message": "Your password has been updated! You are now signed in.",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"]
        }
    }), 200


@app.route("/auth/change-password", methods=["POST"])
def change_password():
    """Allows a signed-in user to change their old password to a new password."""
    data = request.get_json() or {}
    email = str(data.get("email", "")).strip().lower()
    old_password = str(data.get("old_password", ""))
    new_password = str(data.get("new_password", ""))

    if not email or not old_password or not new_password:
        return jsonify({"error": "Current password and new password are required."}), 400

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters long."}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("SELECT id, password_hash FROM users WHERE email = %s;", (email,))
    user = cur.fetchone()

    if not user or not check_password_hash(user["password_hash"], old_password):
        cur.close()
        conn.close()
        return jsonify({"error": "Your old password is incorrect."}), 401

    new_hash = generate_password_hash(new_password)
    cur.execute("UPDATE users SET password_hash = %s WHERE id = %s;", (new_hash, user["id"]))
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({"message": "Password changed successfully!"}), 200


# ---------------- TODO CRUD ROUTES ---------------- #

@app.route("/todos", methods=["GET"])
def get_todos():
    user_id = request.args.get("user_id", type=int)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    if user_id is not None:
        cur.execute(
            """
            SELECT id, user_id, title, category, priority, due_date, completed, created_at
            FROM todos
            WHERE user_id = %s
            ORDER BY completed ASC, id DESC;
            """,
            (user_id,)
        )
    else:
        cur.execute(
            """
            SELECT id, user_id, title, category, priority, due_date, completed, created_at
            FROM todos
            ORDER BY completed ASC, id DESC;
            """
        )

    todos = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(todos), 200


@app.route("/todos/<int:todo_id>", methods=["GET"])
def get_single_todo(todo_id):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        "SELECT id, user_id, title, category, priority, due_date, completed, created_at FROM todos WHERE id = %s;",
        (todo_id,)
    )
    todo = cur.fetchone()
    cur.close()
    conn.close()

    if not todo:
        return jsonify({"error": f"Todo with id {todo_id} not found"}), 404

    return jsonify(todo), 200


@app.route("/todos", methods=["POST"])
def create_todo():
    data = request.get_json() or {}

    title = str(data.get("title", "")).strip()
    if not title:
        return jsonify({"error": "Field 'title' is required and cannot be empty"}), 400

    user_id = data.get("user_id")
    category = str(data.get("category", "Personal")).strip() or "Personal"
    priority = str(data.get("priority", "medium")).strip().lower()
    due_date = str(data.get("due_date", "")).strip()
    completed = bool(data.get("completed", False))

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        INSERT INTO todos (user_id, title, category, priority, due_date, completed)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id, user_id, title, category, priority, due_date, completed, created_at;
        """,
        (user_id, title, category, priority, due_date, completed)
    )
    new_todo = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify(new_todo), 201


@app.route("/todos/<int:todo_id>", methods=["PUT", "PATCH"])
def update_todo(todo_id):
    data = request.get_json() or {}
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute("SELECT * FROM todos WHERE id = %s;", (todo_id,))
    existing = cur.fetchone()
    if not existing:
        cur.close()
        conn.close()
        return jsonify({"error": f"Todo with id {todo_id} not found"}), 404

    updated_title = str(data.get("title", existing["title"])).strip()
    if not updated_title:
        cur.close()
        conn.close()
        return jsonify({"error": "Title cannot be empty"}), 400

    updated_completed = data.get("completed", existing["completed"])
    updated_category = data.get("category", existing.get("category", "Personal"))
    updated_priority = data.get("priority", existing.get("priority", "medium"))
    updated_due_date = data.get("due_date", existing.get("due_date", ""))

    cur.execute(
        """
        UPDATE todos
        SET title = %s, completed = %s, category = %s, priority = %s, due_date = %s
        WHERE id = %s
        RETURNING id, user_id, title, category, priority, due_date, completed, created_at;
        """,
        (updated_title, updated_completed, updated_category, updated_priority, updated_due_date, todo_id)
    )
    updated_todo = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return jsonify(updated_todo), 200


@app.route("/todos/<int:todo_id>", methods=["DELETE"])
def delete_todo(todo_id):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("DELETE FROM todos WHERE id = %s RETURNING id;", (todo_id,))
    deleted = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    if not deleted:
        return jsonify({"error": f"Todo with id {todo_id} not found"}), 404

    return jsonify({"message": f"Todo with id {todo_id} deleted successfully"}), 200


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)