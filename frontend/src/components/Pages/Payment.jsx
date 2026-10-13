import React, { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';

/**
 * Payment: select hotel bank only.
 * Account username = customer registration full name (server-side).
 */
const Payment = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [hotelAccounts, setHotelAccounts] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState('');
  const [bookingData, setBookingData] = useState(null);

  const queryParams = new URLSearchParams(location.search);
  const type = queryParams.get('type');
  const id = queryParams.get('id');

  const regFullName = `${user?.first_name || user?.firstName || ''} ${user?.last_name || user?.lastName || ''}`.trim();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!type || !id) {
      toast.error('No booking selected for payment. Start from a reservation or food order.');
      navigate('/dashboard/customer', { replace: true });
      return;
    }

    (async () => {
      setFetching(true);
      try {
        const [hotelRes, bookingRes] = await Promise.all([
          api.get('/accounts/hotel'),
          api.get(`/payments/booking-details?type=${type}&id=${id}`),
        ]);
        const accounts = hotelRes.data.accounts || [];
        setHotelAccounts(accounts);
        if (accounts.length) setSelectedHotelId(String(accounts[0].id));
        setBookingData(bookingRes.data.booking || null);
      } catch (err) {
        console.error(err);
        toast.error(err.response?.data?.message || 'Failed to load payment data');
      } finally {
        setFetching(false);
      }
    })();
  }, [user, type, id, navigate]);

  const selectedHotel = hotelAccounts.find((a) => String(a.id) === String(selectedHotelId));
  const amount = bookingData ? Number(bookingData.totalPrice || bookingData.amount || 0) : 0;

  const payNow = async () => {
    if (!selectedHotelId) {
      toast.error('Select a hotel payment bank');
      return;
    }
    if (!regFullName) {
      toast.error('Registration name is missing. Update your profile first.');
      return;
    }

    setLoading(true);
    try {
      // account username = registration name (server also enforces this)
      const res = await api.post('/payments/transfer-pay', {
        type,
        id: Number(id),
        hotelAccountId: Number(selectedHotelId),
        accountUsername: regFullName,
      });
      if (res.data.success) {
        localStorage.setItem('paymentReference', res.data.reference || '');
        localStorage.setItem('paymentAmount', String(res.data.amount || amount));
        toast.success(res.data.message || 'Payment successful!');
        navigate(`/payment-confirmation?type=${type}&id=${id}&ref=${encodeURIComponent(res.data.reference || '')}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment failed');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="inside" style={{ textAlign: 'center', padding: 60 }}>
        <p>Loading payment options...</p>
      </div>
    );
  }

  return (
    <div className="inside" style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ color: '#1a1a2e', marginBottom: 8 }}>Account Payment</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Select the hotel bank to pay. 
        Top up balance in{' '}
        <button
          type="button"
          onClick={() => navigate('/my-accounts')}
          style={{ background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          My Accounts
        </button>
        .
      </p>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Booking</h3>
        <p>
          Type: <strong>{(type || '').toUpperCase()}</strong> #{id}
        </p>
        <p style={{ fontSize: 22, fontWeight: 800, color: '#f0a500' }}>
          Amount due: ETB {amount.toFixed(2)}
        </p>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Paradise Hotel bank Account </h3>
        {hotelAccounts.length === 0 ? (
          <p style={{ color: '#c0392b' }}>No hotel accounts found. Run migration_accounts.sql.</p>
        ) : (
          <select value={selectedHotelId} onChange={(e) => setSelectedHotelId(e.target.value)} style={input}>
            {hotelAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bank_name} — {a.account_number}
              </option>
            ))}
          </select>
        )}{/*
        {selectedHotel && (
          <div style={{ marginTop: 12, background: '#f8f9fa', padding: 14, borderRadius: 10, fontSize: 14 }}>
            <div>
              <strong>Bank:</strong> {selectedHotel.bank_name}
            </div>
            <div>
              <strong>Account number:</strong> {selectedHotel.account_number}
            </div>
            <div>
              <strong>Account username:</strong> {selectedHotel.account_username}
            </div>
          </div>
        )}
          */}
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Your account </h3>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Account username</label>
        <input
          value={regFullName || ''}
          readOnly
          disabled
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#f0f0f0', marginBottom: 8, boxSizing: 'border-box' }}
        />
      </div>

      <button
        type="button"
        onClick={payNow}
        disabled={loading || !hotelAccounts.length}
        style={{
          ...btn,
          width: '100%',
          background: !hotelAccounts.length ? '#ccc' : '#27ae60',
          color: '#fff',
          fontSize: 16,
          padding: 14,
        }}
      >
        {loading ? 'Processing...' : `Pay ETB ${amount.toFixed(2)} now`}
      </button>
    </div>
  );
};

const card = {
  background: '#fff',
  border: '1px solid #eee',
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
  boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
};
const input = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #ddd',
  marginBottom: 12,
  boxSizing: 'border-box',
  fontSize: 14,
};
const btn = {
  border: 'none',
  borderRadius: 8,
  padding: '10px 16px',
  fontWeight: 700,
  cursor: 'pointer',
  marginTop: 4,
};

export default Payment;
