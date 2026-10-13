import React, { createContext, useState, useEffect } from 'react';
import api from '../api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            fetchUser();
        } else {
            setLoading(false);
        }
    }, []);

    const fetchUser = async () => {
        try {
            const res = await api.get('/auth/me');
            if (res.data.success && res.data.user) {
                const u = res.data.user;
                const normalized = {
                    ...u,
                    first_name: u.first_name || u.firstName || '',
                    last_name: u.last_name || u.lastName || '',
                    firstName: u.firstName || u.first_name || '',
                    lastName: u.lastName || u.last_name || '',
                };
                setUser(normalized);
                localStorage.setItem('role', normalized.role);
            } else {
                localStorage.removeItem('token');
                delete api.defaults.headers.common['Authorization'];
            }
        } catch (error) {
            console.error('Fetch user error:', error);
            localStorage.removeItem('token');
            delete api.defaults.headers.common['Authorization'];
        } finally {
            setLoading(false);
        }
    };

    /** Login with email (preferred) or legacy username */
    const login = async (emailOrUsername, password) => {
        try {
            const payload = emailOrUsername.includes('@')
                ? { email: emailOrUsername, password }
                : { email: emailOrUsername, username: emailOrUsername, password };
            const res = await api.post('/auth/login', payload);
            if (res.data.success) {
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('role', res.data.user.role);
                localStorage.setItem('user', JSON.stringify(res.data.user));
                api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
                const u = res.data.user;
                const normalized = {
                    ...u,
                    first_name: u.first_name || u.firstName || '',
                    last_name: u.last_name || u.lastName || '',
                    firstName: u.firstName || u.first_name || '',
                    lastName: u.lastName || u.last_name || '',
                };
                setUser(normalized);
                return { ...res.data, user: normalized };
            }
            throw new Error(res.data.message || 'Login failed');
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    };

    const setAuthFromToken = async (token, userData) => {
        localStorage.setItem('token', token);
        if (userData) {
            localStorage.setItem('role', userData.role);
            localStorage.setItem('user', JSON.stringify(userData));
            setUser(userData);
        }
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        if (!userData) await fetchUser();
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('user');
        delete api.defaults.headers.common['Authorization'];
        setUser(null);
    };

    const register = async (userData) => {
        const res = await api.post('/auth/register', userData);
        return res.data;
    };

    const updateUser = (userData) => setUser(userData);

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                login,
                logout,
                register,
                updateUser,
                setAuthFromToken,
                isAuthenticated: !!user,
                isAdmin: user?.role === 'admin',
                isManager: user?.role === 'manager',
                isReceptionist: user?.role === 'receptionist',
                isCustomer: user?.role === 'customer',
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
