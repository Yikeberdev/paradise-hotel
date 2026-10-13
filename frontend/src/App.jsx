import React, { useState, useContext, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, AuthContext } from './context/AuthContext';
import Header from './components/Layout/Header';
import Footer from './components/Layout/Footer';
import Sidebar from './components/Layout/Sidebar';
import Home from './components/Pages/Home';
import Login from './components/Pages/Login';
import Register from './components/Pages/Register';
import Rooms from './components/Pages/Rooms';
import ReserveRoom from './components/Pages/ReserveRoom';
import ReserveDesk from './components/Pages/ReserveDesk';
import OrderFood from './components/Pages/OrderFood';
import Feedback from './components/Pages/Feedback';
import ReportProblem from './components/Pages/ReportProblem';
import Payment from './components/Pages/Payment';
import PaymentConfirmation from './components/Pages/PaymentConfirmation';
import MyAccounts from './components/Pages/MyAccounts';
import About from './components/Pages/About';
import Contact from './components/Pages/Contact';
import Discounts from './components/Pages/Discounts';
import Profile from './components/Pages/Profile';
import AdminDashboard from './components/Dashboard/AdminDashboard';
import ManagerDashboard from './components/Dashboard/ManagerDashboard';
import ReceptionistDashboard from './components/Dashboard/ReceptionistDashboard';
import CustomerDashboard from './components/Dashboard/CustomerDashboard';
import './styles.css';

/** Redirect staff to their dashboard after login; guests/customers stay on customer experience */
function RoleHomeRedirect() {
    const { user, loading } = useContext(AuthContext);
    if (loading) return null;
    if (!user || user.role === 'customer') {
        return <Navigate to="/dashboard/customer" replace />;
    }
    if (user.role === 'admin') return <Navigate to="/dashboard/admin" replace />;
    if (user.role === 'manager') return <Navigate to="/dashboard/manager" replace />;
    if (user.role === 'receptionist') return <Navigate to="/dashboard/receptionist" replace />;
    return <Navigate to="/dashboard/customer" replace />;
}

function AppLayout() {
    const { user, loading } = useContext(AuthContext);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const location = useLocation();

    // Always show sidebar (customer dashboard experience on app start)
    const hasSidebar = true;

    useEffect(() => {
        // Open sidebar by default on desktop
        if (window.innerWidth > 768) setSidebarOpen(true);
    }, []);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-main, #f5f5f7)' }}>
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="app">
            <Header sidebarOpen={sidebarOpen} onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />

            <div className="layout-with-sidebar">
                {hasSidebar && (
                    <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
                )}
                <main className={`layout-content ${!hasSidebar ? 'no-sidebar' : ''}`}>
                    <Routes>
                        {/* App starts on customer dashboard */}
                        <Route path="/" element={<RoleHomeRedirect />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route path="/rooms" element={<Rooms />} />
                        <Route path="/reserve-room" element={<ReserveRoom />} />
                        <Route path="/reserve-desk" element={<ReserveDesk />} />
                        <Route path="/order-food" element={<OrderFood />} />
                        <Route path="/feedback" element={<Feedback />} />
                        <Route path="/report-problem" element={<ReportProblem />} />
                        <Route path="/payment" element={<Payment />} />
                        <Route path="/payment-confirmation" element={<PaymentConfirmation />} />
                        <Route path="/my-accounts" element={<MyAccounts />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/home" element={<Home />} />
                        <Route path="/about" element={<About />} />
                        <Route path="/contact" element={<Contact />} />
                        <Route path="/discounts" element={<Discounts />} />
                        <Route path="/dashboard/admin" element={<AdminDashboard />} />
                        <Route path="/dashboard/manager" element={<ManagerDashboard />} />
                        <Route path="/dashboard/receptionist" element={<ReceptionistDashboard />} />
                        <Route path="/dashboard/customer" element={<CustomerDashboard />} />
                        <Route path="*" element={<Navigate to="/dashboard/customer" replace />} />
                    </Routes>
                </main>
            </div>

            <Footer />
            <Toaster
                position="top-right"
                toastOptions={{
                    style: {
                        borderRadius: '10px',
                        background: '#1a1a2e',
                        color: '#fff',
                        fontSize: '14px',
                    },
                    success: { iconTheme: { primary: '#f0a500', secondary: '#1a1a2e' } },
                }}
            />
        </div>
    );
}

function App() {
    return (
        <AuthProvider>
            <Router>
                <AppLayout />
            </Router>
        </AuthProvider>
    );
}

export default App;
