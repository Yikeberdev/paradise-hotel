import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';
import ItemSlider from '../Common/ItemSlider';

const resolveMediaUrl = (src, folder = 'desks') => {
  const fallbacks = {
    rooms: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
    desks: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    foods: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80',
  };
  const def = fallbacks[folder] || fallbacks.rooms;
  if (!src) return def;
  let p = String(src).trim().replace(/\\/g, '/');
  if (!p || p === 'undefined' || p === 'null') return def;
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return p;
  if (p.startsWith('/uploads/')) return p;
  if (p.startsWith('uploads/')) return '/' + p;
  const file = p.replace(/^.*\//, '');
  return '/uploads/' + folder + '/' + file;
};


export default function ReserveDesk() {
  const { user } = useContext(AuthContext);
  const [desks, setDesks] = useState([]);
  const [selectedDeskId, setSelectedDeskId] = useState(null);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [withFood, setWithFood] = useState(false);
  const [specialRequests, setSpecialRequests] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailsModal, setDetailsModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const todayStr = () => {
    const n = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
  };


  useEffect(() => {
    api.get('/desks/available')
      .then((res) => {
        const list = res.data.desks || [];
        setDesks(list);
        // Only pre-select when logged in (selection requires login)
        if (list.length > 0 && user) setSelectedDeskId(list[0].id);
      })
      .catch(console.error);
  }, [user]);

  const filteredDesks = desks.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const hay = `${d.desk_number || ''} ${d.location || ''} ${d.description || ''} ${d.price || ''} ${d.capacity || ''} ${d.status || ''}`.toLowerCase();
    return hay.includes(q);
  });

  const selectedDesk = desks.find((d) => d.id === Number(selectedDeskId));

  const selectDesk = (deskId) => {
    if (!user) {
      toast.error('Please log in to select a desk.');
      navigate('/login');
      return;
    }
    setSelectedDeskId(deskId);
  };


  // Duration (hours) — minimum 0.5h, round up to next quarter hour
  let durationHours = 0;
  if (date && startTime && endTime) {
    const s = new Date(`${date}T${startTime}`);
    const e = new Date(`${date}T${endTime}`);
    if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e > s) {
      const raw = (e - s) / (1000 * 60 * 60);
      durationHours = Math.max(0.5, Math.ceil(raw * 4) / 4);
    }
  }

  const hourly = selectedDesk
    ? Number(selectedDesk.discounted_price ?? selectedDesk.price ?? 0)
    : 0;
  // Show fee by duration; free-with-food only after a matching food order (backend decides)
  const calculatedPrice = hourly > 0 && durationHours > 0
    ? Number((hourly * durationHours).toFixed(2))
    : 0;

  const handleApply = async (e) => {
    if (e) e.preventDefault();

    if (!user) {
      toast.error('Please log in before reserving a desk.');
      navigate('/login');
      return;
    }

    if (!selectedDeskId) {
      toast.error('Please select a desk.');
      return;
    }

    if (!date || !startTime || !endTime) {
      toast.error('Please select date, start time, and end time.');
      return;
    }

    const startDt = new Date(`${date}T${startTime}`);
    const endDt = new Date(`${date}T${endTime}`);
    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime()) || endDt <= startDt) {
      toast.error('End time must be after start time.');
      return;
    }
    const now = new Date();
    if (endDt.getTime() <= now.getTime()) {
      toast.error('Cannot reserve in the past. Choose a future date and time.');
      return;
    }
    if (startDt.getTime() < now.getTime() - 60 * 1000) {
      toast.error('Start time cannot be in the past.');
      return;
    }
    if (durationHours <= 0) {
      toast.error('Please choose a valid time duration.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/desks/reserve', {
        deskId: selectedDeskId,
        date,
        startTime,
        endTime,
        partySize,
        specialRequests,
        withFood,
      });

      if (res.data.success) {
        const total = Number(res.data.reservation?.totalPrice ?? res.data.reservation?.amount ?? 0);
        if (withFood && total <= 0) {
          toast.success('Desk reserved. Continue with your food order (desk may be free when food time matches).');
          navigate(`/order-food?deskReservationId=${res.data.reservation.id}`);
        } else if (total <= 0 && !withFood) {
          toast.error('Desk fee could not be calculated. Try a longer duration or another desk.');
        } else {
          toast.success(`Desk reserved. Please pay ETB ${total.toFixed(2)}.`);
          navigate(`/payment?type=desk&id=${res.data.reservation.id}`);
        }
      }
    } catch (error) {
      console.error('Desk reservation error:', error);
      toast.error(error.response?.data?.message || 'Error submitting desk reservation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inside" style={{ maxWidth: '1100px', margin: '0 auto', padding: '30px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '30px', color: '#1a1a2e' }}>
          🍽️ Apply for <span style={{ color: '#f0a500' }}>Desk Reservation</span>
        </h1>
        <p style={{ color: '#666' }}>
          Reserve seats in our dining hall or outdoor terrace. <strong>Order food together to get FREE desk service!</strong>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '25px' }}>
        {/* Desks Selection List */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #eee', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0 }}>Available Desks</h3>
          <input
            type="search"
            placeholder="Search desk number, location, price..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', marginBottom: 12, boxSizing: 'border-box' }}
          />
          <ItemSlider
            items={filteredDesks}
            emptyMessage="No desks match your search"
            height={380}
            renderItem={(d) => {
              const img = resolveMediaUrl(d.image, 'desks');
              return (
                <div
                  onClick={() => selectDesk(d.id)}
                  style={{
                    background: selectedDeskId === d.id ? '#fff7e6' : '#fff',
                    borderRadius: 14,
                    overflow: 'hidden',
                    border: selectedDeskId === d.id ? '3px solid #f0a500' : '1px solid #eee',
                    cursor: 'pointer',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.1)',
                  }}
                >
                  <div style={{ position: 'relative', height: 200, background: '#111' }}>
                    <img src={img} alt={`Desk ${d.desk_number}`} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80'; }} />
                    <span style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(39,174,96,0.95)', color: '#fff', padding: '4px 10px', borderRadius: 16, fontSize: 11, fontWeight: 700 }}>
                      {d.status === 'available' ? 'Available' : d.status}
                    </span>
                  </div>
                  <div style={{ padding: 14 }}>
                    <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>Desk #{d.desk_number}</h3>
                    <p style={{ margin: '0 0 6px', color: '#666', fontSize: 13 }}>{d.location || 'Main Hall'} · Cap {d.capacity}</p>
                    {d.has_discount ? (
                      <p style={{ margin: '0 0 10px', fontSize: 16 }}>
                        <span style={{ textDecoration: 'line-through', color: '#999', fontSize: 13, marginRight: 6 }}>ETB {Number(d.original_price || 0).toFixed(2)}</span>
                        <span style={{ fontWeight: 800, color: '#27ae60' }}>ETB {Number(d.discounted_price || d.price || 0).toFixed(2)}/hr</span>
                        <span style={{ marginLeft: 6, fontSize: 11, background: '#e8f8ef', color: '#27ae60', padding: '1px 6px', borderRadius: 8 }}>{d.discount_percent}% OFF</span>
                      </p>
                    ) : (
                      <p style={{ margin: '0 0 10px', fontWeight: 800, color: '#f0a500', fontSize: 16 }}>ETB {Number(d.price || 0).toFixed(2)}/hr</p>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setDetailsModal(d); }} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Details</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); selectDesk(d.id); }} style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', background: '#f0a500', fontWeight: 800, cursor: 'pointer' }}>
                        {selectedDeskId === d.id ? 'Selected ✓' : 'Select'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            }}
          />
        </div>

        {/* Reservation Form */}
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #eee', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0 }}>Reservation Application</h3>
          <form onSubmit={handleApply} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ padding: '12px', background: '#f0f9f4', borderRadius: '8px', borderLeft: '4px solid #27ae60' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', color: '#1e8449' }}>
                <input
                  type="checkbox"
                  checked={withFood}
                  onChange={(e) => setWithFood(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                🍔 Order food together (Desk service becomes 100% FREE!)
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>Date *</label>
              <input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>Start Time *</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>End Time *</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>Party Size (Guests) *</label>
              <input type="number" min="1" max="20" value={partySize} onChange={(e) => setPartySize(Number(e.target.value) || 1)} required style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>Special Requests (Optional)</label>
              <textarea value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} rows="2" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} />
            </div>

            {/* Price Breakdown Calculation */}
            <div style={{ padding: '15px', background: '#f8f5f0', borderRadius: '8px', borderLeft: '4px solid #f0a500' }}>
              <div style={{ fontSize: '14px', color: '#555' }}>
                Duration: <strong>{durationHours.toFixed(1)} hours</strong>
              </div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: withFood ? '#27ae60' : '#1a1a2e', marginTop: '6px' }}>
                Calculated Price: {withFood ? 'FREE (0.00 ETB)' : `ETB ${calculatedPrice.toFixed(2)}`}
              </div>
              {withFood && <small style={{ color: '#666' }}>Desk may be free only if your food order time matches this slot (backend checks).</small>}
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '14px',
                background: '#f0a500',
                color: '#1a1a2e',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '16px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Submitting Application...' : 'Apply Reservation ➔'}
            </button>
          </form>
        </div>
      </div>

      {/* Details Modal */}
      {detailsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '450px', width: '100%', padding: '24px', position: 'relative' }}>
            <button onClick={() => setDetailsModal(null)} style={{ position: 'absolute', top: '15px', right: '15px', border: 'none', background: 'none', fontSize: '24px', cursor: 'pointer' }}>×</button>
            <h3 style={{ marginTop: 0 }}>Desk #{detailsModal.desk_number} Details</h3>
            <p><strong>Location:</strong> {detailsModal.location}</p>
            <p><strong>Capacity:</strong> {detailsModal.capacity} Seats</p>
            <p><strong>Hourly Rate:</strong> ETB {Number(detailsModal.price).toFixed(2)} / hour</p>
            <p><strong>Description:</strong> {detailsModal.description || 'Comfortable table for dining and meetings.'}</p>
            <button onClick={() => { selectDesk(detailsModal.id); setDetailsModal(null); }} style={{ width: '100%', padding: '10px', background: '#f0a500', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
              Select This Desk
            </button>
          </div>
        </div>
      )}
    </div>
  );
}