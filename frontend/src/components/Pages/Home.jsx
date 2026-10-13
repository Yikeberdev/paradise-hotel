import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

const Home = () => {
    const [stats, setStats] = useState({ rooms: 0, testimonials: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [roomsRes, commentsRes] = await Promise.all([
                    api.get('/rooms/available'),
                    api.get('/comments/approved'),
                ]);
                setStats({
                    rooms: roomsRes.data.rooms?.length || 0,
                    testimonials: commentsRes.data.comments || [],
                });
            } catch (error) {
                console.error('Error fetching home data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    return (
        <div className="inside">
            <div className="welcome-section">
                <h1>Welcome to Paradise Hotel</h1>
                <p>Experience luxury and comfort in the heart of Debre Markos</p>
                <div className="quick-stats">
                    <div className="stat-box">
                        <h3>{loading ? '...' : stats.rooms}</h3>
                        <p>Available Rooms</p>
                    </div>
                    <div className="stat-box">
                        <h3>24/7</h3>
                        <p>Service</p>
                    </div>
                    <div className="stat-box">
                        <h3>⭐ 4.5</h3>
                        <p>Guest Rating</p>
                    </div>
                </div>
            </div>

            <div className="quick-links">
                <h2>Our Services</h2>
                <div className="service-grid">
                    <Link to="/reserve-room" className="service-card">
                        <span className="service-icon">🛏️</span>
                        <h3>Book a Room</h3>
                        <p>Find and reserve your perfect room</p>
                    </Link>
                    <Link to="/reserve-desk" className="service-card">
                        <span className="service-icon">🍽️</span>
                        <h3>Reserve a Desk</h3>
                        <p>Book a table for dining</p>
                    </Link>
                    <Link to="/order-food" className="service-card">
                        <span className="service-icon">🍕</span>
                        <h3>Order Food</h3>
                        <p>Browse our menu and order</p>
                    </Link>
                    <Link to="/feedback" className="service-card">
                        <span className="service-icon">💬</span>
                        <h3>Leave Feedback</h3>
                        <p>Share your experience with us</p>
                    </Link>
                </div>
            </div>
            {/*
            <div className="testimonials">
                <h2>What Our Guests Say</h2>
                <div className="testimonial-grid">
                    {loading ? (
                        <p>Loading testimonials...</p>
                    ) : stats.testimonials.length > 0 ? (
                        stats.testimonials.map((t, i) => (
                            <div key={i} className="testimonial-card">
                                <p>"{t.feedback}"</p>
                                <h4>- {t.username || 'Anonymous'}</h4>
                            </div>
                        ))
                    ) : (
                        <p>No testimonials yet</p>
                    )}
                </div>
            </div>
*/}
            <style>{`
                .welcome-section { text-align: center; padding: 40px 20px; }
                .welcome-section h1 { font-size: 36px; color: #1a1a2e; margin-bottom: 10px; }
                .welcome-section p { font-size: 18px; color: #666; margin-bottom: 30px; }
                .quick-stats { display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
                .stat-box { background: #fff; padding: 20px 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
                .stat-box h3 { font-size: 32px; color: #f0a500; }
                .quick-links { padding: 40px 20px; }
                .quick-links h2 { text-align: center; margin-bottom: 30px; color: #1a1a2e; }
                .service-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
                .service-card { background: #fff; padding: 30px 20px; text-align: center; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); text-decoration: none; color: #333; transition: transform 0.3s; }
                .service-card:hover { transform: translateY(-5px); box-shadow: 0 6px 20px rgba(0,0,0,0.12); }
                .service-icon { font-size: 40px; display: block; margin-bottom: 15px; }
                .service-card h3 { color: #1a1a2e; margin-bottom: 8px; }
                .service-card p { color: #666; font-size: 14px; }
                .testimonials { padding: 40px 20px; background: #f8f5f0; border-radius: 10px; }
                .testimonials h2 { text-align: center; margin-bottom: 30px; color: #1a1a2e; }
                .testimonial-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
                .testimonial-card { background: #fff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
                .testimonial-card p { font-style: italic; margin-bottom: 10px; color: #555; }
                .testimonial-card h4 { color: #1a1a2e; text-align: right; }
                @media (max-width: 768px) { .quick-stats { flex-direction: column; align-items: center; } .service-grid { grid-template-columns: 1fr 1fr; } }
                @media (max-width: 480px) { .service-grid { grid-template-columns: 1fr; } }
            `}</style>
        </div>
    );
};

export default Home;