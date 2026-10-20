-- ONLINE TICKET BOOKING MANAGEMENT SYSTEM
-- Updated MySQL 8.0+ script
-- WARNING: This script DROPS the existing ticket_booking database.
-- Back up any important data before running it.
--
-- Fixes in this version:
-- 0. Ticket table failed to create (CASCADE FK on generated-column base);
--    fk_ticket_seat now uses RESTRICT. Windows notes added.
--
-- Main updates:
-- 1. Booking totals are recalculated after ticket INSERT/UPDATE/DELETE.
-- 2. Cancelled seats can be booked again through a generated-column unique key.
-- 3. Ticket seat/venue validation applies to both INSERT and UPDATE.
-- 4. Booking cancellation checks the booking, uses a cursor, and reports
--    a refund only when the booking had a successful payment.
-- 5. Revenue reporting excludes cancelled tickets and uses successful payments.
--
-- Password values in the seed data are DEMO PLACEHOLDERS, not real passwords.
-- A real application must hash passwords in the backend (e.g. bcrypt/Argon2).

-- Windows notes: MySQL on Windows lowercases table names
-- (lower_case_table_names=1); every name below is used consistently, so this
-- is safe. Run with:  mysql -u root -p < ticket_booking_fixed.sql
-- or in MySQL Workbench: File > Open SQL Script, then run all (lightning icon).

SET NAMES utf8mb4;

DROP DATABASE IF EXISTS ticket_booking;
CREATE DATABASE ticket_booking CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ticket_booking;

-- =========================================================
-- 1. DDL: TABLES AND CONSTRAINTS
-- =========================================================

CREATE TABLE `User` (
    User_ID INT AUTO_INCREMENT,
    Name VARCHAR(100) NOT NULL,
    Email VARCHAR(120) NOT NULL,
    Contact CHAR(10) NOT NULL,
    Password VARCHAR(255) NOT NULL,
    User_Type VARCHAR(10) NOT NULL DEFAULT 'Normal',
    CONSTRAINT pk_user PRIMARY KEY (User_ID),
    CONSTRAINT uq_user_email UNIQUE (Email),
    CONSTRAINT uq_user_contact UNIQUE (Contact),
    CONSTRAINT ck_user_type CHECK (User_Type IN ('Admin', 'Normal')),
    CONSTRAINT ck_user_contact CHECK (Contact REGEXP '^[0-9]{10}$')
) ENGINE=InnoDB;

CREATE TABLE Event (
    Event_ID INT AUTO_INCREMENT,
    Event_Name VARCHAR(150) NOT NULL,
    Event_Type VARCHAR(30) NOT NULL,
    Description TEXT,
    CONSTRAINT pk_event PRIMARY KEY (Event_ID),
    CONSTRAINT ck_event_type
        CHECK (Event_Type IN ('Movie', 'Concert', 'Sports', 'Theatre', 'Comedy', 'Other'))
) ENGINE=InnoDB;

CREATE TABLE Venue (
    Venue_ID INT AUTO_INCREMENT,
    Venue_Name VARCHAR(120) NOT NULL,
    Location VARCHAR(150) NOT NULL,
    Capacity INT NOT NULL,
    CONSTRAINT pk_venue PRIMARY KEY (Venue_ID),
    CONSTRAINT ck_venue_capacity CHECK (Capacity > 0)
) ENGINE=InnoDB;

CREATE TABLE `Show` (
    Show_ID INT AUTO_INCREMENT,
    Event_ID INT NOT NULL,
    Venue_ID INT NOT NULL,
    Show_Date DATE NOT NULL,
    Start_Time TIME NOT NULL,
    End_Time TIME NOT NULL,
    CONSTRAINT pk_show PRIMARY KEY (Show_ID),
    CONSTRAINT fk_show_event FOREIGN KEY (Event_ID)
        REFERENCES Event(Event_ID) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_show_venue FOREIGN KEY (Venue_ID)
        REFERENCES Venue(Venue_ID) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT ck_show_time CHECK (End_Time > Start_Time),
    CONSTRAINT uq_show_slot UNIQUE (Venue_ID, Show_Date, Start_Time)
) ENGINE=InnoDB;

