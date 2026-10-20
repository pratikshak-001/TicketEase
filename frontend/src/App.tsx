import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createBooking,
  fetchBookings,
  fetchSeats,
  fetchShows,
  loginUser,
  registerUser,
  type ApiBooking,
  type ApiSeat,
  type ApiShow,
  type BookingResult,
} from "./api";

type IconName =
  | "arrow"
  | "calendar"
  | "check"
  | "chevron"
  | "close"
  | "heart"
  | "location"
  | "menu"
  | "minus"
  | "music"
  | "plus"
  | "search"
  | "spark"
  | "ticket"
  | "user";

function Icon({
  name,
  size = 20,
  filled = false,
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
}) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M8 3v4m8-4v4M3 10h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="M5 5l14 14M19 5 5 19" />,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    location: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    minus: <path d="M5 12h14" />,
    music: (
      <>
        <path d="M9 18V5l10-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="16" cy="16" r="3" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    spark: <path d="M12 2c.5 5.5 2.5 8 8 8-5.5.5-7.5 3-8 8-.5-5-2.5-7.5-8-8 5.5 0 7.5-2.5 8-8Z" />,
    ticket: (
      <>
        <path d="M3 8.5A2.5 2.5 0 0 0 5.5 6h13A2.5 2.5 0 0 0 21 8.5v1a2.5 2.5 0 0 0 0 5v1A2.5 2.5 0 0 0 18.5 18h-13A2.5 2.5 0 0 0 3 15.5v-1a2.5 2.5 0 0 0 0-5v-1Z" />
        <path d="M9 8v8" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const photos = {
  hero: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=90",
  purple:
    "https://images.unsplash.com/photo-1603910234616-3b5f4a6be2b4?auto=format&fit=crop&w=1100&q=85",
  crowd:
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1100&q=85",
  lights:
    "https://images.unsplash.com/photo-1583795484071-3c453e3a7c71?auto=format&fit=crop&w=1100&q=85",
  drums:
    "https://images.unsplash.com/photo-1526749464606-83091e34a261?auto=format&fit=crop&w=1100&q=85",
  festival:
    "https://images.unsplash.com/photo-1619229725920-ac8b63b0631a?auto=format&fit=crop&w=1100&q=85",
  night:
    "https://images.unsplash.com/photo-1450044804117-534ccd6e6a3a?auto=format&fit=crop&w=1100&q=85",
};

type EventItem = {
  id: number; // Show_ID in the database
  order: number;
  title: string;
  category: string;
  date: string; // "NOV"
  day: string; // "10"
  monthLong: string; // "November"
  weekday: string; // "TUE"
  time: string; // "6:00 PM"
  time24: string; // "18:00"
  venue: string;
  city: string; // full Location, e.g. "Pune - Koregaon Park"
  town: string; // "Pune"
  price: number; // lowest seat price
  available: number;
  image: string;
  color: string;
  popular: boolean;
  soldOut: boolean;
};

type Session = {
  id: number;
  name: string;
  email: string;
  token: string;
};

const MAX_SEATS = 6;

function readStore<T>(key: string, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// The database has no images or colours, so each event type gets a look.
const typeStyle: Record<string, { image: string; color: string }> = {
  Concert: { image: photos.purple, color: "violet" },
  Movie: { image: photos.lights, color: "blue" },
  Sports: { image: photos.crowd, color: "lime" },
  Theatre: { image: photos.night, color: "amber" },
  Comedy: { image: photos.drums, color: "coral" },
  Other: { image: photos.festival, color: "pink" },
};

function splitDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

function showToEvent(show: ApiShow, order: number): EventItem {
  const { year, month, day } = splitDate(show.Show_Date);
  const style = typeStyle[show.Event_Type] ?? typeStyle.Other;
  return {
    id: show.Show_ID,
    order,
    title: show.Event_Name,
    category: show.Event_Type,
    date: MONTHS[month - 1],
    day: String(day).padStart(2, "0"),
    monthLong: MONTHS_LONG[month - 1],
    weekday: WEEKDAYS[new Date(year, month - 1, day).getDay()],
    time: formatTime(show.Start_Time),
    time24: show.Start_Time.slice(0, 5),
    venue: show.Venue_Name,
    city: show.Location,
    town: show.Location.split(" - ")[0],
    price: show.Starting_Price ?? 0,
    available: show.Available_Seats,
    image: style.image,
    color: style.color,
    popular: show.Available_Seats > 0 && show.Available_Seats <= 2,
    soldOut: show.Available_Seats <= 0,
  };
}

const categories = ["All", "Movie", "Concert", "Sports", "Theatre", "Comedy", "Other"];

export default function App() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [favorites, setFavorites] = useState<number[]>(() =>
    readStore("ticketease-favorites", []),
  );
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [shows, setShows] = useState<EventItem[]>([]);
  const [showsLoading, setShowsLoading] = useState(true);
  const [showsError, setShowsError] = useState("");
  const [seats, setSeats] = useState<ApiSeat[]>([]);
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [seatsError, setSeatsError] = useState("");
  const [selectedSeatIds, setSelectedSeatIds] = useState<number[]>([]);
  const [bookingError, setBookingError] = useState("");
  const [lastBooking, setLastBooking] = useState<BookingResult | null>(null);
  const [bookingStep, setBookingStep] = useState<"details" | "success">("details");
  const [bookingBusy, setBookingBusy] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sort, setSort] = useState("soonest");
  const [showSaved, setShowSaved] = useState(false);
  const [user, setUser] = useState<Session | null>(() => {
    const stored = readStore<Session | null>("ticketease-session", null);
    return stored && stored.id && stored.token ? stored : null;
  });
  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authContact, setAuthContact] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterState, setNewsletterState] = useState<"idle" | "success" | "error">("idle");
  const [legalOpen, setLegalOpen] = useState<"privacy" | "terms" | null>(null);

  const filteredEvents = useMemo(
    () => {
      const filtered = shows.filter(
        (event) =>
          (category === "All" || event.category === category) &&
          (!showSaved || favorites.includes(event.id)) &&
          `${event.title} ${event.venue} ${event.city}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      );
      return [...filtered].sort((a, b) => {
        if (sort === "price-low") return a.price - b.price;
        if (sort === "price-high") return b.price - a.price;
        return a.order - b.order;
      });
    },
    [shows, query, category, favorites, showSaved, sort],
  );

  useEffect(() => {
    const hasModal = selected || authOpen || accountOpen || legalOpen;
    document.body.style.overflow = hasModal ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selected, authOpen, accountOpen, legalOpen]);

  useEffect(() => {
    window.localStorage.setItem("ticketease-favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (user) window.localStorage.setItem("ticketease-session", JSON.stringify(user));
    else window.localStorage.removeItem("ticketease-session");
  }, [user]);

  const loadShows = useCallback(async (quiet = false) => {
    if (!quiet) setShowsLoading(true);
    setShowsError("");
    try {
      const data = await fetchShows();
      setShows(data.map(showToEvent));
    } catch (err) {
      if (!quiet) setShowsError(err instanceof Error ? err.message : "Could not load events.");
    } finally {
      setShowsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShows();
  }, [loadShows]);

  const refreshBookings = useCallback(async () => {
    if (!user) {
      setBookings([]);
      return;
    }
    try {
      setBookings(await fetchBookings(user.id, user.token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setToast("Your session expired. Please log in again.");
      }
    }
  }, [user]);

  useEffect(() => {
    void refreshBookings();
  }, [refreshBookings]);

  const loadSeats = useCallback(async (showId: number) => {
    setSeatsLoading(true);
    setSeatsError("");
    try {
      setSeats(await fetchSeats(showId));
    } catch (err) {
      setSeats([]);
      setSeatsError(err instanceof Error ? err.message : "Could not load seats.");
    } finally {
      setSeatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    setSeats([]);
    setSelectedSeatIds([]);
    void loadSeats(selected.id);
  }, [selected, loadSeats]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelected(null);
      setAuthOpen(false);
      setAccountOpen(false);
      setLegalOpen(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const openBooking = (event: EventItem) => {
    setSelected(event);
    setBookingStep("details");
    setBookingError("");
    setLastBooking(null);
  };

  const closeBooking = () => {
    setSelected(null);
    setBookingStep("details");
    setBookingError("");
  };

  const toggleSeat = (seat: ApiSeat) => {
    if (seat.Is_Booked) return;
    setBookingError("");
    if (selectedSeatIds.includes(seat.Seat_ID)) {
      setSelectedSeatIds(selectedSeatIds.filter((id) => id !== seat.Seat_ID));
    } else if (selectedSeatIds.length >= MAX_SEATS) {
      setBookingError(`You can book up to ${MAX_SEATS} seats at once.`);
    } else {
      setSelectedSeatIds([...selectedSeatIds, seat.Seat_ID]);
    }
  };

  const logout = () => {
    setUser(null);
    setBookings([]);
    setAccountOpen(false);
    setToast("Logged out");
  };

  const toggleFavorite = (id: number) => {
    setFavorites((items) => {
      const saved = items.includes(id);
      setToast(saved ? "Removed from saved events" : "Saved for later");
      return saved ? items.filter((item) => item !== id) : [...items, id];
    });
  };

  const scrollToEvents = () => {
    document.querySelector("#events")?.scrollIntoView({ behavior: "smooth" });
  };

  const openAccount = () => {
    if (user) setAccountOpen(true);
    else {
      setAuthMode("login");
      setAuthOpen(true);
    }
    setMobileOpen(false);
  };

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (authBusy) return;
    const email = authEmail.trim();
    const name = authName.trim();
    const contact = authContact.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setAuthError("Enter a valid email address.");
      return;
    }
    if (authMode === "signup" && name.length < 2) {
      setAuthError("Enter your name to create an account.");
      return;
    }
    if (authMode === "signup" && !/^[0-9]{10}$/.test(contact)) {
      setAuthError("Enter a 10-digit mobile number.");
      return;
    }
    if (authPassword.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      const result =
        authMode === "signup"
          ? await registerUser({ name, email, contact, password: authPassword })
          : await loginUser({ email, password: authPassword });
      setUser({
        id: result.user.user_id,
        name: result.user.name,
        email: result.user.email,
        token: result.token,
      });
      setAuthPassword("");
      setAuthOpen(false);
      setToast(authMode === "signup" ? "Account created. Welcome!" : "Welcome back");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAuthBusy(false);
    }
  };

  const completeBooking = async () => {
    if (!selected || bookingBusy) return;
    if (!user) {
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }
    if (!selectedSeatIds.length) {
      setBookingError("Pick at least one seat.");
      return;
    }
    setBookingBusy(true);
    setBookingError("");
    try {
      const result = await createBooking(user.token, {
        show_id: selected.id,
        seat_ids: selectedSeatIds,
      });
      setLastBooking(result);
      setBookingStep("success");
      void refreshBookings();
      void loadShows(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setAuthMode("login");
        setAuthOpen(true);
        setBookingError("Your session expired. Please log in again.");
      } else {
        setBookingError(err instanceof Error ? err.message : "Booking failed.");
        // Seats may have changed under us (409), so refresh them.
        setSelectedSeatIds([]);
        void loadSeats(selected.id);
      }
    } finally {
      setBookingBusy(false);
    }
  };

  const submitNewsletter = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(newsletterEmail.trim())) {
      setNewsletterState("error");
      return;
    }
    setNewsletterState("success");
    setToast("You’re on the weekly events list");
  };

  const chooseCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    setShowSaved(false);
    window.setTimeout(scrollToEvents, 0);
  };

  const featured = shows.find((item) => item.popular) ?? shows[0];
  const selectedSeats = seats.filter((seat) => selectedSeatIds.includes(seat.Seat_ID));
  const seatTotal = selectedSeats.reduce((sum, seat) => sum + seat.Price, 0);
  const activeBookings = bookings.filter((item) => item.Booking_Status !== "Cancelled");
  const ticketTotal = activeBookings.reduce(
    (sum, item) => sum + item.tickets.filter((t) => t.Ticket_Status !== "Cancelled").length,
    0,
  );

  return (
    <div className="site">
      <header className="nav-shell">
        <a className="logo" href="#" aria-label="TicketEase home">
          <span className="logo-mark">
            <span>t</span>
            <i />
          </span>
          <span>ticketease</span>
        </a>

        <nav className={mobileOpen ? "open" : ""}>
          <a href="#events" onClick={() => setMobileOpen(false)}>Discover</a>
          <a href="#how" onClick={() => setMobileOpen(false)}>How it works</a>
          <a href="#stories" onClick={() => setMobileOpen(false)}>Why us</a>
          <button onClick={openAccount}>My tickets</button>
        </nav>

        <div className="nav-actions">
          <button className="login-button" onClick={openAccount}>
            <Icon name="user" size={17} />
            <span>{user ? user.name.split(" ")[0] : "Log in"}</span>
            {bookings.length > 0 && <b>{bookings.length}</b>}
          </button>
          <button className="nav-ticket" onClick={scrollToEvents}>
            Find tickets <Icon name="arrow" size={16} />
          </button>
          <button
            className="mobile-menu"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Open navigation"
          >
            <Icon name={mobileOpen ? "close" : "menu"} />
          </button>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-grain" />
          <div className="hero-content">
            <div className="hero-copy">
              <div className="mini-label">
                <span><Icon name="spark" size={13} /></span>
                Live more. Remember more.
              </div>
              <h1>
                Your city is
                <br />
                <em>calling.</em>
              </h1>
              <p>
                The best gigs, shows, and nights out — handpicked and ready
                when you are.
              </p>
              <div className="hero-buttons">
                <button className="primary-action" onClick={scrollToEvents}>
                  Explore events <Icon name="arrow" size={18} />
                </button>
                <span>
                  <b>50k+</b>
                  happy ticket holders
                </span>
              </div>
            </div>

            <div className="hero-visual">
              <div className="hero-image">
                <img src={photos.hero} alt="Crowd enjoying a live music performance" />
                <div className="image-shade" />
                <div className="live-pill"><i /> LIVE THIS WEEK</div>
                <div className="hero-event-title">
                  <span>FEATURED EXPERIENCE</span>
                  <strong>{featured ? featured.title : "Live events"}</strong>
                  <small>
                    <Icon name="location" size={13} />{" "}
                    {featured ? `${featured.town} · ${featured.monthLong} ${Number(featured.day)}` : "Coming soon"}
                  </small>
                </div>
              </div>
              <div className="floating-ticket">
                <div className="ticket-stub">
                  <Icon name="music" size={18} />
                  <span>ADMIT ONE</span>
                </div>
                <div className="ticket-main">
                  <span>{featured ? `${featured.weekday} · ${featured.time24}` : "LIVE · SOON"}</span>
                  <strong>GOOD<br />VIBES<br />ONLY</strong>
                  <small>TE / 2026</small>
                </div>
              </div>
              <div className="burst">JUST<br />ANNOUNCED</div>
            </div>
          </div>

          <div className="discover-bar">
            <div className="discover-field grow">
              <Icon name="search" />
              <div>
                <label htmlFor="hero-search">What are you into?</label>
                <input
                  id="hero-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search artists, events or venues"
                />
              </div>
            </div>
            <div className="discover-field">
              <Icon name="location" />
              <div>
                <label>Where?</label>
                <span>{featured?.town ?? "Anywhere"}</span>
              </div>
              <Icon name="chevron" size={15} />
            </div>
            <div className="discover-field">
              <Icon name="calendar" />
              <div>
                <label>When?</label>
                <span>Any date</span>
              </div>
              <Icon name="chevron" size={15} />
            </div>
            <button onClick={scrollToEvents} aria-label="Search events">
              <Icon name="search" />
            </button>
          </div>
        </section>

        <section className="marquee" aria-label="Event categories">
          <div>
            <span>MOVIES</span><i />
            <span>LIVE MUSIC</span><i />
            <span>SPORTS</span><i />
            <span>THEATRE</span><i />
            <span>COMEDY</span><i />
          </div>
        </section>

        <section className="events-section" id="events">
          <div className="section-heading">
            <div>
              <div className="overline">CURATED FOR YOU</div>
              <h2>Make a story worth <em>telling.</em></h2>
            </div>
            <p>Fresh picks, local favorites, and unmissable nights — all in one place.</p>
          </div>

          <div className="filter-row">
            <div className="category-list">
              {categories.map((item) => (
                <button
                  key={item}
                  className={category === item ? "active" : ""}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
              <button
                className={showSaved ? "active saved-filter" : "saved-filter"}
                onClick={() => setShowSaved(!showSaved)}
              >
                <Icon name="heart" size={12} filled={showSaved} />
                Saved {favorites.length > 0 && `(${favorites.length})`}
              </button>
            </div>
            <div className="sort-control">
              <span>{filteredEvents.length} experiences</span>
              <label>
                <span>Sort by</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="soonest">Soonest</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                </select>
              </label>
            </div>
          </div>

          {showsLoading ? (
            <div className="no-events">
              <span><Icon name="search" size={27} /></span>
              <h3>Loading events…</h3>
              <p>Fetching the latest shows.</p>
            </div>
          ) : showsError ? (
            <div className="no-events">
              <span><Icon name="close" size={27} /></span>
              <h3>Couldn’t load events</h3>
              <p>{showsError}</p>
              <button onClick={() => loadShows()}>Try again</button>
            </div>
          ) : filteredEvents.length ? (
            <div className="event-grid">
              {filteredEvents.map((event, index) => (
                <article className={`event-card event-${event.color}`} key={event.id}>
                  <div className="event-image">
                    <img src={event.image} alt="" />
                    <div className="event-tint" />
                    <div className="event-date">
                      <b>{event.day}</b>
                      <span>{event.date}</span>
                    </div>
                    {event.soldOut ? (
                      <span className="popular">SOLD OUT</span>
                    ) : (
                      event.popular && <span className="popular">SELLING FAST</span>
                    )}
                    <button
                      className={`heart-button ${favorites.includes(event.id) ? "liked" : ""}`}
                      onClick={() => toggleFavorite(event.id)}
                      aria-label="Save event"
                    >
                      <Icon name="heart" size={18} filled={favorites.includes(event.id)} />
                    </button>
                    <span className="card-number">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="event-info">
                    <div className="event-category">{event.category}</div>
                    <h3>{event.title}</h3>
                    <div className="event-details">
                      <span><Icon name="calendar" size={14} /> {event.time}</span>
                      <span><Icon name="location" size={14} /> {event.venue}</span>
                    </div>
                    <div className="event-footer">
                      <div>
                        <small>STARTING AT</small>
                        <strong>₹{event.price.toLocaleString("en-IN")}</strong>
                      </div>
                      <button onClick={() => openBooking(event)} disabled={event.soldOut}>
                        {event.soldOut ? "Sold out" : "Get tickets"} <Icon name="arrow" size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="no-events">
              <span><Icon name="search" size={27} /></span>
              <h3>Nothing here yet</h3>
              <p>Try a different event name or category.</p>
              <button onClick={() => { setQuery(""); setCategory("All"); setShowSaved(false); }}>Reset filters</button>
            </div>
          )}
        </section>

        <section className="manifesto" id="stories">
          <div className="manifesto-image">
            <img src={photos.crowd} alt="Friends at an energetic live concert" />
            <div className="poster-note">
              <Icon name="ticket" size={18} />
              <span>MEMORIES<br />INCLUDED</span>
            </div>
          </div>
          <div className="manifesto-copy">
            <div className="overline">WHY TICKETEASE</div>
            <h2>Less scrolling.<br /><em>More living.</em></h2>
            <p>
              We believe the best moments happen when you put your phone down.
              So we make finding your next plan fast, simple, and genuinely fun.
            </p>
            <div className="manifesto-stats">
              <div><strong>Curated</strong><span>easy-to-scan discovery</span></div>
              <div><strong>Clear</strong><span>upfront ticket pricing</span></div>
              <div><strong>Simple</strong><span>saved plans in one place</span></div>
            </div>
          </div>
        </section>

        <section className="steps-section" id="how">
          <div className="steps-head">
            <div className="overline">NO FUSS, JUST FUN</div>
            <h2>Three steps between you<br />and a <em>great night.</em></h2>
          </div>
          <div className="steps-grid">
            <article>
              <span>01</span>
              <div className="step-icon"><Icon name="search" size={25} /></div>
              <h3>Find your thing</h3>
              <p>Explore events picked for your city, mood, and calendar.</p>
            </article>
            <article>
              <span>02</span>
              <div className="step-icon"><Icon name="ticket" size={26} /></div>
              <h3>Book in a few taps</h3>
              <p>Clear prices, secure checkout, and no surprise fees.</p>
            </article>
            <article>
              <span>03</span>
              <div className="step-icon"><Icon name="spark" size={27} /></div>
              <h3>Make it a memory</h3>
              <p>Show your ticket at the door and let the good part begin.</p>
            </article>
          </div>
        </section>

        <section className="newsletter">
          <div className="newsletter-symbol"><Icon name="spark" size={46} /></div>
          <div>
            <div className="overline">THE GOOD STUFF, IN YOUR INBOX</div>
            <h2>Never miss your<br />next favorite night.</h2>
          </div>
          <form onSubmit={submitNewsletter} className={newsletterState}>
            {newsletterState === "success" ? (
              <div className="newsletter-success">
                <Icon name="check" size={18} />
                <span>You're in. Watch your inbox.</span>
              </div>
            ) : (
              <>
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(event) => {
                    setNewsletterEmail(event.target.value);
                    setNewsletterState("idle");
                  }}
                  placeholder="you@email.com"
                  aria-label="Email address"
                  aria-invalid={newsletterState === "error"}
                />
                <button type="submit">Count me in <Icon name="arrow" size={17} /></button>
                <small className={newsletterState === "error" ? "form-error" : ""}>
                  {newsletterState === "error"
                    ? "Enter a valid email address."
                    : "No spam. Just great plans, once a week."}
                </small>
              </>
            )}
          </form>
        </section>
      </main>

      <footer>
        <div className="footer-main">
          <div>
            <a className="logo footer-logo" href="#">
              <span className="logo-mark"><span>t</span><i /></span>
              <span>ticketease</span>
            </a>
            <p>More stories. Fewer “maybe next time” moments.</p>
          </div>
          <div className="footer-links">
            <div>
              <strong>Explore</strong>
              <a href="#events" onClick={() => chooseCategory("All")}>All events</a>
              <a href="#events" onClick={() => chooseCategory("Concert")}>Concerts</a>
              <a href="#events" onClick={() => chooseCategory("Movie")}>Movies</a>
            </div>
            <div>
              <strong>Company</strong>
              <a href="#stories">About us</a>
              <a href="#how">How it works</a>
              <button onClick={() => setToast("Support chat is not connected in this demo")}>Support</button>
            </div>
            <div>
              <strong>Follow</strong>
              <a href="https://instagram.com" target="_blank" rel="noreferrer">Instagram</a>
              <a href="https://x.com" target="_blank" rel="noreferrer">X / Twitter</a>
              <a href="https://youtube.com" target="_blank" rel="noreferrer">YouTube</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 TicketEase</span>
          <span>Made for nights worth remembering.</span>
          <div>
            <button onClick={() => setLegalOpen("privacy")}>Privacy</button>
            <button onClick={() => setLegalOpen("terms")}>Terms</button>
          </div>
        </div>
      </footer>

      {selected && (
        <div className="modal-backdrop" onMouseDown={closeBooking}>
          <div className="booking-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={closeBooking} aria-label="Close booking">
              <Icon name="close" size={19} />
            </button>
            {bookingStep === "details" ? (
              <>
                <div className="modal-cover">
                  <img src={selected.image} alt="" />
                  <div />
                  <span>{selected.category}</span>
                  <h2>{selected.title}</h2>
                </div>
                <div className="modal-body">
                  <div className="booking-meta">
                    <span><Icon name="calendar" size={18} /> {selected.day} {selected.date} · {selected.time}</span>
                    <span><Icon name="location" size={18} /> {selected.venue}, {selected.city}</span>
                  </div>
                  <div className="seat-section">
                    <div className="seat-section-head">
                      <strong>Choose your seats</strong>
                      <span>Up to {MAX_SEATS} per booking</span>
                    </div>
                    {seatsLoading ? (
                      <p className="seat-note">Loading seats…</p>
                    ) : seatsError ? (
                      <p className="inline-error" role="alert">
                        {seatsError}{" "}
                        <button className="link-button" onClick={() => loadSeats(selected.id)}>
                          Try again
                        </button>
                      </p>
                    ) : seats.length === 0 ? (
                      <p className="seat-note">No seats are set up for this venue yet.</p>
                    ) : (
                      <div className="seat-grid">
                        {seats.map((seat) => {
                          const isSelected = selectedSeatIds.includes(seat.Seat_ID);
                          return (
                            <button
                              key={seat.Seat_ID}
                              type="button"
                              className={`seat ${isSelected ? "selected" : ""}`}
                              disabled={seat.Is_Booked}
                              aria-pressed={isSelected}
                              onClick={() => toggleSeat(seat)}
                            >
                              <b>{seat.Seat_Number}</b>
                              <small>
                                {seat.Is_Booked
                                  ? "Taken"
                                  : `${seat.Seat_Type} · ₹${seat.Price.toLocaleString("en-IN")}`}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="total-line">
                    <span>
                      Total{" "}
                      <small>
                        {selectedSeats.length
                          ? `${selectedSeats.length} ${selectedSeats.length === 1 ? "seat" : "seats"} · ${selectedSeats.map((seat) => seat.Seat_Number).join(", ")}`
                          : "Select at least one seat"}
                      </small>
                    </span>
                    <strong>₹{seatTotal.toLocaleString("en-IN")}</strong>
                  </div>
                  {bookingError && <p className="inline-error" role="alert">{bookingError}</p>}
                  <button
                    className="checkout-button"
                    onClick={completeBooking}
                    disabled={bookingBusy || (!!user && selectedSeatIds.length === 0)}
                  >
                    {bookingBusy ? (
                      <span className="button-spinner" />
                    ) : user ? (
                      <>Confirm booking <Icon name="arrow" size={18} /></>
                    ) : (
                      <>Log in to book <Icon name="arrow" size={18} /></>
                    )}
                  </button>
                  <p className="secure-note"><Icon name="check" size={13} /> College project · Payment is simulated, no money is charged</p>
                </div>
              </>
            ) : (
              <div className="success-state">
                <span><Icon name="check" size={35} /></span>
                <div className="overline">YOU'RE ON THE LIST</div>
                <h2>See you there.</h2>
                <p>
                  Your booking for <strong>{selected.title}</strong> is confirmed
                  {lastBooking ? ` — seats ${lastBooking.tickets.map((t) => t.seat_number).join(", ")}` : ""}.
                  Payment is simulated, so no money was charged.
                </p>
                <div className="success-ticket">
                  <div><small>BOOKING ID</small><strong>#{lastBooking?.booking_id}</strong></div>
                  <Icon name="ticket" size={38} />
                </div>
                <button onClick={closeBooking}>Back to events</button>
              </div>
            )}
          </div>
        </div>
      )}

      {authOpen && (
        <div className="modal-backdrop" onMouseDown={() => setAuthOpen(false)}>
          <section
            className="account-modal auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Close account form">
              <Icon name="close" size={19} />
            </button>
            <div className="auth-intro">
              <span><Icon name="ticket" size={23} /></span>
              <div className="overline">YOUR TICKETEASE</div>
              <h2 id="auth-title">{authMode === "login" ? "Welcome back." : "Join the good times."}</h2>
              <p>
                {authMode === "login"
                  ? "Access your tickets and booking history."
                  : "Create an account to book seats and keep your plans together."}
              </p>
            </div>
            <form className="auth-form" onSubmit={submitAuth} noValidate>
              {authMode === "signup" && (
                <label>
                  <span>Name</span>
                  <input
                    value={authName}
                    onChange={(event) => setAuthName(event.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </label>
              )}
              <label>
                <span>Email address</span>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
              {authMode === "signup" && (
                <label>
                  <span>Mobile number</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={authContact}
                    onChange={(event) => setAuthContact(event.target.value.replace(/\D/g, ""))}
                    placeholder="10-digit number"
                    autoComplete="tel"
                  />
                </label>
              )}
              <label>
                <span>Password</span>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                />
              </label>
              {authError && <p className="inline-error" role="alert">{authError}</p>}
              <button className="auth-submit" type="submit" disabled={authBusy}>
                {authBusy ? "Please wait…" : authMode === "login" ? "Log in" : "Create account"}
                <Icon name="arrow" size={17} />
              </button>
              <p className="demo-disclosure">
                Your account is saved in the TicketEase database. Passwords are hashed and never stored as plain text.
              </p>
            </form>
            <div className="auth-switch">
              <span>{authMode === "login" ? "New to TicketEase?" : "Already have an account?"}</span>
              <button
                onClick={() => {
                  setAuthMode(authMode === "login" ? "signup" : "login");
                  setAuthError("");
                }}
              >
                {authMode === "login" ? "Create an account" : "Log in"}
              </button>
            </div>
          </section>
        </div>
      )}

      {accountOpen && user && (
        <div className="modal-backdrop" onMouseDown={() => setAccountOpen(false)}>
          <section
            className="account-modal dashboard-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setAccountOpen(false)} aria-label="Close dashboard">
              <Icon name="close" size={19} />
            </button>
            <header className="dashboard-head">
              <div className="profile-avatar">{user.name.slice(0, 2).toUpperCase()}</div>
              <div>
                <div className="overline">YOUR DASHBOARD</div>
                <h2 id="dashboard-title">Hi, {user.name.split(" ")[0]}.</h2>
                <p>{user.email}</p>
              </div>
              <button
                className="logout-button"
                onClick={logout}
              >
                Log out
              </button>
            </header>
            <div className="dashboard-stats">
              <div><strong>{activeBookings.length}</strong><span>Bookings</span></div>
              <div><strong>{favorites.length}</strong><span>Saved events</span></div>
              <div><strong>{ticketTotal}</strong><span>Tickets</span></div>
            </div>
            <div className="dashboard-section">
              <div className="dashboard-title-row">
                <div>
                  <h3>Recent bookings</h3>
                  <p>Saved to your account in the database.</p>
                </div>
                <button
                  onClick={() => {
                    setAccountOpen(false);
                    scrollToEvents();
                  }}
                >
                  Browse events
                </button>
              </div>
              {bookings.length ? (
                <div className="booking-list">
                  {bookings.map((booking) => {
                    const first = booking.tickets[0];
                    const live = booking.tickets.filter((t) => t.Ticket_Status !== "Cancelled");
                    return (
                      <article key={booking.Booking_ID}>
                        <div className="booking-date">
                          <b>{first ? String(splitDate(first.Show_Date).day).padStart(2, "0") : "—"}</b>
                          <span>{first ? MONTHS[splitDate(first.Show_Date).month - 1] : ""}</span>
                        </div>
                        <div className="booking-list-copy">
                          <strong>{first?.Event_Name ?? "Booking"}</strong>
                          <span>
                            {first ? `${formatTime(first.Start_Time)} · ${first.Venue_Name}` : "No tickets"}
                          </span>
                          <small>
                            #{booking.Booking_ID} · {booking.Booking_Status}
                            {live.length > 0 && ` · Seats ${live.map((t) => t.Seat_Number).join(", ")}`}
                          </small>
                        </div>
                        <div className="booking-list-total">
                          <strong>₹{booking.Total_Amount.toLocaleString("en-IN")}</strong>
                          <span>{live.length} {live.length === 1 ? "ticket" : "tickets"}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="dashboard-empty">
                  <span><Icon name="ticket" size={25} /></span>
                  <h3>No bookings yet</h3>
                  <p>When you complete a demo booking, it will appear here.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {legalOpen && (
        <div className="modal-backdrop" onMouseDown={() => setLegalOpen(null)}>
          <section
            className="account-modal legal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setLegalOpen(null)} aria-label="Close">
              <Icon name="close" size={19} />
            </button>
            <div className="overline">TICKETEASE</div>
            <h2 id="legal-title">{legalOpen === "privacy" ? "Privacy, plainly." : "Project terms."}</h2>
            {legalOpen === "privacy" ? (
              <p>This college project stores your account details and bookings in its MySQL database. Passwords are hashed before they are saved. Saved events and your login session stay in your browser’s local storage; clear it to remove them.</p>
            ) : (
              <p>This is a college project. Payment is simulated: no money is taken, and a booking here does not grant admission to a real event.</p>
            )}
            <button className="legal-close" onClick={() => setLegalOpen(null)}>Got it</button>
          </section>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        <span><Icon name="check" size={15} /></span>
        {toast}
      </div>
    </div>
  );
}
