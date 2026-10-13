import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';

const CustomerDashboard = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();

    const [roomReservations, setRoomReservations] = useState([]);
    const [deskReservations, setDeskReservations] = useState([]);
    const [foodOrders, setFoodOrders] = useState([]);
    const [refundRequests, setRefundRequests] = useState([]);
    const [payments, setPayments] = useState([]);
    const [hasDiscount, setHasDiscount] = useState(false);
    const [loading, setLoading] = useState(true);

    // Refund Modal State
    const [refundModal, setRefundModal] = useState(null);
    const [refundReason, setRefundReason] = useState('');
    const [refundCalc, setRefundCalc] = useState(null);
    const [submittingRefund, setSubmittingRefund] = useState(false);

    useEffect(() => {
        if (user) {
            fetchData();
            // Re-check active discounts every 60s so the link appears when start date/time is reached
            const t = setInterval(() => {
                api.get('/food/discounts/active')
                    .then((discRes) => {
                        setHasDiscount(!!(discRes.data.hasDiscount || (discRes.data.discounts || []).length));
                    })
                    .catch(() => { });
            }, 60000);
            return () => clearInterval(t);
        } else {
            setLoading(false);
        }
    }, [user]);

    const sortByRecent = (arr) => {
        if (!Array.isArray(arr)) return [];
        return [...arr].sort((a, b) => {
            const getVal = (x) => {
                const dateVal = x.updated_at || x.created_at || x.transaction_date || x.order_date || x.reservation_date || x.registration_date;
                if (dateVal) {
                    const t = new Date(dateVal).getTime();
                    if (!Number.isNaN(t)) return t;
                }
                return Number(x.id || x.reservation_id || 0);
            };
            return getVal(b) - getVal(a);
        });
    };

    const fetchData = async () => {
        if (!user) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [roomRes, deskRes, foodRes, refundRes, payRes, discRes] = await Promise.all([
                api.get('/reservations/my').catch(() => ({ data: { reservations: [] } })),
                api.get('/desks/my').catch(() => ({ data: { reservations: [] } })),
                api.get('/food/my').catch(() => ({ data: { orders: [] } })),
                api.get('/refunds/my').catch(() => ({ data: { refunds: [] } })),
                api.get('/payments/my').catch(() => ({ data: { payments: [] } })),
                api.get('/food/discounts/active').catch(() => ({ data: { hasDiscount: false } })),
            ]);
            setRoomReservations(sortByRecent(roomRes.data.reservations || []));
            setDeskReservations(sortByRecent(deskRes.data.reservations || []));
            setFoodOrders(sortByRecent(foodRes.data.orders || []));
            setRefundRequests(sortByRecent(refundRes.data.refunds || []));
            setPayments(sortByRecent(payRes.data.payments || []));
            setHasDiscount(!!(discRes.data.hasDiscount || (discRes.data.discounts || []).length));
        } catch (error) {
            console.error('Fetch error:', error);
        } finally {
            setLoading(false);
        }
    };

    const openRefundModal = async (type, item) => {
        const id = item.id;
        try {
            const res = await api.post('/refunds/calculate', {
                reservationType: type,
                reservationId: id
            });
            if (res.data.success) {
                setRefundCalc(res.data.calculation);
                setRefundModal({ type, id, item });
                setRefundReason('');
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error calculating refund penalty');
        }
    };

    const handleRefundSubmit = async (e) => {
        e.preventDefault();
        if (!refundReason || refundReason.trim().length < 5) {
            toast.error('Please provide a reason for your refund request (min 5 characters).');
            return;
        }

        setSubmittingRefund(true);
        try {
            const res = await api.post('/refunds/request', {
                reservationType: refundModal.type,
                reservationId: refundModal.id,
                reason: refundReason.trim()
            });

            if (res.data.success) {
                toast.success('Refund request submitted successfully! Receptionist will review it.');
                setRefundModal(null);
                fetchData();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error submitting refund request');
        } finally {
            setSubmittingRefund(false);
        }
    };

    const renderStatusBadge = (status, paymentStatus) => {
        let badgeClass = 'status-pending';
        let label = status || 'Awaiting payment';

        if (status === 'awaiting_payment' || status === 'pending') {
            label = 'Pending Approval';
            badgeClass = 'status-pending';
        } else if (status === 'approved') {
            label = 'Approved';
            badgeClass = 'status-approved';
        } else if (status === 'rejected') {
            label = 'Rejected';
            badgeClass = 'status-rejected';
        } else if (status === 'cancelled') {
            label = 'Cancelled';
            badgeClass = 'status-rejected';
        } else if (status === 'completed' || status === 'checked_out') {
            label = 'Completed';
            badgeClass = 'status-completed';
        }

        return (
            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span className={`status-badge ${badgeClass}`}>{label}</span>
                {paymentStatus && (
                    <span style={{ fontSize: '11px', color: paymentStatus === 'paid' ? '#27ae60' : '#d9534f', fontWeight: 'bold' }}>
                        Payment: {paymentStatus.toUpperCase()}
                    </span>
                )}
            </div>
        );
    };


    // Guest / public customer home
    if (!user) {
        return (
            <div className="inside" style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px' }}>
                <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', color: '#fff', borderRadius: 16, padding: '32px 24px', marginBottom: 28, textAlign: 'center' }}>
                    <h1 style={{ margin: '0 0 10px', fontSize: 28 }}>Welcome to <span style={{ color: '#f0a500' }}>Paradise Hotel</span></h1>
                    {hasDiscount && (
                        <div style={{ margin: '12px 0 20px', padding: 14, background: '#fff8e6', border: '1px solid #f0a500', borderRadius: 10 }}>
                            <Link to="/discounts" style={{ color: '#1a1a2e', fontWeight: 800, textDecoration: 'none' }}>
                                🏷️ Active discounts available — view details →
                            </Link>
                        </div>
                    )}
                    <p style={{ margin: 0, color: '#ccc', fontSize: 15 }}>Browse rooms, desks & foods</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                    {[
                        { path: '/rooms', icon: '🛏️', title: 'View Rooms', desc: 'Swipe through available rooms' },
                        { path: '/reserve-desk', icon: '🍽️', title: 'Reserve Desk', desc: 'Browse dining desks' },
                        { path: '/order-food', icon: '🍕', title: 'Order Food', desc: 'Slide through the menu' },
                    ].map((c) => (
                        <button
                            key={c.path}
                            type="button"
                            onClick={() => navigate(c.path)}
                            style={{
                                background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: 22,
                                cursor: 'pointer', textAlign: 'left', boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                            }}
                        >
                            <div style={{ fontSize: 32, marginBottom: 8 }}>{c.icon}</div>
                            <div style={{ fontWeight: 800, fontSize: 17, color: '#1a1a2e' }}>{c.title}</div>
                            <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>{c.desc}</div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="inside" style={{ textAlign: 'center', padding: '60px' }}>
                <p>Loading your dashboard requests & reservations...</p>
            </div>
        );
    }

    return (
        <div className="inside" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
            <div className="dashboard-header">
                <div>
                    <h1>🏨 <span style={{ color: '#f0a500' }}>Paradise</span> Hotel Customer Portal</h1>
                    <p style={{ color: '#ccc', margin: '4px 0 0 0' }}>Welcome, {user?.first_name} {user?.last_name}! Track request approvals, payment statuses & refunds.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button className="btn btn-primary" onClick={() => navigate('/rooms')}>+ Apply for Room</button>
                    <button className="btn btn-primary" onClick={() => navigate('/reserve-desk')}>+ Apply for Desk</button>
                    <button className="btn btn-primary" onClick={() => navigate('/order-food')}>+ Order Food</button>
                </div>
            </div>

            {/* Quick Stats Banner */}
            <div className="dashboard-stats">
                <div className="stat-card">
                    <h3>{roomReservations.length}</h3>
                    <p>Room Requests</p>
                </div>
                <div className="stat-card">
                    <h3>{deskReservations.length}</h3>
                    <p>Desk Requests</p>
                </div>
                <div className="stat-card">
                    <h3>{foodOrders.length}</h3>
                    <p>Food Orders</p>
                </div>
                <div className="stat-card">
                    <h3>{refundRequests.length}</h3>
                    <p>Refund Requests</p>
                </div>
            </div>

            <div className="dashboard-grid">
                {/* Room Reservations Section */}
                <div className="card">
                    <h3>🛏️ Room Reservations</h3>
                    {roomReservations.length > 0 ? (
                        roomReservations.map(r => (
                            <div key={r.id} className="reservation-item">
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#1a1a2e' }}>
                                        Room #{r.room_number || 'N/A'} ({r.room_type})
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>
                                        Dates: {r.check_in_date} ➔ {r.check_out_date}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#555' }}>
                                        Address: {r.wereda}, {r.kebele}, {r.zone}, {r.region}
                                    </div>
                                    <div className="price" style={{ fontSize: '15px', marginTop: '4px' }}>
                                        Total: ETB {Number(r.total_price || 0).toFixed(2)}
                                    </div>
                                    {r.rejection_reason && (
                                        <div style={{ fontSize: '12px', color: '#d9534f', marginTop: '4px' }}>
                                            <strong>Rejection Reason:</strong> {r.rejection_reason}
                                        </div>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                                    {renderStatusBadge(r.status, r.payment_status)}

                                    {r.payment_status === 'awaiting_payment' || status === 'pending' && r.status !== 'cancelled' && r.status !== 'rejected' && (
                                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/payment?type=room&id=${r.id}`)}>
                                            💳 Pay / Upload Receipt
                                        </button>
                                    )}

                                    {r.status === 'approved' && (
                                        <button className="btn btn-warning btn-sm" onClick={() => openRefundModal('room', r)}>
                                            💸 Request Refund
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p style={{ color: '#888', textAlign: 'center', padding: '15px' }}>No room reservations found. Click "+ Apply for Room" above.</p>
                    )}
                </div>

                {/* Desk Reservations Section */}
                <div className="card">
                    <h3>🍽️ Desk Reservations</h3>
                    {deskReservations.length > 0 ? (
                        deskReservations.map(d => (
                            <div key={d.id} className="reservation-item">
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#1a1a2e' }}>
                                        Desk #{d.desk_number || 'N/A'} ({d.location})
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>
                                        Date: {d.reservation_date} | Duration: {Number(d.duration_hours || 0).toFixed(1)} hrs
                                    </div>
                                    <div className="price" style={{ fontSize: '15px', marginTop: '4px' }}>
                                        {d.is_free_with_food ? 'FREE (Food order linked)' : `Total: ETB ${Number(d.amount || 0).toFixed(2)}`}
                                    </div>
                                    {d.rejection_reason && (
                                        <div style={{ fontSize: '12px', color: '#d9534f', marginTop: '4px' }}>
                                            <strong>Rejection Reason:</strong> {d.rejection_reason}
                                        </div>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                                    {renderStatusBadge(d.status, d.payment_status)}

                                    {d.payment_status === 'awaiting_payment' || status === 'pending' && !d.is_free_with_food && d.status !== 'cancelled' && d.status !== 'rejected' && (
                                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/payment?type=desk&id=${d.id}`)}>
                                            💳 Pay / Upload Receipt
                                        </button>
                                    )}

                                    {d.status === 'approved' && (
                                        <button className="btn btn-warning btn-sm" onClick={() => openRefundModal('desk', d)}>
                                            💸 Request Refund
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p style={{ color: '#888', textAlign: 'center', padding: '15px' }}>No desk reservations found.</p>
                    )}
                </div>

                {/* Food Orders Section */}
                <div className="card">
                    <h3>🍕 Food Orders</h3>
                    {foodOrders.length > 0 ? (
                        foodOrders.map(o => (
                            <div key={o.id} className="reservation-item">
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#1a1a2e' }}>
                                        Food Order #{o.id} ({o.order_type})
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>
                                        Placed: {new Date(o.order_date).toLocaleString()}
                                    </div>
                                    <div className="price" style={{ fontSize: '15px', marginTop: '4px' }}>
                                        Total: ETB {Number(o.total_amount || 0).toFixed(2)}
                                    </div>
                                    {o.rejection_reason && (
                                        <div style={{ fontSize: '12px', color: '#d9534f', marginTop: '4px' }}>
                                            <strong>Rejection Reason:</strong> {o.rejection_reason}
                                        </div>
                                    )}
                                </div>
                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                                    {renderStatusBadge(o.status, o.payment_status)}

                                    {o.payment_status === 'awaiting_payment' || status === 'pending' && o.status !== 'cancelled' && (
                                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/payment?type=food&id=${o.id}`)}>
                                            💳 Pay / Upload Receipt
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p style={{ color: '#888', textAlign: 'center', padding: '15px' }}>No food orders found.</p>
                    )}
                </div>

                {/* Refund Requests Section */}
                <div className="card">
                    <h3>💸 Refund Requests & History</h3>
                    {refundRequests.length > 0 ? (
                        refundRequests.map(rf => (
                            <div key={rf.id} className="reservation-item">
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#1a1a2e' }}>
                                        Refund #{rf.id} ({rf.reservation_type.toUpperCase()} #{rf.reservation_id})
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>
                                        Original: ETB {Number(rf.original_amount).toFixed(2)} | Penalty ({rf.penalty_percentage}%): ETB {Number(rf.penalty_amount).toFixed(2)}
                                    </div>
                                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#27ae60', marginTop: '4px' }}>
                                        Net Refund Amount: ETB {Number(rf.refund_amount).toFixed(2)}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                                        Reason: {rf.reason}
                                    </div>
                                    {rf.rejection_reason && (
                                        <div style={{ fontSize: '12px', color: '#d9534f', marginTop: '4px' }}>
                                            <strong>Staff Note:</strong> {rf.rejection_reason}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <span className={`status-badge status-${rf.status}`}>{rf.status.toUpperCase()}</span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <p style={{ color: '#888', textAlign: 'center', padding: '15px' }}>No refund requests submitted yet.</p>
                    )}
                </div>
            </div>

            {/* Interactive Refund Request Modal */}
            {refundModal && refundCalc && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                    <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '520px', width: '100%', padding: '28px', position: 'relative' }}>
                        <button onClick={() => setRefundModal(null)} style={{ position: 'absolute', top: '15px', right: '15px', border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer' }}>×</button>
                        <h2 style={{ marginTop: 0, color: '#1a1a2e' }}>💸 Request Refund</h2>
                        <p style={{ color: '#666', fontSize: '14px' }}>
                            Automatic penalty calculated based on remaining time before reservation:
                        </p>

                        {/* Penalty Calculation Breakdown Display */}
                        <div style={{ background: '#f8f5f0', borderRadius: '10px', padding: '16px', margin: '15px 0', borderLeft: '4px solid #f0a500' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span>Original Paid Amount:</span>
                                <strong>ETB {refundCalc.originalAmount.toFixed(2)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#d9534f' }}>
                                <span>Time-based Penalty ({refundCalc.penaltyPercentage}%):</span>
                                <strong>- ETB {refundCalc.penaltyAmount.toFixed(2)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #ddd', fontSize: '18px', fontWeight: 'bold', color: '#27ae60' }}>
                                <span>Net Refund Amount:</span>
                                <span>ETB {refundCalc.refundAmount.toFixed(2)}</span>
                            </div>
                            <small style={{ color: '#777', marginTop: '6px', display: 'block' }}>
                                Policy: &gt;7 days=5%, 3-7 days=15%, 24-72h=30%, &lt;24h=50%, post-start=100%.
                            </small>
                        </div>

                        <form onSubmit={handleRefundSubmit}>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>Reason for Refund Request *</label>
                                <textarea
                                    value={refundReason}
                                    onChange={(e) => setRefundReason(e.target.value)}
                                    rows="3"
                                    required
                                    placeholder="Please describe why you are requesting a refund..."
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="button" onClick={() => setRefundModal(null)} style={{ flex: 1, padding: '12px', border: '1px solid #ccc', borderRadius: '8px', background: '#fff', cursor: 'pointer' }}>
                                    Cancel
                                </button>
                                <button type="submit" disabled={submittingRefund} style={{ flex: 1.5, padding: '12px', border: 'none', borderRadius: '8px', background: '#d9534f', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
                                    {submittingRefund ? 'Submitting...' : 'Submit Refund Request ➔'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .dashboard-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 25px; padding: 24px; background: #1a1a2e; border-radius: 12px; color: #fff; }
                .dashboard-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 15px; margin-bottom: 25px; }
                .stat-card { background: #fff; padding: 20px; border-radius: 10px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.06); border: 1px solid #eee; }
                .stat-card h3 { font-size: 28px; color: #f0a500; margin: 0; }
                .stat-card p { color: #666; margin: 5px 0 0 0; font-size: 13px; }
                .dashboard-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }
                .card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); border: 1px solid #eee; }
                .card h3 { color: #1a1a2e; border-bottom: 2px solid #f0a500; padding-bottom: 10px; margin-top: 0; margin-bottom: 15px; }
                .reservation-item { padding: 14px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: flex-start; gap: 15px; }
                .reservation-item:last-child { border-bottom: none; }
                .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; }
                .status-pending { background: #fff3cd; color: #856404; }
                .status-approved { background: #d4edda; color: #155724; }
                .status-rejected { background: #f8d7da; color: #721c24; }
                .status-completed { background: #d1ecf1; color: #0c5460; }
                .btn { display: inline-block; padding: 8px 14px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; transition: all 0.2s; }
                .btn-sm { padding: 5px 10px; font-size: 12px; }
                .btn-primary { background: #f0a500; color: #1a1a2e; }
                .btn-warning { background: #e67e22; color: #fff; }
                @media (max-width: 768px) { .dashboard-grid { grid-template-columns: 1fr; } }
            `}</style>
        </div>
    );
};

export default CustomerDashboard;