CREATE TABLE Seat (
    Seat_ID INT AUTO_INCREMENT,
    Venue_ID INT NOT NULL,
    Seat_Number VARCHAR(10) NOT NULL,
    Seat_Type VARCHAR(15) NOT NULL DEFAULT 'Regular',
    CONSTRAINT pk_seat PRIMARY KEY (Seat_ID),
    CONSTRAINT fk_seat_venue FOREIGN KEY (Venue_ID)
        REFERENCES Venue(Venue_ID) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_seat_number UNIQUE (Venue_ID, Seat_Number),
    CONSTRAINT ck_seat_type CHECK (Seat_Type IN ('Regular', 'Premium', 'VIP'))
) ENGINE=InnoDB;

CREATE TABLE Booking (
    Booking_ID INT AUTO_INCREMENT,
    User_ID INT NOT NULL,
    Booking_Date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Total_Amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    Status VARCHAR(15) NOT NULL DEFAULT 'Pending',
    CONSTRAINT pk_booking PRIMARY KEY (Booking_ID),
    CONSTRAINT fk_booking_user FOREIGN KEY (User_ID)
        REFERENCES `User`(User_ID) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT ck_booking_amount CHECK (Total_Amount >= 0),
    CONSTRAINT ck_booking_status CHECK (Status IN ('Pending', 'Confirmed', 'Cancelled'))
) ENGINE=InnoDB;

CREATE TABLE Ticket (
    Ticket_ID INT AUTO_INCREMENT,
    Booking_ID INT NOT NULL,
    Show_ID INT NOT NULL,
    Seat_ID INT NOT NULL,
    Ticket_Type VARCHAR(15) NOT NULL DEFAULT 'Standard',
    Price DECIMAL(8,2) NOT NULL,
    Ticket_Status VARCHAR(15) NOT NULL DEFAULT 'Valid',

    -- Active tickets occupy a seat. Cancelled tickets produce NULL here,
    -- and MySQL permits multiple NULL values in a UNIQUE index.
    Active_Seat_ID INT GENERATED ALWAYS AS
        (CASE WHEN Ticket_Status <> 'Cancelled' THEN Seat_ID ELSE NULL END) STORED,

    CONSTRAINT pk_ticket PRIMARY KEY (Ticket_ID),
    CONSTRAINT fk_ticket_booking FOREIGN KEY (Booking_ID)
        REFERENCES Booking(Booking_ID) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_ticket_show FOREIGN KEY (Show_ID)
        REFERENCES `Show`(Show_ID) ON DELETE CASCADE ON UPDATE CASCADE,
    -- RESTRICT (not CASCADE): MySQL forbids CASCADE on a column used by a
    -- STORED generated column (Active_Seat_ID), error 3104/1215.
    CONSTRAINT fk_ticket_seat FOREIGN KEY (Seat_ID)
        REFERENCES Seat(Seat_ID) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_ticket_active_show_seat UNIQUE (Show_ID, Active_Seat_ID),
    CONSTRAINT ck_ticket_price CHECK (Price >= 0),
    CONSTRAINT ck_ticket_type CHECK (Ticket_Type IN ('Standard', 'Premium', 'VIP')),
    CONSTRAINT ck_ticket_status CHECK (Ticket_Status IN ('Valid', 'Used', 'Cancelled'))
) ENGINE=InnoDB;

CREATE TABLE Payment (
    Payment_ID INT AUTO_INCREMENT,
    Booking_ID INT NOT NULL,
    Payment_Date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Amount DECIMAL(10,2) NOT NULL,
    Payment_Method VARCHAR(15) NOT NULL,
    Payment_Status VARCHAR(15) NOT NULL DEFAULT 'Pending',
    CONSTRAINT pk_payment PRIMARY KEY (Payment_ID),
    CONSTRAINT uq_payment_booking UNIQUE (Booking_ID),
    CONSTRAINT fk_payment_booking FOREIGN KEY (Booking_ID)
        REFERENCES Booking(Booking_ID) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT ck_payment_amount CHECK (Amount >= 0),
    CONSTRAINT ck_payment_method CHECK (Payment_Method IN ('UPI', 'Card', 'NetBanking', 'Cash')),
    CONSTRAINT ck_payment_status CHECK (Payment_Status IN ('Pending', 'Success', 'Failed', 'Refunded'))
) ENGINE=InnoDB;

-- =========================================================
-- 2. SAMPLE DATA
-- =========================================================

