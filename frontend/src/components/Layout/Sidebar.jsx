import React, { useContext, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';

const getNavItems = (role, hasDiscount) => {
    const common = [
    ];

    const discountItem = hasDiscount
        ? [{ icon: '🏷️', label: 'Discounts', path: '/discounts' }]
        : [];

    const customer = [
        ...common,
        { icon: '🛏️', label: 'Reserve Rooms', path: '/rooms' },
        { icon: '🍽️', label: 'Reserve Desk', path: '/reserve-desk' },
        { icon: '🍕', label: 'Order Food', path: '/order-food' },
        ...discountItem,
        { icon: '📊', label: 'My Bookings', path: '/dashboard/customer' },
        { icon: '💬', label: 'Feedback', path: '/feedback' },
        { icon: '⚠️', label: 'Give sugession', path: '/report-problem' },
    ];

    const customerLoggedIn = [
        ...common,
        { icon: '🛏️', label: 'Reserve Rooms', path: '/rooms' },
        { icon: '🍽️', label: 'Reserve Desk', path: '/reserve-desk' },
        { icon: '🍕', label: 'Order Food', path: '/order-food' },
        ...discountItem,
        { icon: '📊', label: 'My Bookings', path: '/dashboard/customer' },
        { icon: '🏦', label: 'My Accounts', path: '/my-accounts' },
        { icon: '💬', label: 'Feedback', path: '/feedback' },
        { icon: '⚠️', label: 'Give sugussion', path: '/report-problem' },
    ];

    const admin = [
        { icon: '👥', label: 'Users', path: '/dashboard/admin', query: 'users' },
        { icon: '💬', label: 'Feedback', path: '/dashboard/admin', query: 'feedback' },
    ];

    const manager = [
        { icon: '🏠', label: 'Home', path: '/dashboard/customer' },
        { icon: '👥', label: 'Employees', path: '/dashboard/manager', query: 'employees' },
        { icon: '🛏️', label: 'Rooms', path: '/dashboard/manager', query: 'rooms' },
        { icon: '🍽️', label: 'Desks', path: '/dashboard/manager', query: 'desks' },
        { icon: '🍕', label: 'Food Menu', path: '/dashboard/manager', query: 'foods' },
        { icon: '👤', label: 'User Management', path: '/dashboard/manager', query: 'users' },
        { icon: '🏷️', label: 'Discounts', path: '/dashboard/manager', query: 'discounts' },
        { icon: '💰', label: 'Cancellation Penalty', path: '/dashboard/manager', query: 'penalties' },
        { icon: '📋', label: 'Reports', path: '/dashboard/manager', query: 'reports' },
        { icon: '⚠️', label: 'Customer suggestions', path: '/dashboard/manager', query: 'customer-reports' },
        { icon: '📄', label: 'About & Contact', path: '/dashboard/manager', query: 'pages' },
    ];

    const receptionist = [
        { icon: '🏠', label: 'Home', path: '/dashboard/receptionist' },
        { icon: '💳', label: 'Payments', path: '/dashboard/receptionist', query: 'payments' },
        { icon: '🛏️', label: 'Rooms', path: '/dashboard/receptionist', query: 'rooms' },
        { icon: '🍽️', label: 'Desks', path: '/dashboard/receptionist', query: 'desks' },
        { icon: '🍕', label: 'Food Orders', path: '/dashboard/receptionist', query: 'food' },
        { icon: '👥', label: 'Customers', path: '/dashboard/receptionist', query: 'customers' },
        { icon: '🔍', label: 'Search', path: '/dashboard/receptionist', query: 'search' },
    ];

    if (!role) return customer;
    switch (role) {
        case 'admin': return admin;
        case 'manager': return manager;
        case 'receptionist': return receptionist;
        case 'customer': return customerLoggedIn;
        default: return customer;
    }
};

const Sidebar = ({ isOpen, onClose }) => {
    const { user } = useContext(AuthContext);
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [hasDiscount, setHasDiscount] = useState(false);


    const role = user?.role || null;
    const isCustomerView = !role || role === 'customer';

    useEffect(() => {
        if (!isCustomerView) return undefined;
        let cancelled = false;
        const load = () => {
            api.get('/food/discounts/active')
                .then((res) => {
                    if (cancelled) return;
                    setHasDiscount(!!(res.data?.hasDiscount || (res.data?.discounts || []).length));
                })
                .catch(() => {
                    if (!cancelled) setHasDiscount(false);
                });
        };
        load();
        const t = setInterval(load, 60000);
        return () => {
            cancelled = true;
            clearInterval(t);
        };
    }, [isCustomerView]);



    const navItems = getNavItems(role, hasDiscount);
    const currentTab = searchParams.get('tab') || '';

    const displayName = user
        ? (user.firstName || user.first_name || user.fullName || user.username || 'User')
        : 'Guest';
    const displayRole = user ? user.role : 'guest';

    return (
        <>
            <div
                className={`sidebar-overlay ${isOpen ? '' : 'hidden'}`}
                onClick={onClose}
            />

            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <div className="header-avatar" style={{ width: 44, height: 44, fontSize: 18 }}>
                        {user?.profile_image
                            ? <img src={user.profile_image.startsWith('http') ? user.profile_image : `http://localhost:5000${user.profile_image}`} alt="avatar" />
                            : displayName[0].toUpperCase()
                        }
                    </div>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
                            {displayName}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, textTransform: 'capitalize' }}>
                            {displayRole}
                        </div>
                    </div>
                </div>

                <nav className="sidebar-nav" style={{ padding: '12px 0' }}>
                    {navItems.map((item) => {
                        const to = item.query ? `${item.path}?tab=${item.query}` : item.path;
                        const active =
                            location.pathname === item.path &&
                            (!item.query || currentTab === item.query || (!currentTab && !item.query));
                        const isDiscount = item.path === '/discounts';
                        return (
                            <Link
                                key={to + item.label}
                                to={to}
                                onClick={onClose}
                                className={`sidebar-link ${active ? 'active' : ''}`}
                                style={isDiscount ? { color: '#f0a500', fontWeight: 700 } : undefined}
                            >
                                <span className="sidebar-icon">{item.icon}</span>
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </aside>
        </>
    );
};

export default Sidebar;
