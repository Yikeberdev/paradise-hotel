import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

export default function Discounts() {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/food/discounts/active')
      .then((res) => setDiscounts(res.data.discounts || []))
      .catch(() => setDiscounts([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ padding: 40, textAlign: 'center' }}>Loading discounts…</p>;

  if (!discounts.length) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: 20, textAlign: 'center' }}>
        <h2>No active discounts</h2>
        <p style={{ color: '#666' }}>When a discount is active, items appear here at the reduced price.</p>
        <Link to="/dashboard/customer">Back to dashboard</Link>
      </div>
    );
  }

  const actionFor = (d) => {
    const t = d.discount_type || d.type;
    if (t === 'food') return { to: '/order-food', label: 'Order this food at discount →' };
    if (t === 'room') return { to: '/rooms', label: 'Reserve room at discount →' };
    if (t === 'desk') return { to: '/reserve-desk', label: 'Reserve desk at discount →' };
    return { to: '/dashboard/customer', label: 'View services →' };
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ color: '#1a1a2e' }}>
        Current <span style={{ color: '#f0a500' }}>Discounts</span>
      </h1>
      <p style={{ color: '#666' }}>
        Use the button to order or reserve at this price.
      </p>
      <div style={{ display: 'grid', gap: 16 }}>
        {discounts.map((d) => {
          const act = actionFor(d);
          const items = d.items || [];
          return (
            <div
              key={d.id}
              style={{
                background: '#fff',
                border: '1px solid #eee',
                borderRadius: 12,
                padding: 20,
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ margin: 0, color: '#1a1a2e' }}>
                  {Number(d.discount_percentage || d.percentage)}% off{' '}
                  <span style={{ color: '#f0a500' }}>{d.discount_type || d.type}</span>
                </h3>
                <span style={{ background: '#e8f8ef', color: '#27ae60', padding: '4px 10px', borderRadius: 16, fontWeight: 700, fontSize: 13 }}>
                  Active
                </span>
              </div>
              <p style={{ color: '#666', margin: '10px 0' }}>
                <strong>Item:</strong> {d.target_item_name || d.target_category || d.category || 'Selected offer'}
              </p>
              <p style={{ margin: '6px 0', fontSize: 14 }}>
                <strong>Valid:</strong> {String(d.start_date).slice(0, 10)} {String(d.start_time || '').slice(0, 5)} →{' '}
                {String(d.end_date).slice(0, 10)} {String(d.end_time || '').slice(0, 5)}
              </p>

              {items.length > 0 ? (
                <div style={{ marginTop: 12, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                        <th style={{ padding: 8 }}>Item</th>
                        <th style={{ padding: 8 }}>Normal price</th>
                        <th style={{ padding: 8 }}>Discounted price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                          <td style={{ padding: 8 }}>{it.name}</td>
                          <td style={{ padding: 8, textDecoration: 'line-through', color: '#999' }}>
                            ETB {Number(it.normalPrice).toFixed(2)}
                          </td>
                          <td style={{ padding: 8, color: '#27ae60', fontWeight: 800 }}>
                            ETB {Number(it.discountedPrice).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: '#888', fontSize: 14 }}>Discount applies to the selected {d.discount_type} item.</p>
              )}

              <Link
                to={act.to}
                style={{
                  display: 'inline-block',
                  marginTop: 14,
                  background: '#f0a500',
                  color: '#1a1a2e',
                  fontWeight: 800,
                  padding: '10px 16px',
                  borderRadius: 8,
                  textDecoration: 'none',
                }}
              >
                {act.label}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