INSERT INTO `User` (Name, Email, Contact, Password, User_Type) VALUES
('Admin One', 'admin@ticketbook.com', '9000000001', 'DEMO_HASH_ADMIN', 'Admin'),
('Ronak Jindal', 'ronak@example.com', '9000000002', 'DEMO_HASH_2', 'Normal'),
('Pratiksha', 'pratiksha@example.com', '9000000003', 'DEMO_HASH_3', 'Normal'),
('Samarth Jain', 'samarth@example.com', '9000000004', 'DEMO_HASH_4', 'Normal'),
('Arya', 'arya@example.com', '9000000005', 'DEMO_HASH_5', 'Normal');

INSERT INTO Event (Event_Name, Event_Type, Description) VALUES
('Avengers Reunion', 'Movie', 'Superhero blockbuster screening'),
('Rock Night Live', 'Concert', 'Live rock band concert'),
('IPL Final Screening', 'Sports', 'Live big-screen cricket final'),
('Stand-Up Saturday', 'Comedy', 'Evening of stand-up comedy');

INSERT INTO Venue (Venue_Name, Location, Capacity) VALUES
('PVR Cinemas', 'Pune - Koregaon Park', 6),
('Phoenix Arena', 'Pune - Viman Nagar', 6),
('Shivaji Auditorium', 'Pune - Kothrud', 4);

INSERT INTO `Show` (Event_ID, Venue_ID, Show_Date, Start_Time, End_Time) VALUES
(1, 1, '2026-11-10', '18:00:00', '21:00:00'),
(1, 1, '2026-11-11', '18:00:00', '21:00:00'),
(2, 2, '2026-11-15', '19:30:00', '22:30:00'),
(3, 1, '2026-11-20', '15:00:00', '19:00:00'),
(4, 3, '2026-11-25', '20:00:00', '22:00:00');

INSERT INTO Seat (Venue_ID, Seat_Number, Seat_Type) VALUES
(1,'A1','Regular'), (1,'A2','Regular'), (1,'A3','Regular'),
(1,'B1','Premium'), (1,'B2','Premium'), (1,'V1','VIP'),
(2,'A1','Regular'), (2,'A2','Regular'), (2,'A3','Regular'),
(2,'B1','Premium'), (2,'B2','Premium'), (2,'V1','VIP'),
(3,'A1','Regular'), (3,'A2','Regular'), (3,'B1','Premium'), (3,'V1','VIP');

-- =========================================================
-- 3. TRIGGERS
-- =========================================================
DELIMITER $$

CREATE TRIGGER trg_ticket_validate_seat_bi
BEFORE INSERT ON Ticket
FOR EACH ROW
BEGIN
    DECLARE v_show_venue INT;
    DECLARE v_seat_venue INT;

    SELECT Venue_ID INTO v_show_venue
    FROM `Show` WHERE Show_ID = NEW.Show_ID;

    SELECT Venue_ID INTO v_seat_venue
    FROM Seat WHERE Seat_ID = NEW.Seat_ID;

    IF v_show_venue <> v_seat_venue THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Seat does not belong to the venue of this show';
    END IF;
END$$

CREATE TRIGGER trg_ticket_validate_seat_bu
BEFORE UPDATE ON Ticket
FOR EACH ROW
BEGIN
    DECLARE v_show_venue INT;
    DECLARE v_seat_venue INT;

    SELECT Venue_ID INTO v_show_venue
    FROM `Show` WHERE Show_ID = NEW.Show_ID;

    SELECT Venue_ID INTO v_seat_venue
    FROM Seat WHERE Seat_ID = NEW.Seat_ID;

    IF v_show_venue <> v_seat_venue THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Seat does not belong to the venue of this show';
    END IF;
END$$

CREATE TRIGGER trg_ticket_total_ai
AFTER INSERT ON Ticket
FOR EACH ROW
BEGIN
    IF NEW.Ticket_Status <> 'Cancelled' THEN
        UPDATE Booking
        SET Total_Amount = Total_Amount + NEW.Price
        WHERE Booking_ID = NEW.Booking_ID;
    END IF;
END$$

CREATE TRIGGER trg_ticket_total_au
AFTER UPDATE ON Ticket
FOR EACH ROW
BEGIN
    -- Remove the old ticket value from its old booking if it was active.
    IF OLD.Ticket_Status <> 'Cancelled' THEN
        UPDATE Booking
        SET Total_Amount = Total_Amount - OLD.Price
        WHERE Booking_ID = OLD.Booking_ID;
    END IF;

    -- Add the new ticket value to its new booking if it is active.
    IF NEW.Ticket_Status <> 'Cancelled' THEN
        UPDATE Booking
        SET Total_Amount = Total_Amount + NEW.Price
        WHERE Booking_ID = NEW.Booking_ID;
    END IF;
