<<<<<<< HEAD
# paradise-hotel
=======
# Paradise Hotel Reservation System

## Complete Hotel Management System — CBE Birr + Telebirr Payment

### Features
- Role-based login (Admin, Manager, Receptionist, Customer)
- Room booking with availability check, required guest address (country/region/zone/wereda/kebele) and ID card image upload
- Desk reservation with start/end time; desks auto-become available again after the reservation's end time passes
  - Ordering food makes the desk reservation **free**
  - Reserving a desk without food is priced by duration (hourly rate × hours) — the longer you stay, the more it costs
- Food ordering, grouped by category, linked to a specific room/desk reservation
- CBE Birr **and** Telebirr payment options
- Receptionist approval workflow for reservations, desks, food orders and payments
- Real-time notifications between customers and receptionists (submitted / approved / rejected)
- Manager "Operations Report" — a full table view (rooms, desks, food, payments) of everything the reception team has processed
- Category browsing with Next/Previous pagination on Rooms, Desks and Food pages
- Ethiopian Birr (ETB) pricing
- MySQL database

### Technology Stack
- Backend: Node.js, Express.js, MySQL2, Multer (file uploads), JWT, bcryptjs
- Database: MySQL / MariaDB
- Frontend: React.js, Axios, React Router
- Payment: CBE Birr, Telebirr

---

### Installation

#### 1. Start MySQL / MariaDB
Any MySQL-compatible server works (XAMPP, native MySQL, MariaDB, etc). Make sure it's running before continuing.

#### 2. Create the database
```bash
mysql -u root -p < database/paradise_hotel.sql
```
This creates the `paradise_hotel` database, all tables, and 5 ready-to-use demo accounts (see credentials below). Alternatively, after configuring `.env` (step 3), you can run:
```bash
node seed.js
```
from the project root to (re)seed everything from a Node script instead of raw SQL — useful if you want to reset all data at once. Both paths install the **same, verified** password hashes, so login works out of the box either way.

#### 3. Configure and install the backend
```bash
cd backend
npm install
```
Edit `backend/.env` to match your database credentials:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=paradise_hotel
JWT_SECRET=change_me

CBE_ACCOUNT_NUMBER=1000532238122
CBE_ACCOUNT_NAME=Paradise Hotel
CBE_BANK_NAME=Commercial Bank of Ethiopia

TELEBIRR_NUMBER=0920439009
TELEBIRR_NAME=Paradise Hotel
```
Then start the backend:
```bash
npm start
```
The API runs on `http://localhost:5000` by default. Uploaded ID card images are served from `http://localhost:5000/uploads/...` and stored in `backend/uploads/id_cards/`.

#### 4. Install and run the frontend
```bash
cd frontend
npm install
npm start
```
The app runs on `http://localhost:3000`. `frontend/.env` should point `REACT_APP_API_URL` at your backend (defaults to `http://localhost:5000/api`).

---

### Demo login credentials
| Role         | Username       | Password       |
|--------------|----------------|----------------|
| Admin        | admin          | admin123       |
| Manager      | manager        | manager123     |
| Receptionist | receptionist   | reception123   |
| Customer     | customer1      | customer123    |
| Customer     | customer2      | customer123    |

---

### What was fixed in this update

This project had several concrete bugs that blocked registration, login, and other core flows. They have all been fixed and verified against a live database:

1. **Login/registration completely broken for demo accounts.** The seeded password hash in `paradise_hotel.sql` didn't match *any* password (verified against two independent bcrypt implementations). All demo accounts now use freshly generated, verified bcrypt hashes.
2. **Registration always crashed with a 500 error.** `auth.js` tried to insert `email`, `first_name`, `last_name`, and `phone` into the `users` table, but that table never had those columns — only `customers` did. The schema now includes them on `users` (which every route already relied on via `req.user.email`, `req.user.first_name`, etc.), so registration, login, and everywhere the logged-in user's name/email/phone is used now works correctly.
3. **Duplicate-email check queried the wrong table** (`users` instead of `customers`), which would have also thrown a SQL error.
4. **Reservation cancellation crashed** — a local variable named `res` shadowed the Express response object, so `res.json(...)` failed with "res.json is not a function". Renamed.
5. **Admin reservation report joined the wrong table**, producing blank guest names.
6. **The notification bell component existed but was never rendered anywhere in the app**, and no code ever created a notification. Both are now wired up: the bell is in the header, and payment/reservation/desk/food-order submissions and approvals now generate real notifications between customers and receptionists.
7. **Revenue on the manager dashboard was hardcoded to 0.** It's now computed from approved payments.

### New features added
- Address (country/region/zone/wereda/kebele) + ID card image upload required to reserve a room.
- Desk reservations now have a start time and end time; desks automatically become available again once the reservation's end time passes.
- Ordering food makes a desk reservation free; without a food order, the desk is billed by duration and the price increases the longer it's held.
- Telebirr (0920439009) added alongside CBE Birr (1000532238122), both under the account name "Paradise Hotel".
- Payment approval workflow now notifies the customer, and payment submission now notifies reception staff.
- A `/api/reports` endpoint and a new "Operations Report" table on the Manager dashboard, giving the manager a full, tabbed table view (rooms / desks / food / payments) of everything reception has processed.
- Category tabs with Next/Previous pagination when browsing Rooms, Desks, and Food.
