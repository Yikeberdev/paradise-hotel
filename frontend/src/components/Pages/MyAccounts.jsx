import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';

const MyAccounts = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    bankName: 'Commercial Bank of Ethiopia',
    bankCode: 'CBE',
    accountNumber: '',
    initialBalance: '5000',
  });

  const regName = `${user?.first_name || user?.firstName || ''} ${user?.last_name || user?.lastName || ''}`.trim();
  const accountUsername = user?.username || '';

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    load();
  }, [user, navigate]);

  const load = async () => {
    setLoading(true);
    try {
      const [accRes, payRes] = await Promise.all([
        api.get('/accounts/my').catch((e) => {
          console.error(e);
          return { data: { accounts: [] } };
        }),
        api.get('/payments/my-history').catch((e) => {
          console.error('payment history', e.response?.data || e);
          return { data: { payments: [] } };
        }),
      ]);
      setAccounts(accRes.data.accounts || []);
      setPayments(payRes.data.payments || payRes.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load accounts');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.accountNumber.trim()) {
      toast.error('Account number is required');
      return;
    }
    if (!regName || !accountUsername) {
      toast.error('Registration name and username are required');
      return;
    }
    try {
      const res = await api.post('/accounts/my', {
        bankName: form.bankName,
        bankCode: form.bankCode,
        accountNumber: form.accountNumber.trim(),
        accountUsername,
        accountHolderName: regName,
        initialBalance: Number(form.initialBalance) || 0,
      });
      toast.success(res.data.message || (res.data.updated ? 'Balance updated' : 'Account linked'));
      setForm((f) => ({ ...f, accountNumber: '', initialBalance: '5000' }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to link account');
    }
  };

  const queryBalance = async (acc) => {
    try {
      const res = await api.post('/accounts/query-balance', {
        fullName: regName,
        accountUsername: acc.account_username || accountUsername,
      });
      toast.success(`Balance: ETB ${Number(res.data.balance).toFixed(2)}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Query failed');
    }
  };

  if (!user) return null;

  return (
    <div className="inside" style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ color: '#1a1a2e' }}>My Accounts</h1>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Link / top up account</h3>
        <form onSubmit={submit}>
          <label style={label}>Account username:</label>
          <input style={{ ...input, background: '#f0f0f0' }} value={regName} readOnly disabled />
          <label style={label}>Bank</label>
          <select
            style={input}
            value={form.bankName}
            onChange={(e) => {
              const bankName = e.target.value;
              const code = bankName.includes('Telebirr')
                ? 'TELEBIRR'
                : bankName.includes('Abyssinia')
                  ? 'BOA'
                  : bankName.includes('Awash')
                    ? 'AWASH'
                    : bankName.includes('Dashen')
                      ? 'DASHEN'
                      : 'CBE';
              setForm({ ...form, bankName, bankCode: code });
            }}
          >
            <option>Commercial Bank of Ethiopia</option>
            <option>Telebirr</option>
            <option>Bank of Abyssinia</option>
            <option>Awash Bank</option>
            <option>Dashen Bank</option>
          </select>
          <label style={label}>Account number:</label>
          <input
            style={input}
            value={form.accountNumber}
            onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            required
          />
          <label style={label}>Amount to add (ETB)</label>
          <input
            style={input}
            type="number"
            min="0"
            value={form.initialBalance}
            onChange={(e) => setForm({ ...form, initialBalance: e.target.value })}
          />
          <button type="submit" style={{ ...btn, background: '#f0a500', color: '#1a1a2e' }}>
            Link / update balance
          </button>
        </form>
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Your accounts</h3>
        {loading ? (
          <p>Loading...</p>
        ) : accounts.length === 0 ? (
          <p style={{ color: '#888' }}>No accounts linked yet.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Bank</th>
                  <th>Number</th>
                  <th>Account name</th>
                  <th>Username</th>
                  <th>Balance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.bank_name}</td>
                    <td>{a.account_number}</td>
                    <td>{a.account_holder_name}</td>
                    <td>{a.account_username}</td>
                    <td>ETB {Number(a.balance).toFixed(2)}</td>
                    <td>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => queryBalance(a)}>
                        Query balance
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Payment history</h3>
          <button type="button" className="btn btn-sm btn-outline" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
        {payments.length === 0 ? (
          <p style={{ color: '#888' }}>No payment history yet. Completed room, desk, or food payments will appear here.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Transaction ID</th>
                  <th>Type</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontSize: 12 }}>
                      {p.transaction_date ? new Date(p.transaction_date).toLocaleString() : '—'}
                    </td>
                    <td>
                      <code>{p.reference_number || '—'}</code>
                    </td>
                    <td>{p.transaction_id || '—'}</td>
                    <td>
                      {p.reservation_type || p.payment_type || '—'}
                      {p.reservation_id ? ` #${p.reservation_id}` : ''}
                    </td>
                    <td>{p.payment_method || '—'}</td>
                    <td>ETB {Number(p.amount || 0).toFixed(2)}</td>
                    <td>{p.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const card = {
  background: '#fff',
  border: '1px solid #eee',
  borderRadius: 12,
  padding: 20,
  marginBottom: 20,
};
const input = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #ddd',
  marginBottom: 12,
  boxSizing: 'border-box',
};
const label = { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 };
const btn = { border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' };

export default MyAccounts;