END$$

CREATE TRIGGER trg_ticket_total_ad
AFTER DELETE ON Ticket
FOR EACH ROW
BEGIN
    IF OLD.Ticket_Status <> 'Cancelled' THEN
        UPDATE Booking
        SET Total_Amount = Total_Amount - OLD.Price
        WHERE Booking_ID = OLD.Booking_ID;
    END IF;
END$$

CREATE TRIGGER trg_payment_confirm_booking
AFTER UPDATE ON Payment
FOR EACH ROW
BEGIN
    IF NEW.Payment_Status = 'Success'
       AND OLD.Payment_Status <> 'Success'
       AND EXISTS (
           SELECT 1 FROM Booking
           WHERE Booking_ID = NEW.Booking_ID AND Status <> 'Cancelled'
       )
    THEN
        UPDATE Booking
        SET Status = 'Confirmed'
        WHERE Booking_ID = NEW.Booking_ID;
    END IF;
END$$

DELIMITER ;

-- =========================================================
-- 4. SAMPLE BOOKINGS / TICKETS / PAYMENTS
-- =========================================================

INSERT INTO Booking (User_ID, Booking_Date, Total_Amount, Status) VALUES
(2, '2026-10-01 10:15:00', 0, 'Pending'),
(3, '2026-10-02 14:30:00', 0, 'Pending'),
(4, '2026-10-03 09:00:00', 0, 'Pending');

INSERT INTO Ticket (Booking_ID, Show_ID, Seat_ID, Ticket_Type, Price, Ticket_Status) VALUES
(1, 1, 1, 'Standard', 250.00, 'Valid'),
(1, 1, 4, 'Premium', 450.00, 'Valid'),
(2, 3, 7, 'Standard', 500.00, 'Valid'),
(2, 3, 12, 'VIP', 1000.00, 'Valid'),
(3, 2, 2, 'Standard', 250.00, 'Valid');

INSERT INTO Payment (Booking_ID, Payment_Date, Amount, Payment_Method, Payment_Status) VALUES
(1, '2026-10-01 10:20:00', 700.00, 'UPI', 'Pending'),
(2, '2026-10-02 14:35:00', 1500.00, 'Card', 'Pending');

-- The payment trigger confirms bookings 1 and 2 after successful payment.
UPDATE Payment
SET Payment_Status = 'Success'
WHERE Booking_ID IN (1, 2);

-- =========================================================
-- 5. FUNCTIONS
-- =========================================================

DELIMITER $$

CREATE FUNCTION fn_available_seats(p_show_id INT)
RETURNS INT
READS SQL DATA
BEGIN
    DECLARE v_total INT DEFAULT 0;
    DECLARE v_booked INT DEFAULT 0;

    SELECT COUNT(*) INTO v_total
    FROM Seat st
    JOIN `Show` sh ON sh.Venue_ID = st.Venue_ID
    WHERE sh.Show_ID = p_show_id;

    SELECT COUNT(*) INTO v_booked
    FROM Ticket
    WHERE Show_ID = p_show_id
      AND Ticket_Status <> 'Cancelled';

    RETURN v_total - v_booked;
END$$

CREATE FUNCTION fn_booking_total(p_booking_id INT)
RETURNS DECIMAL(10,2)
READS SQL DATA
BEGIN
    DECLARE v_total DECIMAL(10,2) DEFAULT 0.00;

    SELECT COALESCE(SUM(Price), 0) INTO v_total
    FROM Ticket
    WHERE Booking_ID = p_booking_id
      AND Ticket_Status <> 'Cancelled';

    RETURN v_total;
END$$

-- =========================================================
-- 6. PROCEDURES WITH CURSORS
-- =========================================================

