// Thin client for the Flask backend. In dev, Vite proxies /api to port 5001;
// in production Flask serves the built site itself, so the paths are the same.

export type ApiShow = {
  Show_ID: number;
  Event_Name: string;
  Event_Type: string;
  Venue_Name: string;
  Location: string;
  Show_Date: string; // "2026-11-10"
  Start_Time: string; // "18:00:00"
  End_Time: string;
  Available_Seats: number;
  Starting_Price: number | null;
};

export type ApiSeat = {
  Seat_ID: number;
  Seat_Number: string;
  Seat_Type: string;
  Price: number;
  Is_Booked: boolean;
};

export type ApiTicket = {
  Ticket_ID: number;
  Booking_ID: number;
  Seat_Number: string;
  Ticket_Type: string;
  Ticket_Status: string;
  Price: number;
  Show_ID: number;
  Show_Date: string;
  Start_Time: string;
  Event_Name: string;
  Venue_Name: string;
  Location: string;
};

export type ApiBooking = {
  Booking_ID: number;
  Booking_Status: string;
  Booking_Date: string;
  Total_Amount: number;
  Payment_Status: string | null;
  tickets: ApiTicket[];
};

export type ApiUser = {
  user_id: number;
  name: string;
  email: string;
  user_type: string;
};

export type AuthResult = { user: ApiUser; token: string };

export type BookingResult = {
  booking_id: number;
  status: string;
  total: number;
  tickets: { ticket_id: number; seat_number: string; ticket_type: string; price: number }[];
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Is app.py running?", 0);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
  }
  return data as T;
}

export const fetchShows = () => request<ApiShow[]>("/api/shows");

export const fetchSeats = (showId: number) => request<ApiSeat[]>(`/api/shows/${showId}/seats`);

export const registerUser = (body: {
  name: string;
  email: string;
  contact: string;
  password: string;
}) => request<AuthResult>("/api/auth/register", { method: "POST", body });

export const loginUser = (body: { email: string; password: string }) =>
  request<AuthResult>("/api/auth/login", { method: "POST", body });

export const fetchBookings = (userId: number, token: string) =>
  request<ApiBooking[]>(`/api/bookings/${userId}`, { token });

export const createBooking = (token: string, body: { show_id: number; seat_ids: number[] }) =>
  request<BookingResult>("/api/bookings", { method: "POST", body, token });
