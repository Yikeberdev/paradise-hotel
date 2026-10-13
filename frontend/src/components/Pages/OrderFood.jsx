import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';
import ItemSlider from '../Common/ItemSlider';

const resolveMediaUrl = (src, folder = 'foods') => {
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


export default function OrderFood() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState(['All', 'Breakfast', 'Main Course', 'Vegetarian', 'Beverage', 'Dessert', 'International']);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [userDesks, setUserDesks] = useState([]);
  const [selectedDeskId, setSelectedDeskId] = useState('');
  const [orderType, setOrderType] = useState('takeaway'); // 'room' | 'desk' | 'takeaway' | 'delivery'
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [requiredTime, setRequiredTime] = useState('');
  const minDateTimeLocal = () => {
    const n = new Date();
    n.setMinutes(n.getMinutes() - n.getTimezoneOffset());
    return n.toISOString().slice(0, 16);
  };

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch menu
    (async () => {
      try {
        let res;
        try { res = await api.get('/food'); }
        catch (_) { res = await api.get('/food/menu'); }
        const items = res.data.menuItems || res.data.items || res.data.foods || (Array.isArray(res.data) ? res.data : []);
        setMenuItems(Array.isArray(items) ? items : []);
        if (!Array.isArray(items) || items.length === 0) {
          console.warn('Food menu empty');
        }
      } catch (err) {
        console.error('Food menu load error:', err);
        toast.error(err.response?.data?.message || err.message || 'Could not load food menu. Is the backend running?');
        setMenuItems([]);
      }
    })();

    // Fetch user's desk reservations if logged in
    if (user) {
      api.get('/desks/my')
        .then((res) => {
          const list = res.data.reservations || [];
          setUserDesks(list.filter(d => d.status !== 'cancelled' && d.status !== 'rejected'));
        })
        .catch(console.error);
    }

    const params = new URLSearchParams(location.search);
    const deskResId = params.get('deskReservationId');
    if (deskResId) {
      setOrderType('desk');
      setSelectedDeskId(deskResId);
    }
  }, [user, location.search]);

  const filteredItems = menuItems.filter((item) => {
    if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = `${item.item_name || item.name || ''} ${item.category || ''} ${item.description || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const addToCart = (item) => {
    if (!user) {
      toast.error('Please log in before ordering food.');
      navigate('/login');
      return;
    }
    setCart((prev) => {
      const existing = prev.find(i => i.menuId === item.id);
      if (existing) {
        return prev.map(i => i.menuId === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      } else {
        const unit = Number(item.discounted_price != null ? item.discounted_price : item.price);
        return [...prev, { menuId: item.id, name: item.item_name || item.name, price: unit, quantity: 1, has_discount: !!item.has_discount, original_price: item.original_price != null ? item.original_price : item.price }];
      }
    });
    toast.success(`Added ${item.item_name || item.name} to cart`);
  };

  const updateQuantity = (menuId, delta) => {
    setCart((prev) => {
      return prev.map(i => {
        if (i.menuId === menuId) {
          const newQty = i.quantity + delta;
          return newQty > 0 ? { ...i, quantity: newQty } : null;
        }
        return i;
      }).filter(Boolean);
    });
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCheckout = async () => {
    if (!user) {
      toast.error('Please log in before placing a food order.');
      navigate('/login');
      return;
    }

    if (cart.length === 0) {
      toast.error('Your order cart is empty. Please select food items first.');
      return;
    }

    if (orderType === 'desk' && !selectedDeskId) {
      toast.error('Please select an active desk reservation to link your food order to.');
      return;
    }

    if (!requiredTime) {
      toast.error('Please select when the food is required.');
      return;
    }
    if (new Date(requiredTime).getTime() < Date.now() - 60 * 1000) {
      toast.error('Food required time cannot be in the past.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/food/order', {
        items: cart.map(i => ({ menuId: i.menuId, quantity: i.quantity })),
        requiredTime,
        orderType,
        referenceId: orderType === 'desk' ? selectedDeskId : null,
        specialInstructions
      });

      if (res.data.success) {
        toast.success(res.data.message || 'Food order placed! Redirecting to payment...');
        navigate(`/payment?type=food&id=${res.data.order.id}`);
      }
    } catch (error) {
      console.error('Food order error:', error);
      toast.error(error.response?.data?.message || 'Error placing food order.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inside" style={{ maxWidth: '1200px', margin: '0 auto', padding: '30px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '30px', color: '#1a1a2e' }}>
          🍕 Order Delicious <span style={{ color: '#f0a500' }}>Food & Beverages</span>
        </h1>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              padding: '8px 18px',
              borderRadius: '20px',
              border: selectedCategory === cat ? '2px solid #f0a500' : '1px solid #ddd',
              background: selectedCategory === cat ? '#f0a500' : '#fff',
              color: selectedCategory === cat ? '#1a1a2e' : '#555',
              fontWeight: selectedCategory === cat ? 'bold' : 'normal',
              cursor: 'pointer'
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto 24px' }}>
        <input
          type="search"
          placeholder="Search by food name, category, description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid #ddd', fontSize: 15, boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 340px)', gap: '25px' }}>
        {/* Android-style food slider */}
        <div style={{ minWidth: 0 }}>
          <ItemSlider
            items={filteredItems}
            emptyMessage="No food items match your search"
            height={460}
            renderItem={(item) => {
              const img = resolveMediaUrl(item.image, 'foods');
              return (
                <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 28px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ position: 'relative', height: 260, background: '#111' }}>
                    <img src={img} alt={item.item_name || item.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80'; }} />
                    <span style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(26,26,46,0.9)', color: '#f0a500', padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{item.category}</span>
                  </div>
                  <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <h2 style={{ margin: '0 0 8px', fontSize: 22, color: '#1a1a2e' }}>{item.item_name || item.name}</h2>
                    <p style={{ margin: '0 0 12px', color: '#666', fontSize: 14, lineHeight: 1.45 }}>{item.description || 'Prepared fresh with quality ingredients.'}</p>
                    {item.has_discount ? (
                      <p style={{ margin: '0 0 16px' }}>
                        <span style={{ fontSize: 14, color: '#999', textDecoration: 'line-through', marginRight: 8 }}>ETB {Number(item.original_price || item.price).toFixed(2)}</span>
                        <span style={{ fontSize: 22, fontWeight: 800, color: '#27ae60' }}>ETB {Number(item.discounted_price || item.price).toFixed(2)}</span>
                        <span style={{ marginLeft: 8, background: '#e8f8ef', color: '#27ae60', fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 12 }}>{item.discount_percent}% OFF</span>
                      </p>
                    ) : (
                      <p style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 800, color: '#f0a500' }}>ETB {Number(item.price).toFixed(2)}</p>
                    )}
                    <button type="button" onClick={() => addToCart(item)} style={{ marginTop: 'auto', padding: 14, border: 'none', borderRadius: 10, background: '#f0a500', color: '#1a1a2e', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
                      + Add to cart
                    </button>
                  </div>
                </div>
              );
            }}
          />
        </div>

        {/* Order Summary & Cart Sidebar */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #eee', boxShadow: '0 4px 15px rgba(0,0,0,0.06)', height: 'fit-content' }}>
          <h3 style={{ marginTop: 0, borderBottom: '2px solid #f0a500', paddingBottom: '8px' }}>🛒 Order Summary</h3>

          {cart.length === 0 ? (
            <p style={{ color: '#888', padding: '20px 0', textAlign: 'center' }}>Your cart is empty. Click "+ Apply Order" on menu items.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
              {cart.map(i => (
                <div key={i.menuId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
                  <div>
                    <strong>{i.name}</strong>
                    <div style={{ fontSize: '12px', color: '#777' }}>ETB {i.price.toFixed(2)} each</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button onClick={() => updateQuantity(i.menuId, -1)} style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer' }}>-</button>
                    <span>{i.quantity}</span>
                    <button onClick={() => updateQuantity(i.menuId, 1)} style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              ))}

              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #ddd', display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold' }}>
                <span>Total Amount:</span>
                <span style={{ color: '#f0a500' }}>ETB {cartTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Order Details & Link to Desk */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Delivery / Service Option</label>
              <select value={orderType} onChange={(e) => setOrderType(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}>
                <option value="takeaway">Takeaway</option>
                <option value="room">Deliver to Room</option>
                <option value="desk">Dine at Reserved Desk (Desk service FREE)</option>
                <option value="delivery">Local Delivery</option>
              </select>
            </div>

            {orderType === 'desk' && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Select Active Desk Reservation</label>
                {userDesks.length === 0 ? (
                  <small style={{ color: '#d9534f' }}>No active desk reservations found. <a href="/reserve-desk">Reserve a desk first</a></small>
                ) : (
                  <select value={selectedDeskId} onChange={(e) => setSelectedDeskId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}>
                    <option value="">-- Choose Desk --</option>
                    {userDesks.map(d => (
                      <option key={d.id} value={d.id}>
                        Desk #{d.desk_number} ({d.reservation_date})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>Special Instructions</label>
              <textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} rows="2" style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }} placeholder="Allergies, spice preferences, etc." />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600 }}>Time food is required *</label>
              <input
                type="datetime-local"
                value={requiredTime}
                min={minDateTimeLocal()}
                onChange={(e) => setRequiredTime(e.target.value)}
                required
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' }}
              />
            </div>

            <button
              onClick={handleCheckout}
              disabled={loading || cart.length === 0}
              style={{
                padding: '12px',
                background: cart.length === 0 ? '#ccc' : '#27ae60',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '16px',
                cursor: cart.length === 0 || loading ? 'not-allowed' : 'pointer',
                marginTop: '10px'
              }}
            >
              {loading ? 'Processing Order...' : 'Confirm Order & Pay ➔'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}