CREATE PROCEDURE sp_cancel_booking(
    IN p_booking_id INT,
    OUT p_refund DECIMAL(10,2)
)
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_ticket_id INT;
    DECLARE v_price DECIMAL(8,2);
    DECLARE v_booking_count INT DEFAULT 0;
    DECLARE v_booking_status VARCHAR(15);
    DECLARE v_payment_status VARCHAR(15) DEFAULT 'NotPaid';

    DECLARE cur_tickets CURSOR FOR
        SELECT Ticket_ID, Price
        FROM Ticket
        WHERE Booking_ID = p_booking_id
          AND Ticket_Status = 'Valid';

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    SELECT COUNT(*) INTO v_booking_count
    FROM Booking WHERE Booking_ID = p_booking_id;

    IF v_booking_count = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Booking ID does not exist';
    END IF;

    SELECT Status INTO v_booking_status
    FROM Booking WHERE Booking_ID = p_booking_id;

    IF v_booking_status = 'Cancelled' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Booking is already cancelled';
    END IF;

    SELECT COALESCE(
        (SELECT Payment_Status FROM Payment WHERE Booking_ID = p_booking_id),
        'NotPaid'
    ) INTO v_payment_status;

    SET p_refund = 0.00;

    OPEN cur_tickets;

    cancel_loop: LOOP
        FETCH cur_tickets INTO v_ticket_id, v_price;
        IF done = 1 THEN
            LEAVE cancel_loop;
        END IF;

        IF v_payment_status = 'Success' THEN
            SET p_refund = p_refund + v_price;
        END IF;

        UPDATE Ticket
        SET Ticket_Status = 'Cancelled'
        WHERE Ticket_ID = v_ticket_id;
    END LOOP;

    CLOSE cur_tickets;

    UPDATE Booking
    SET Status = 'Cancelled',
        Total_Amount = 0.00
    WHERE Booking_ID = p_booking_id;

    IF v_payment_status = 'Success' THEN
        UPDATE Payment
        SET Payment_Status = 'Refunded'
        WHERE Booking_ID = p_booking_id;
    END IF;
END$$

CREATE PROCEDURE sp_event_revenue_report(IN p_event_id INT)
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE v_show_id INT;
    DECLARE v_show_date DATE;
    DECLARE v_tickets_sold INT DEFAULT 0;
    DECLARE v_revenue DECIMAL(10,2) DEFAULT 0.00;

    DECLARE cur_shows CURSOR FOR
        SELECT Show_ID, Show_Date
        FROM `Show`
        WHERE Event_ID = p_event_id
        ORDER BY Show_Date;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    DROP TEMPORARY TABLE IF EXISTS tmp_event_report;
    CREATE TEMPORARY TABLE tmp_event_report (
        Show_ID INT,
        Show_Date DATE,
        Tickets_Sold INT,
        Revenue DECIMAL(10,2),
        Seats_Left INT
    );

    OPEN cur_shows;

    report_loop: LOOP
        FETCH cur_shows INTO v_show_id, v_show_date;
        IF done = 1 THEN
            LEAVE report_loop;
        END IF;

        SELECT COUNT(*), COALESCE(SUM(Price), 0)
        INTO v_tickets_sold, v_revenue
        FROM Ticket
        WHERE Show_ID = v_show_id
          AND Ticket_Status <> 'Cancelled';

        INSERT INTO tmp_event_report
        VALUES (
            v_show_id,
            v_show_date,
            v_tickets_sold,
            v_revenue,
            fn_available_seats(v_show_id)
        );
    END LOOP;

    CLOSE cur_shows;

    SELECT * FROM tmp_event_report ORDER BY Show_Date;
    DROP TEMPORARY TABLE IF EXISTS tmp_event_report;
END$$

DELIMITER ;

-- =========================================================
-- 7. EXAMPLE QUERIES FOR THE DEMO (READ-ONLY)
-- Run each query independently to show its result.
-- =========================================================

-- 1. Display upcoming shows with event and venue details.
SELECT sh.Show_ID, e.Event_Name, e.Event_Type, v.Venue_Name, v.Location,
       sh.Show_Date, sh.Start_Time, sh.End_Time
FROM `Show` sh
JOIN Event e ON e.Event_ID = sh.Event_ID
JOIN Venue v ON v.Venue_ID = sh.Venue_ID
WHERE sh.Show_Date >= CURDATE()
ORDER BY sh.Show_Date, sh.Start_Time;

-- 2. Search for concerts whose event name contains "rock".
SELECT Event_ID, Event_Name, Event_Type, Description
FROM Event
WHERE Event_Name LIKE '%rock%' AND Event_Type = 'Concert';

-- 3. Display available seats for show 1.
SELECT st.Seat_ID, st.Seat_Number, st.Seat_Type
FROM Seat st
JOIN `Show` sh ON sh.Venue_ID = st.Venue_ID
WHERE sh.Show_ID = 1
  AND NOT EXISTS (
      SELECT 1 FROM Ticket t
      WHERE t.Show_ID = sh.Show_ID
        AND t.Seat_ID = st.Seat_ID
        AND t.Ticket_Status <> 'Cancelled'
  )
