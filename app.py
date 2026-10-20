import os
import re
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from functools import wraps

from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS
from itsdangerous import BadSignature, URLSafeTimedSerializer
import mysql.connector
from mysql.connector import Error
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

# Signs the login tokens. Set SECRET_KEY in your environment for anything
# beyond local testing; the fallback below is only a development default.
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")
token_serializer = URLSafeTimedSerializer(SECRET_KEY, salt="ticketease-auth")
TOKEN_MAX_AGE = 60 * 60 * 24 * 7  # 7 days

# The schema has no price column, so prices are decided here, per seat type.
# Ticket_Type in the DB only allows Standard / Premium / VIP.
SEAT_PRICES = {"Regular": 250, "Premium": 450, "VIP": 1000}
TICKET_TYPE_FOR_SEAT = {"Regular": "Standard", "Premium": "Premium", "VIP": "VIP"}
MAX_SEATS_PER_BOOKING = 6
PAYMENT_METHODS = {"UPI", "Card", "NetBanking", "Cash"}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@app.route("/")
def home():
    return send_from_directory(app.static_folder, "index.html")


def get_db_connection():
    return mysql.connector.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        user=os.environ.get("DB_USER", "root"),
        # Better: set DB_PASSWORD as an environment variable instead of
        # keeping the real password in this file.
        password=os.environ.get("DB_PASSWORD", "Pratisql26"),
        database=os.environ.get("DB_NAME", "ticket_booking"),
        autocommit=True,
    )


@contextmanager
def db_cursor(autocommit=True):
    """Open a connection + dict cursor and always close both afterwards."""
    conn = get_db_connection()
    conn.autocommit = autocommit
    cursor = conn.cursor(dictionary=True)
    try:
        yield conn, cursor
    finally:
        cursor.close()
        if conn.is_connected():
            conn.close()


def convert_value(value):
    """Convert MySQL values into JSON-serializable values."""
    if isinstance(value, timedelta):
        total_seconds = int(value.total_seconds())
        hours, remainder = divmod(total_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        return f"{hours:02}:{minutes:02}:{seconds:02}"

    if isinstance(value, (datetime, date, time)):
        return value.isoformat()

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, dict):
        return {key: convert_value(item) for key, item in value.items()}

    if isinstance(value, (list, tuple)):
        return [convert_value(item) for item in value]

    return value


def json_response(data, status=200):
    return jsonify(convert_value(data)), status


def db_error_response(err, action):
    """Log the real error, but don't leak SQL details to the browser."""
    app.logger.exception("Error while %s", action)
    return json_response({"error": "Something went wrong on the server. Please try again."}, 500)


# ---------------------------------------------------------------------------
# Authentication (signed token, sent as "Authorization: Bearer <token>")
# ---------------------------------------------------------------------------

def make_token(user_id):
    return token_serializer.dumps({"uid": user_id})


def current_user_id():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    try:
        data = token_serializer.loads(header[7:], max_age=TOKEN_MAX_AGE)
    except BadSignature:  # also covers expired tokens
        return None
    return data.get("uid")


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user_id = current_user_id()
        if user_id is None:
            return json_response({"error": "Please log in to continue"}, 401)
        g.user_id = user_id
        return view(*args, **kwargs)

    return wrapper


def public_user(row):
    return {
        "user_id": row["User_ID"],
        "name": row["Name"],
        "email": row["Email"],
        "user_type": row["User_Type"],
    }


