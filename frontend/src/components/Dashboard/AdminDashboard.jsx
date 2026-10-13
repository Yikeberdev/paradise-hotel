import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';

const emptyForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  role: 'customer',
  status: 'active',
};

export default function AdminDashboard() {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'feedback' ? 'feedback' : 'users';

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [secAlerts, setSecAlerts] = useState([]);
  const [blockedIps, setBlockedIps] = useState([]);
  const [lockedAccounts, setLockedAccounts] = useState([]);
  const [lastAlertId, setLastAlertId] = useState(0);
  const [securityOpen, setSecurityOpen] = useState(true);

  const playAlertSound = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const beep = (freq, start, dur) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = freq;
        o.connect(g);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(0.12, ctx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        o.start(ctx.currentTime + start);
        o.stop(ctx.currentTime + start + dur);
      };
      // Siren-like triple beep
      beep(880, 0, 0.15);
      beep(660, 0.18, 0.15);
      beep(880, 0.36, 0.2);
    } catch (e) {
      console.warn('alert sound', e);
    }
  };

  const loadSecurity = async (playSoundOnNew) => {
    try {
      const [aRes, bRes, lRes] = await Promise.all([
        api.get('/security/alerts', { params: { since: 0 } }),
        api.get('/security/blocked-ips'),
        api.get('/security/locked-accounts').catch(() => ({ data: { locked: [] } })),
      ]);
      const alerts = aRes.data.alerts || [];
      setSecAlerts(alerts);
      setBlockedIps(bRes.data.blocked || []);
      setLockedAccounts(lRes.data.locked || []);
      if (playSoundOnNew && alerts.length) {
        const newest = alerts[0]?.id || 0;
        if (newest > lastAlertId && lastAlertId > 0) {
          playAlertSound();
          toast.error(alerts[0].subject || 'Security alert — IP blocked', { duration: 8000 });
        }
        if (newest > lastAlertId) setLastAlertId(newest);
      } else if (alerts.length && lastAlertId === 0) {
        setLastAlertId(alerts[0].id || 0);
      }
    } catch (e) {
      // silent — admin only endpoint
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // Poll security alerts every 8s for live sound + banner
  useEffect(() => {
    loadSecurity(false);
    const t = setInterval(() => loadSecurity(true), 8000);
    return () => clearInterval(t);
  }, [lastAlertId]);

  const handleUnblock = async (ip) => {
    try {
      await api.post('/security/unblock', { ip });
      toast.success(`Unblocked ${ip}`);
      loadSecurity(false);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Unblock failed');
    }
  };

  const handleUnlockAccount = async (email) => {
    try {
      await api.post('/security/unlock-account', { email });
      toast.success(`Unlocked ${email} — user may log in again`);
      loadSecurity(false);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Unlock failed');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'feedback') {
        const res = await api.get('/admin/reports-and-feedback');
        setFeedback(res.data.feedback || res.data.reports || res.data || []);
      } else {
        const res = await api.get('/auth/users');
        setUsers(res.data.users || []);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setForm({
      firstName: u.first_name || '',
      lastName: u.last_name || '',
      email: u.email || '',
      phone: u.phone || '',
      password: '',
      confirmPassword: '',
      role: u.role || 'customer',
      status: u.status || 'active',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email) {
      toast.error('First name, last name and email are required');
      return;
    }
    if (!editingId) {
      if (!form.password || form.password.length < 6) {
        toast.error('Password must be at least 6 characters');
        return;
      }
      if (form.password !== form.confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
    } else if (form.password) {
      if (form.password.length < 6) {
        toast.error('Password must be at least 6 characters');
        return;
      }
      if (form.password !== form.confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        role: form.role,
        status: form.status,
      };
      if (form.password) payload.password = form.password;

      if (editingId) {
        await api.put(`/auth/users/${editingId}`, payload);
        toast.success('User updated');
      } else {
        await api.post('/auth/users', payload);
        toast.success('User created');
      }
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (u) => {
    if (u.role === 'admin') {
      toast.error('Cannot delete admin accounts from here');
      return;
    }
    if (!window.confirm(`Delete user "${u.email || u.first_name}" permanently?`)) return;
    try {
      await api.delete(`/auth/users/${u.id}`);
      toast.success('User deleted');
      if (editingId === u.id) resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="inside">
      <div className="page-header">
        <div>
          <h1 className="page-title">🛡️ Admin</h1>
          <p className="page-subtitle">
            {activeTab === 'feedback' ? 'Customer feedback' : 'Add, update and delete users'}
          </p>
        </div>
      </div>

      {/* Security monitoring */}
      <div
        style={{
          marginBottom: 20,
          borderRadius: 12,
          border: '2px solid ' + (secAlerts.length ? '#c0392b' : '#ddd'),
          background: secAlerts.length ? '#fdecea' : '#fff',
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <strong style={{ color: secAlerts.length ? '#c0392b' : '#333' }}>
            🚨 Security monitor {secAlerts.length ? `(${secAlerts.length} recent alerts)` : ''}
          </strong>
          <button type="button" className="btn btn-outline" onClick={() => { setSecurityOpen((v) => !v); loadSecurity(false); }}>
            {securityOpen ? 'Hide' : 'Show'} / Refresh
          </button>
        </div>
        {securityOpen && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 13, color: '#555', marginTop: 0 }}>
              Suspicious activity is logged. Repeat attacks auto-block the IP and email admins. New blocks play an alert sound on this page.
            </p>
            {secAlerts.length > 0 && (
              <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 12 }}>
                {secAlerts.slice(0, 10).map((a) => (
                  <div key={a.id} style={{ fontSize: 13, padding: '8px 0', borderBottom: '1px solid #f0c0c0' }}>
                    <strong>{a.subject || 'Alert'}</strong>
                    <div style={{ color: '#666' }}>
                      IP: {a.ip || '—'} · {a.reason || a.message?.slice?.(0, 80) || ''} · {a.at ? new Date(a.at).toLocaleString() : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <h4 style={{ margin: '8px 0' }}>Locked user accounts ({lockedAccounts.length})</h4>
            <p style={{ fontSize: 12, color: '#666' }}>Wrong password too many times — only that user is blocked. Click Unlock to allow login again.</p>
            {lockedAccounts.length === 0 ? (
              <p style={{ fontSize: 13, color: '#888' }}>No locked accounts</p>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                <table className="custom-table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Reason</th>
                      <th>Locked at</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lockedAccounts.map((u) => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td>{u.reason}</td>
                        <td>{u.locked_at ? new Date(u.locked_at).toLocaleString() : '—'}</td>
                        <td>
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => handleUnlockAccount(u.email)}>
                            Unlock user
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h4 style={{ margin: '8px 0' }}>Blocked IPs ({blockedIps.length})</h4>
            {blockedIps.length === 0 ? (
              <p style={{ fontSize: 13, color: '#888' }}>No active IP blocks</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="custom-table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>IP</th>
                      <th>Reason</th>
                      <th>Blocked at</th>
                      <th>Expires</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {blockedIps.map((b) => (
                      <tr key={b.id}>
                        <td><code>{b.ip}</code></td>
                        <td>{b.reason}</td>
                        <td>{b.blocked_at ? new Date(b.blocked_at).toLocaleString() : '—'}</td>
                        <td>{b.expires_at ? new Date(b.expires_at).toLocaleString() : '—'}</td>
                        <td>
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => handleUnblock(b.ip)}>
                            Unblock
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-wrap"><div className="spinner" /></div>
      ) : activeTab === 'feedback' ? (
        <div className="card">
          <h3 className="card-title">💬 Customer Feedback & Reports</h3>
          {feedback.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💬</div>
              <div className="empty-state-title">No feedback yet</div>
              <div className="empty-state-desc">Customer feedback will appear here</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {feedback.map((item) => (
                <div key={item.id} style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <strong>{item.userFullName || item.username || 'Anonymous'}</strong>
                    <span className="badge badge-active">{item.role || 'Customer'}</span>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text-dark)', lineHeight: '1.6', marginBottom: '10px' }}>
                    "{item.comment || item.text || item.feedback}"
                  </p>
                  <small style={{ color: 'var(--text-muted)' }}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : item.created_at ? new Date(item.created_at).toLocaleString() : 'Recently'}
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { setShowAddForm(true); setEditingId(null); setForm({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '', role: 'customer', status: 'active' }); }}
            >
              + Add User
            </button>
          </div>
          {(showAddForm || editingId) && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 className="card-title">{editingId ? '✏️ Update User' : '➕ Add User'}</h3>
            <form onSubmit={async (e) => { await handleSubmit(e); setShowAddForm(false); }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <input className="form-input" placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
                <input className="form-input" placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
                                <input className="form-input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                <input className="form-input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="customer">Customer</option>
                  <option value="receptionist">Receptionist</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
                <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="inactive">Inactive</option>
                </select>
                                <input className="form-input" type="password" placeholder={editingId ? 'New password (optional)' : 'Password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editingId} />
                <input className="form-input" type="password" placeholder={editingId ? 'Confirm new password' : 'Confirm password'} value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required={!editingId || !!form.password} />
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingId ? 'Update user' : 'Add user'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => { resetForm(); setShowAddForm(false); }}>Cancel</button>
              </div>
            </form>
          </div>
          )}

          <div className="card">
            <h3 className="card-title">👥 Users ({users.length})</h3>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: 24, color: '#888' }}>No users found</td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.first_name} {u.last_name}</td>
                        <td>{u.email || u.username}</td>
                        <td>{u.email}</td>
                        <td><span className="badge badge-active">{u.role}</span></td>
                        <td>{u.status || 'active'}</td>
                        <td>
                          <button type="button" className="btn btn-sm btn-secondary" onClick={() => { startEdit(u); setShowAddForm(true); }}>Edit</button>{' '}
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => handleDelete(u)}>Delete</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
