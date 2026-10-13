import React, { useContext, useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import NotificationBell from '../NotificationBell';

const Header = () => {
    const { user, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const handleLogout = () => {
        logout();
        setDropdownOpen(false);
        navigate('/login');
    };

    const getDashboardLink = () => {
        if (!user) return '/';
        switch (user.role) {
            case 'admin': return '/dashboard/admin';
            case 'manager': return '/dashboard/manager';
            case 'receptionist': return '/dashboard/receptionist';
            default: return '/dashboard/customer';
        }
    };

    const getInitials = () => {
        if (!user) return '?';
        const first = user.first_name || user.firstName || '';
        const last = user.last_name || user.lastName || '';
        return (first[0] || '') + (last[0] || first[1] || '');
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <header className="site-header">
            {/* Left: Logo */}
            <Link to="/" className="header-logo">
                <span className="header-logo-icon">🏨</span>
                <span className="header-logo-text">Paradise Hotel derbre markos, amhara, ethiopia</span>
            </Link>

            {/* Right: Actions */}
            <div className="header-actions">
                {user ? (

                    <>
                        <Link to="/Home" style={{ color: '#fff', marginRight: 8, textDecoration: 'none', fontWeight: 600 }}>
                            Home
                        </Link>
                        <Link to="/about" style={{ color: '#fff', marginRight: 10, textDecoration: 'none', fontWeight: 600 }}>About</Link>
                        <Link to="/contact" style={{ color: '#fff', marginRight: 12, textDecoration: 'none', fontWeight: 600 }}>Contact</Link>
                        <NotificationBell />
                        {/* User Profile Dropdown */}
                        <div
                            className={`header-user ${dropdownOpen ? 'open' : ''}`}
                            ref={dropdownRef}
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                        >
                            <div className="header-avatar">
                                {user.profile_image ? (
                                    <img
                                        src={user.profile_image.startsWith('http') ? user.profile_image : `http://localhost:5000${user.profile_image}`}
                                        alt="Profile"
                                    />
                                ) : (
                                    <span>{getInitials().toUpperCase() || '?'}</span>
                                )}
                            </div>
                            <div className="header-welcome hide-mobile">
                                Welcome, <span>{
                                    (user.first_name || user.firstName || '').trim()
                                    || (user.fullName || user.full_name || '').trim().split(/\s+/)[0]
                                    || [user.firstName, user.lastName].filter(Boolean).join(' ').split(/\s+/)[0]
                                    || (user.username && !String(user.username).includes('@') ? user.username : '')
                                    || (user.email ? String(user.email).split('@')[0] : '')
                                    || 'Guest'
                                }</span>
                            </div>
                            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>▾</span>

                            <div className="header-dropdown">
                                <Link to="/profile" onClick={() => setDropdownOpen(false)}>
                                    <span>👤</span> Update Profile
                                </Link>
                                <Link to={getDashboardLink()} onClick={() => setDropdownOpen(false)}>
                                    <span>📊</span> Dashboard
                                </Link>
                                <hr />
                                <button onClick={handleLogout}>
                                    <span>🚪</span> Logout
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <Link to="/Home" className="header-nav-link" style={{ color: '#fff', marginRight: 8, textDecoration: 'none', fontWeight: 600 }}>
                            Home
                        </Link>
                        <Link to="/about" className="header-nav-link" style={{ color: '#fff', marginRight: 8, textDecoration: 'none', fontWeight: 600 }}>
                            About
                        </Link>
                        <Link to="/contact" className="header-nav-link" style={{ color: '#fff', marginRight: 12, textDecoration: 'none', fontWeight: 600 }}>
                            Contact
                        </Link>
                        <Link to="/login">
                            <button className="header-btn header-btn-outline">Sign In</button>
                        </Link>

                    </>
                )}
            </div>
        </header>
    );
};

export default Header;