@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    contact = str(data.get("contact", "")).strip()
    password = str(data.get("password", ""))

    if len(name) < 2 or len(name) > 100:
        return json_response({"error": "Enter your name (2 to 100 characters)"}, 400)
    if not EMAIL_RE.match(email) or len(email) > 120:
        return json_response({"error": "Enter a valid email address"}, 400)
    if not re.fullmatch(r"[0-9]{10}", contact):
        return json_response({"error": "Mobile number must be exactly 10 digits"}, 400)
    if len(password) < 6:
        return json_response({"error": "Password must be at least 6 characters"}, 400)

    try:
        with db_cursor() as (conn, cursor):
            cursor.execute(
                "INSERT INTO `User` (Name, Email, Contact, Password, User_Type) "
                "VALUES (%s, %s, %s, %s, 'Normal')",
                (name, email, contact, generate_password_hash(password)),
            )
            user_id = cursor.lastrowid
        user = {"User_ID": user_id, "Name": name, "Email": email, "User_Type": "Normal"}
        return json_response({"user": public_user(user), "token": make_token(user_id)}, 201)

    except Error as err:
        if err.errno == 1062:  # duplicate email or contact
            return json_response(
                {"error": "An account with this email or mobile number already exists"}, 409
            )
        return db_error_response(err, "registering a user")


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    try:
        with db_cursor() as (conn, cursor):
            cursor.execute(
                "SELECT User_ID, Name, Email, Password, User_Type FROM `User` WHERE Email = %s",
                (email,),
            )
            row = cursor.fetchone()

        # Same message for "no such user" and "wrong password".
        if row is None or not check_password_hash(row["Password"], password):
            return json_response({"error": "Incorrect email or password"}, 401)

        return json_response({"user": public_user(row), "token": make_token(row["User_ID"])})

    except Error as err:
        return db_error_response(err, "logging in")


# ---------------------------------------------------------------------------
# Browsing
# ---------------------------------------------------------------------------

@app.route("/api/shows", methods=["GET"])
def get_shows():
    try:
        with db_cursor() as (conn, cursor):
            cursor.execute("""
                SELECT
                    sh.Show_ID,
                    e.Event_Name,
                    e.Event_Type,
                    v.Venue_Name,
                    v.Location,
                    sh.Show_Date,
                    sh.Start_Time,
                    sh.End_Time,
                    fn_available_seats(sh.Show_ID) AS Available_Seats,
                    (SELECT GROUP_CONCAT(DISTINCT s.Seat_Type)
                       FROM Seat s WHERE s.Venue_ID = sh.Venue_ID) AS Seat_Types
                FROM `Show` sh
                JOIN Event e ON e.Event_ID = sh.Event_ID
                JOIN Venue v ON v.Venue_ID = sh.Venue_ID
                WHERE sh.Show_Date >= CURDATE()
                ORDER BY sh.Show_Date, sh.Start_Time
            """)
            shows = cursor.fetchall()

        for show in shows:
            types = (show.pop("Seat_Types") or "").split(",")
            prices = [SEAT_PRICES[t] for t in types if t in SEAT_PRICES]
            show["Starting_Price"] = min(prices) if prices else None
        return json_response(shows)

    except Error as err:
        return db_error_response(err, "fetching shows")


@app.route("/api/shows/<int:show_id>/seats", methods=["GET"])
def get_show_seats(show_id):
    try:
        with db_cursor() as (conn, cursor):
            cursor.execute("SELECT Show_ID FROM `Show` WHERE Show_ID = %s", (show_id,))
            if cursor.fetchone() is None:
                return json_response({"error": "Show not found"}, 404)

            cursor.execute("""
                SELECT
                    s.Seat_ID,
                    s.Seat_Number,
                    s.Seat_Type,
                    EXISTS (
                        SELECT 1 FROM Ticket t
                        WHERE t.Show_ID = sh.Show_ID
                          AND t.Seat_ID = s.Seat_ID
                          AND t.Ticket_Status <> 'Cancelled'
                    ) AS Is_Booked
                FROM `Show` sh
                JOIN Seat s ON s.Venue_ID = sh.Venue_ID
                WHERE sh.Show_ID = %s
                ORDER BY s.Seat_ID
            """, (show_id,))
            seats = cursor.fetchall()

        for seat in seats:
            seat["Is_Booked"] = bool(seat["Is_Booked"])
            seat["Price"] = SEAT_PRICES.get(seat["Seat_Type"], SEAT_PRICES["Regular"])
        return json_response(seats)

    except Error as err:
        return db_error_response(err, "fetching seats")


@app.route("/api/events", methods=["GET"])
def get_events():
    try:
        with db_cursor() as (conn, cursor):
            cursor.execute("SELECT * FROM Event ORDER BY Event_ID")
            return json_response(cursor.fetchall())
    except Error as err:
        return db_error_response(err, "fetching events")


