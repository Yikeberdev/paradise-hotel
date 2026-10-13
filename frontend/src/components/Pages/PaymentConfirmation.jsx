import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const PaymentConfirmation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref') || localStorage.getItem('paymentReference') || '';
    const amt = localStorage.getItem('paymentAmount');
    setReference(ref);
    setAmount(parseFloat(amt) || 0);
  }, [location.search]);

  return (
    <div className="inside">
      <div style={{ maxWidth: 550, margin: '30px auto', background: '#fff', padding: 40, borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>✅</div>
        <h1 style={{ color: '#1a1a2e' }}>Payment completed</h1>
        <p style={{ color: '#666' }}>
          Your account was debited and the hotel account was credited. Room/desk bookings are confirmed; food orders are preparing.
        </p>
        <div style={{ background: '#f8f5f0', padding: 15, borderRadius: 8, margin: '20px 0' }}>
          <p><strong>Reference</strong></p>
          <p style={{ color: '#f0a500', fontWeight: 700, fontSize: 20 }}>{reference || '—'}</p>
          <p style={{ marginTop: 8 }}>Amount: <strong>ETB {amount.toFixed(2)}</strong></p>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard/customer')} style={{ padding: '12px 25px', border: 'none', borderRadius: 6, background: '#f0a500', fontWeight: 600, cursor: 'pointer' }}>
            My Dashboard
          </button>
          <button onClick={() => navigate('/')} style={{ padding: '12px 25px', border: 'none', borderRadius: 6, background: '#16213e', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentConfirmation;