ORDER BY st.Seat_Number;

-- 4. Display all bookings and payment status for user 2.
SELECT b.Booking_ID, e.Event_Name, sh.Show_Date, v.Venue_Name,
       st.Seat_Number, t.Ticket_Type, t.Price,
       b.Status AS Booking_Status,
       COALESCE(p.Payment_Status, 'Not Paid') AS Payment_Status
FROM Booking b
JOIN Ticket t ON t.Booking_ID = b.Booking_ID
JOIN `Show` sh ON sh.Show_ID = t.Show_ID
JOIN Event e ON e.Event_ID = sh.Event_ID
JOIN Venue v ON v.Venue_ID = sh.Venue_ID
JOIN Seat st ON st.Seat_ID = t.Seat_ID
LEFT JOIN Payment p ON p.Booking_ID = b.Booking_ID
WHERE b.User_ID = 2
ORDER BY b.Booking_Date DESC;

-- 5. Show ticket revenue by event, counting only successful payments.
SELECT e.Event_Name, SUM(t.Price) AS Revenue
FROM Ticket t
JOIN Booking b ON b.Booking_ID = t.Booking_ID
JOIN Payment p ON p.Booking_ID = b.Booking_ID
    AND p.Payment_Status = 'Success'
JOIN `Show` sh ON sh.Show_ID = t.Show_ID
JOIN Event e ON e.Event_ID = sh.Event_ID
WHERE t.Ticket_Status <> 'Cancelled'
GROUP BY e.Event_ID, e.Event_Name
ORDER BY Revenue DESC;

-- 6. Count tickets sold for each show.
SELECT sh.Show_ID, e.Event_Name, sh.Show_Date,
       COUNT(t.Ticket_ID) AS Tickets_Sold
FROM `Show` sh
JOIN Event e ON e.Event_ID = sh.Event_ID
LEFT JOIN Ticket t ON t.Show_ID = sh.Show_ID
    AND t.Ticket_Status <> 'Cancelled'
GROUP BY sh.Show_ID, e.Event_Name, sh.Show_Date
ORDER BY Tickets_Sold DESC;

-- 7. Display users who have not made any bookings.
SELECT u.User_ID, u.Name
FROM `User` u
WHERE NOT EXISTS (
    SELECT 1 FROM Booking b WHERE b.User_ID = u.User_ID
);

-- 8. Call function: available seats for show 1.
SELECT fn_available_seats(1) AS Seats_Left_Show_1;

-- 9. Call function: current active ticket total for booking 1.
SELECT fn_booking_total(1) AS Booking_1_Total;

-- 10. Call procedure: event revenue report for event 1.
CALL sp_event_revenue_report(1);

-- =========================================================
-- 8. OPTIONAL MUTATING DEMO COMMANDS (RUN ONE AT A TIME)
-- These are intentionally commented out so a fresh setup stays intact.
-- =========================================================

-- Add a new normal user:
-- INSERT INTO `User` (Name, Email, Contact, Password, User_Type)
-- VALUES ('Neha Sharma', 'neha@example.com', '9000000006', 'DEMO_HASH_NEHA', 'Normal');

-- Create a booking for user 6 (only after the user above has been inserted):
-- INSERT INTO Booking (User_ID, Status) VALUES (6, 'Pending');

-- Add a ticket to the new booking (replace booking/show/seat IDs as needed):
-- INSERT INTO Ticket (Booking_ID, Show_ID, Seat_ID, Ticket_Type, Price)
-- VALUES (4, 4, 3, 'Standard', 300.00);

-- Create a payment matching the booking's current total:
-- INSERT INTO Payment (Booking_ID, Amount, Payment_Method, Payment_Status)
-- VALUES (4, 300.00, 'UPI', 'Pending');

-- Mark payment successful; trigger confirms the booking:
-- UPDATE Payment SET Payment_Status = 'Success' WHERE Booking_ID = 4;

-- Cancel booking 2 and view the refund amount (only if payment succeeded):
-- CALL sp_cancel_booking(2, @refund_amount);
-- SELECT @refund_amount AS Refund_Amount;

-- Update a show time:
-- UPDATE `Show`
-- SET Start_Time = '19:00:00', End_Time = '22:00:00'
-- WHERE Show_ID = 2;

-- Delete an event (cascades to its shows and related tickets):
-- DELETE FROM Event WHERE Event_ID = 4;

-- =========================================================
-- END OF SCRIPT
-- =========================================================