@app.route("/api/venues", methods=["GET"])
def get_venues():
    try:
        with db_cursor() as (conn, cursor):
            cursor.execute("SELECT * FROM Venue ORDER BY Venue_ID")
            return json_response(cursor.fetchall())
    except Error as err:
        return db_error_response(err, "fetching venues")


# ---------------------------------------------------------------------------
# Bookings (login required)
# ---------------------------------------------------------------------------

def to_int(value):
    """Accept 3 or "3", reject everything else (including True/False)."""
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@app.route("/api/bookings", methods=["POST"])
@login_required
def create_booking():
    data = request.get_json(silent=True) or {}

    show_id = to_int(data.get("show_id"))
    raw_seats = data.get("seat_ids")
    if raw_seats is None and data.get("seat_id") is not None:
        raw_seats = [data.get("seat_id")]  # old single-seat format still works
    payment_method = data.get("payment_method", "UPI")

    if show_id is None or not isinstance(raw_seats, list) or not raw_seats:
        return json_response({"error": "show_id and at least one seat are required"}, 400)

    seat_ids = [to_int(s) for s in raw_seats]
    if any(s is None for s in seat_ids) or len(set(seat_ids)) != len(seat_ids):
        return json_response({"error": "Seat list is invalid"}, 400)
    if len(seat_ids) > MAX_SEATS_PER_BOOKING:
        return json_response(
            {"error": f"You can book at most {MAX_SEATS_PER_BOOKING} seats at once"}, 400
        )
    if payment_method not in PAYMENT_METHODS:
        return json_response({"error": "Unsupported payment method"}, 400)

    placeholders = ",".join(["%s"] * len(seat_ids))

    # autocommit=False: the booking, its tickets and the payment are saved
    # together or not at all.
    with db_cursor(autocommit=False) as (conn, cursor):
        try:
            cursor.execute(
                "SELECT Venue_ID FROM `Show` WHERE Show_ID = %s AND Show_Date >= CURDATE()",
                (show_id,),
            )
            show = cursor.fetchone()
            if show is None:
                return json_response({"error": "Show not found or already finished"}, 404)

            cursor.execute(
                f"SELECT Seat_ID, Seat_Number, Seat_Type FROM Seat "
                f"WHERE Venue_ID = %s AND Seat_ID IN ({placeholders})",
                (show["Venue_ID"], *seat_ids),
            )
            seats = cursor.fetchall()
            if len(seats) != len(seat_ids):
                return json_response(
                    {"error": "One or more seats do not belong to this show's venue"}, 400
                )

            cursor.execute(
                f"SELECT s.Seat_Number FROM Ticket t JOIN Seat s ON s.Seat_ID = t.Seat_ID "
                f"WHERE t.Show_ID = %s AND t.Ticket_Status <> 'Cancelled' "
                f"AND t.Seat_ID IN ({placeholders})",
                (show_id, *seat_ids),
            )
            taken = [row["Seat_Number"] for row in cursor.fetchall()]
            if taken:
                return json_response(
                    {"error": f"Seat {', '.join(taken)} was just booked. Please pick another."}, 409
                )

            cursor.execute(
                "INSERT INTO Booking (User_ID, Status) VALUES (%s, 'Pending')",
                (g.user_id,),
            )
            booking_id = cursor.lastrowid

            total = 0
            tickets = []
            for seat in seats:
                price = SEAT_PRICES.get(seat["Seat_Type"], SEAT_PRICES["Regular"])
                ticket_type = TICKET_TYPE_FOR_SEAT.get(seat["Seat_Type"], "Standard")
                cursor.execute(
                    """
                    INSERT INTO Ticket
                        (Booking_ID, Show_ID, Seat_ID, Ticket_Type, Price, Ticket_Status)
                    VALUES (%s, %s, %s, %s, %s, 'Valid')
                    """,
                    (booking_id, show_id, seat["Seat_ID"], ticket_type, price),
                )
                total += price
                tickets.append({
                    "ticket_id": cursor.lastrowid,
                    "seat_number": seat["Seat_Number"],
                    "ticket_type": ticket_type,
                    "price": price,
                })

            # The payment is simulated. It is created as Pending and then set to
            # Success, because the DB trigger trg_payment_confirm_booking only
            # fires on UPDATE; that is what moves the booking to 'Confirmed'.
            cursor.execute(
                "INSERT INTO Payment (Booking_ID, Amount, Payment_Method, Payment_Status) "
                "VALUES (%s, %s, %s, 'Pending')",
                (booking_id, total, payment_method),
            )
            cursor.execute(
                "UPDATE Payment SET Payment_Status = 'Success' WHERE Booking_ID = %s",
                (booking_id,),
            )

            cursor.execute("SELECT Status, Total_Amount FROM Booking WHERE Booking_ID = %s", (booking_id,))
            booking = cursor.fetchone()
            conn.commit()

            return json_response({
                "message": "Booking created successfully",
                "booking_id": booking_id,
                "show_id": show_id,
                "status": booking["Status"],
                "total": booking["Total_Amount"],
                "tickets": tickets,
            }, 201)

        except Error as err:
            conn.rollback()
            if err.errno == 1062:  # unique (Show_ID, Active_Seat_ID): someone else won the race
                return json_response(
                    {"error": "One of those seats was just booked. Please pick another."}, 409
                )
            if err.sqlstate == "45000":  # a trigger rejected it (e.g. wrong venue)
                return json_response({"error": err.msg}, 400)
            return db_error_response(err, "creating a booking")


