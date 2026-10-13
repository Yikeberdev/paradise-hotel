# 🏨 Paradise Hotel Reservation & Management System

[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/Yikeberdev/paradise-hotel)
[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen?logo=vercel)](https://web-production-6ef0b.up.railway.app)
[![Backend API](https://img.shields.io/badge/API-Online%20on%20Railway-success?logo=railway)](https://web-production-6ef0b.up.railway.app/api/health)

---

### 🌐 Live Links
- **🔗 GitHub Repository:** [https://github.com/Yikeberdev/paradise-hotel](https://github.com/Yikeberdev/paradise-hotel)
- **🚀 Live Demo Website:** [https://web-production-6ef0b.up.railway.app](https://web-production-6ef0b.up.railway.app)
- **⚡ Backend API Endpoint:** [https://web-production-6ef0b.up.railway.app/api](https://web-production-6ef0b.up.railway.app/api)

---

## 📖 Overview
**Paradise Hotel** is a full-featured, modern hotel management and reservation web application built for seamless room bookings, restaurant food orders, desk reservations, and integrated payment processing with **CBE Birr** and **Telebirr**.

---

### ✨ Features
- **Role-Based Authentication & Portals:**
  - **Admin:** Full system control, employee management, security alerts, user permissions.
  - **Manager:** Financial oversight, operations reports, review approvals, discounts.
  - **Receptionist:** Check-in / check-out workflows, ID verification, reservation and food order approvals.
  - **Customer:** Room booking, desk reservation, food ordering, online payment confirmation, profile.
- **Room Booking:** Availability check, required guest address details, and ID card image upload with automated OCR verification.
- **Desk Reservation:** Start/end times with auto-release upon completion; free with food orders, or billed by duration.
- **Food Ordering:** Categorized menu with delivery or pickup options, tied to rooms/desks.
- **Local Ethiopian Payments:** Integrated **CBE Birr** and **Telebirr** workflows with receipt upload and balance queries.
- **Automated Operations:** Auto-release of rooms at checkout date and time, auto-initialization of cloud database tables.
- **Real-Time Notifications:** Notification bell for order updates, reservation status, and payment approvals.

---

### 🛠️ Technology Stack
- **Frontend:** React.js, React Router, Axios, CSS3
- **Backend:** Node.js, Express.js, MySQL2, Multer, JWT, Bcryptjs, Nodemailer
- **Database:** MySQL (Cloud-hosted on Railway)
- **Hosting:** Railway (Backend + Database) & Vercel (Frontend)

---

### 🔑 Demo Login Credentials

| Role | Username | Password | Email |
|---|---|---|---|
| **Admin** | `admin` | `admin123` | `admin@paradisehotel.com` |
| **Manager** | `manager` | `manager123` | `manager@paradisehotel.com` |
| **Receptionist** | `receptionist` | `reception123` | `receptionist@paradisehotel.com` |
| **Customer 1** | `customer1` | `customer123` | `john@email.com` |
| **Customer 2** | `customer2` | `customer123` | `jane@email.com` |

---

### 🚀 Local Development Setup

#### 1. Clone the repository
```bash
git clone https://github.com/Yikeberdev/paradise-hotel.git
cd paradise-hotel
```

#### 2. Install Dependencies
```bash
npm install
npm run install:all
```

#### 3. Configure Environment Variables
Copy `.env.example` to `.env` in the `backend/` and `frontend/` folders:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

#### 4. Run Locally
```bash
# Start both backend and frontend concurrently
npm run dev
```
- Frontend will run on `http://localhost:3000`
- Backend API will run on `http://localhost:5000`

---

### 📄 License
This project is open source and available under the [MIT License](LICENSE).
