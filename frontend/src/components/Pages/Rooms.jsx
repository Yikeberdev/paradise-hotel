import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import ItemSlider from '../Common/ItemSlider';

const resolveMediaUrl = (src, folder = 'rooms') => {
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


const resolveImg = (src) => resolveMediaUrl(src, 'rooms');

export default function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailsModal, setDetailsModal] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.get('/rooms/available')
      .then((res) => setRooms(res.data.rooms || res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const categories = ['All', 'Single', 'Double', 'Suite', 'Twin', 'Family', 'Deluxe'];

  const filteredRooms = rooms.filter((r) => {
    if (selectedCategory !== 'All' && (r.room_type || r.type) !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = `${r.room_number || ''} ${r.room_type || r.type || ''} ${r.description || ''} ${r.amenities || ''} ${r.price_per_night || r.price || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const handleApply = (roomId) => navigate(`/reserve-room?roomId=${roomId}`);

  return (
    <div className="inside" style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, color: '#1a1a2e', marginBottom: 8 }}>
          🏨 <span style={{ color: '#f0a500' }}>Rooms</span>
        </h1>
        <p style={{ color: '#666', fontSize: 15 }}>Swipe through rooms like photos on Android</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              padding: '7px 16px',
              borderRadius: 20,
              border: selectedCategory === cat ? '2px solid #f0a500' : '1px solid #ddd',
              background: selectedCategory === cat ? '#f0a500' : '#fff',
              color: selectedCategory === cat ? '#1a1a2e' : '#555',
              fontWeight: selectedCategory === cat ? 700 : 400,
              cursor: 'pointer',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <input
        type="search"
        placeholder="Search room number, type, features, price..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: '100%',
          maxWidth: 480,
          display: 'block',
          margin: '0 auto 20px',
          padding: '12px 16px',
          borderRadius: 12,
          border: '1px solid #ddd',
          fontSize: 15,
          boxSizing: 'border-box',
        }}
      />

      {loading ? (
        <p style={{ textAlign: 'center', padding: 40 }}>Loading rooms...</p>
      ) : (
        <ItemSlider
          items={filteredRooms}
          emptyMessage="No rooms match your search"
          height={480}
          renderItem={(room) => (
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                overflow: 'hidden',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
              }}
            >
              <div style={{ position: 'relative', height: 280, background: '#111' }}>
                <img
                  src={resolveImg(room.image)}
                  alt={`Room ${room.room_number}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  draggable={false}
                  onError={(e) => {
                    e.target.src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80';
                  }}
                />
                <span style={{ position: 'absolute', top: 14, left: 14, background: 'rgba(39,174,96,0.95)', color: '#fff', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  {room.status === 'available' ? 'Available' : room.status}
                </span>
                <span style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(26,26,46,0.9)', color: '#f0a500', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  {room.room_type || room.type}
                </span>
              </div>
              <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ margin: '0 0 6px', fontSize: 22, color: '#1a1a2e' }}>
                  Room #{room.room_number || room.roomNumber}
                </h2>
                <p style={{ margin: '0 0 10px', color: '#666', fontSize: 14, lineHeight: 1.45 }}>
                  {room.description || 'Comfortable room with modern amenities, WiFi, and 24/7 service.'}
                </p>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#888' }}>
                  Capacity: {room.capacity || 2} · {room.amenities || 'WiFi, TV, AC'}
                </p>
                <p style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800, color: '#f0a500' }}>
                  ETB {Number(room.price_per_night || room.price || 0).toFixed(2)}
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#888' }}> / night</span>
                </p>
                <div style={{ marginTop: 'auto', display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => setDetailsModal(room)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #1a1a2e', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    View Details
                  </button>
                  <button type="button" onClick={() => handleApply(room.id)} style={{ flex: 1.4, padding: 12, borderRadius: 10, border: 'none', background: '#f0a500', color: '#1a1a2e', fontWeight: 800, cursor: 'pointer' }}>
                    Reserve
                  </button>
                </div>
              </div>
            </div>
          )}
        />
      )}

      {detailsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setDetailsModal(null)}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 520, width: '100%', padding: 22, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setDetailsModal(null)} style={{ position: 'absolute', top: 12, right: 14, border: 'none', background: 'none', fontSize: 26, cursor: 'pointer' }}>×</button>
            <h2 style={{ marginTop: 0 }}>Room #{detailsModal.room_number}</h2>
            <img src={resolveImg(detailsModal.image)} alt="" style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 12, marginBottom: 12 }} />
            <p><strong>Type:</strong> {detailsModal.room_type}</p>
            <p><strong>Capacity:</strong> {detailsModal.capacity} persons</p>
            <p><strong>Price:</strong> ETB {Number(detailsModal.price_per_night || 0).toFixed(2)} / night</p>
            <p><strong>Amenities:</strong> {detailsModal.amenities || 'WiFi, TV, AC'}</p>
            <p>{detailsModal.description}</p>
            <button type="button" onClick={() => { const id = detailsModal.id; setDetailsModal(null); handleApply(id); }} style={{ width: '100%', marginTop: 12, padding: 12, border: 'none', borderRadius: 10, background: '#f0a500', fontWeight: 800, cursor: 'pointer' }}>
              Reserve this room
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