@app.route("/api/bookings/<int:user_id>", methods=["GET"])
@login_required
def get_user_bookings(user_id):
    if user_id != g.user_id:
        return json_response({"error": "You can only view your own bookings"}, 403)

    try:
        with db_cursor() as (conn, cursor):
            cursor.execute("""
                SELECT
                    b.Booking_ID,
                    b.Status AS Booking_Status,
                    b.Booking_Date,
                    b.Total_Amount,
                    p.Payment_Status
                FROM Booking b
                LEFT JOIN Payment p ON p.Booking_ID = b.Booking_ID
                WHERE b.User_ID = %s
                ORDER BY b.Booking_Date DESC, b.Booking_ID DESC
            """, (user_id,))
            bookings = cursor.fetchall()

            cursor.execute("""
                SELECT
                    t.Booking_ID,
                    t.Ticket_ID,
                    t.Ticket_Type,
                    t.Price,
                    t.Ticket_Status,
                    s.Seat_Number,
                    sh.Show_ID,
                    sh.Show_Date,
                    sh.Start_Time,
                    e.Event_Name,
                    v.Venue_Name,
                    v.Location
                FROM Ticket t
                JOIN Booking b ON b.Booking_ID = t.Booking_ID
                JOIN Seat s ON s.Seat_ID = t.Seat_ID
                JOIN `Show` sh ON sh.Show_ID = t.Show_ID
                JOIN Event e ON e.Event_ID = sh.Event_ID
                JOIN Venue v ON v.Venue_ID = sh.Venue_ID
                WHERE b.User_ID = %s
                ORDER BY t.Ticket_ID
            """, (user_id,))
            tickets = cursor.fetchall()

        by_booking = {b["Booking_ID"]: [] for b in bookings}
        for ticket in tickets:
            by_booking[ticket["Booking_ID"]].append(ticket)
        for booking in bookings:
            booking["tickets"] = by_booking[booking["Booking_ID"]]
        return json_response(bookings)

    except Error as err:
        return db_error_response(err, "fetching user bookings")


@app.route("/api/health", methods=["GET"])
def health_check():
    try:
        with db_cursor() as (conn, cursor):
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return json_response({"status": "ok", "database": "connected"})

    except Error as err:
        app.logger.exception("Database health check failed")
        return json_response({
            "status": "error",
            "database": "disconnected",
            "error": str(err),
        }, 500)


if __name__ == "__main__":
    # debug=False: debug mode lets anyone who can reach the site run code on your PC.
    app.run(debug=False, host="0.0.0.0", port=5001)
