import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';

const NotificationBell = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (user) {
            fetchNotifications();
            // Poll every 30 seconds
            const interval = setInterval(fetchNotifications, 30000);
            return () => clearInterval(interval);
        }
    }, [user]);

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/notifications');
            setNotifications(res.data.notifications || []);
            setUnreadCount(res.data.unreadCount || 0);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    };

    const markAsRead = async (id) => {
        try {
            await api.put(`/notifications/${id}/read`);
            setNotifications(notifications.map(n => 
                n.id === id ? { ...n, is_read: 1 } : n
            ));
            setUnreadCount(Math.max(0, unreadCount - 1));
        } catch (error) {
            toast.error('Error marking notification as read');
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.put('/notifications/read-all');
            setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
            setUnreadCount(0);
            toast.success('All notifications marked as read');
        } catch (error) {
            toast.error('Error marking all as read');
        }
    };

    const handleNotificationClick = (notification) => {
        if (!notification.is_read) {
            markAsRead(notification.id);
        }
        setIsOpen(false);
        if (notification.link) {
            navigate(notification.link);
        }
    };

    const getIcon = (type) => {
        switch(type) {
            case 'reservation': return '🛏️';
            case 'payment': return '💰';
            case 'food_order': return '🍕';
            case 'desk_reservation': return '🍽️';
            case 'comment': return '💬';
            default: return '📢';
        }
    };

    if (!user) return null;

    return (
        <div className="notification-wrapper">
            <button 
                className="notification-bell"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Notifications"
            >
                🔔
                {unreadCount > 0 && (
                    <span className="notification-badge">{unreadCount}</span>
                )}
            </button>

            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-header">
                        <span>Notifications</span>
                        {unreadCount > 0 && (
                            <button 
                                className="btn btn-sm btn-secondary" 
                                onClick={markAllAsRead}
                            >
                                Mark all as read
                            </button>
                        )}
                        <button 
                            className="btn btn-sm btn-secondary" 
                            onClick={() => setIsOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                    <div className="notification-list">
                        {loading ? (
                            <div className="notification-loading">Loading...</div>
                        ) : notifications.length > 0 ? (
                            notifications.slice(0, 20).map(n => (
                                <div 
                                    key={n.id} 
                                    className={`notification-item ${!n.is_read ? 'unread' : ''}`}
                                    onClick={() => handleNotificationClick(n)}
                                >
                                    <div className="notification-icon">
                                        {getIcon(n.type)}
                                    </div>
                                    <div className="notification-content">
                                        <div className="notification-title">{n.title}</div>
                                        <div className="notification-message">{n.message}</div>
                                        <div className="notification-time">
                                            {new Date(n.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                    {!n.is_read && <div className="notification-dot"></div>}
                                </div>
                            ))
                        ) : (
                            <div className="notification-empty">No notifications</div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                .notification-wrapper {
                    position: relative;
                    display: inline-block;
                }

                .notification-bell {
                    position: relative;
                    background: none;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                    padding: 8px 12px;
                    border-radius: 4px;
                    transition: background 0.3s;
                    color: #fff;
                }

                .notification-bell:hover {
                    background: rgba(255,255,255,0.1);
                }

                .notification-badge {
                    position: absolute;
                    top: 0;
                    right: 0;
                    background: #e74c3c;
                    color: #fff;
                    border-radius: 50%;
                    padding: 2px 6px;
                    font-size: 10px;
                    font-weight: 700;
                    min-width: 18px;
                    text-align: center;
                }

                .notification-dropdown {
                    position: absolute;
                    top: 45px;
                    right: 0;
                    width: 380px;
                    max-height: 480px;
                    background: #fff;
                    border-radius: 10px;
                    box-shadow: 0 4px 25px rgba(0,0,0,0.15);
                    z-index: 1000;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .notification-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    border-bottom: 1px solid #eee;
                    background: #f8f5f0;
                    flex-wrap: wrap;
                    gap: 8px;
                }

                .notification-header span {
                    font-weight: 600;
                    color: #1a1a2e;
                    font-size: 16px;
                }

                .notification-header .btn {
                    padding: 4px 12px;
                    font-size: 11px;
                }

                .notification-list {
                    max-height: 400px;
                    overflow-y: auto;
                    flex: 1;
                }

                .notification-item {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 12px 16px;
                    border-bottom: 1px solid #f0f0f0;
                    cursor: pointer;
                    transition: background 0.3s;
                    position: relative;
                }

                .notification-item:hover {
                    background: #f8f5f0;
                }

                .notification-item.unread {
                    background: #fdf6e8;
                    border-left: 3px solid #f0a500;
                }

                .notification-icon {
                    font-size: 24px;
                    flex-shrink: 0;
                    width: 36px;
                    text-align: center;
                }

                .notification-content {
                    flex: 1;
                    min-width: 0;
                }

                .notification-title {
                    font-weight: 600;
                    color: #1a1a2e;
                    font-size: 14px;
                }

                .notification-message {
                    color: #666;
                    font-size: 13px;
                    margin: 4px 0;
                    word-wrap: break-word;
                }

                .notification-time {
                    color: #999;
                    font-size: 11px;
                }

                .notification-dot {
                    width: 8px;
                    height: 8px;
                    background: #f0a500;
                    border-radius: 50%;
                    flex-shrink: 0;
                    margin-top: 8px;
                }

                .notification-empty {
                    padding: 30px;
                    text-align: center;
                    color: #999;
                    font-size: 14px;
                }

                .notification-loading {
                    padding: 30px;
                    text-align: center;
                    color: #999;
                }

                .btn-sm {
                    padding: 4px 12px;
                    font-size: 11px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background 0.3s;
                }

                .btn-secondary {
                    background: #16213e;
                    color: #fff;
                }

                .btn-secondary:hover {
                    background: #1a1a2e;
                }

                @media (max-width: 600px) {
                    .notification-dropdown {
                        width: 290px;
                        right: -80px;
                    }
                }
            `}</style>
        </div>
    );
};

export default NotificationBell;