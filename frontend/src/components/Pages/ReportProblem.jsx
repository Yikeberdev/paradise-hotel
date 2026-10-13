import React, { useState, useContext, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';

/**
 * Customer reports a hotel problem and can view manager responses.
 */
const ReportProblem = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'new' | report id detail

  const loadMyReports = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    try {
      const res = await api.get('/reports/my');
      setReports(res.data.reports || []);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Could not load your reports');
      setReports([]);
    } finally {
      setListLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadMyReports();
  }, [loadMyReports]);

  if (!user) {
    return (
      <div className="inside" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center' }}>
        <h2>Login required</h2>
        <p>Please log in to give suggestions a hotel problem.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/login')}>Go to Login</button>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || title.trim().length < 3) {
      toast.error('Please enter a short title');
      return;
    }
    if (!description.trim() || description.trim().length < 10) {
      toast.error('Please describe the problem (at least 10 characters)');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/reports/submit', {
        title: title.trim(),
        description: description.trim(),
      });
      toast.success(res.data.message || 'sugession submitted.');
      setTitle('');
      setDescription('');
      setView('list');
      await loadMyReports();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit sugession');
    } finally {
      setLoading(false);
    }
  };

  const selected = typeof view === 'number' ? reports.find((r) => r.id === view) : null;

  const statusColor = (s) => {
    const v = String(s || 'open').toLowerCase();
    if (v === 'resolved') return '#27ae60';
    if (v === 'reviewed') return '#2980b9';
    return '#e67e22';
  };

  return (
    <div className="inside" style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1 style={{ color: '#1a1a2e' }}>give suggestions about  Hotel</h1>
      <p style={{ color: '#666' }}>
        Submit issues about rooms, service, cleanliness, staff, or facilities.
        You can also view manager responses to your reports below.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn"
          style={{
            background: view === 'list' ? '#f0a500' : '#eee',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
          onClick={() => setView('list')}
        >
          My suggestions
        </button>
        <button
          type="button"
          className="btn"
          style={{
            background: view === 'new' ? '#f0a500' : '#eee',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
          onClick={() => setView('new')}
        >
          New sugestions
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={loadMyReports}
          style={{ borderRadius: 8, padding: '10px 16px' }}
        >
          Refresh
        </button>
      </div>

      {view === 'new' && (
        <form onSubmit={submit} style={card}>
          <h3 style={{ marginTop: 0 }}>Submit a new report</h3>
          <label style={label}>Title :</label>
          <input
            style={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title of the problem"
            required
          />
          <label style={label}>Description:</label>
          <textarea
            style={{ ...input, minHeight: 120, resize: 'vertical' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened, when, and where..."
            required
          />
          <button
            type="submit"
            disabled={loading}
            style={{ ...btn, background: '#f0a500', color: '#1a1a2e' }}
          >
            {loading ? 'Submitting...' : 'Submit report'}
          </button>
        </form>
      )}

      {view === 'list' && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>My sugession & manager responses</h3>
          {listLoading ? (
            <p style={{ color: '#888' }}>Loading...</p>
          ) : reports.length === 0 ? (
            <p style={{ color: '#888' }}>
              You have not submitted any sugession yet.{' '}
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setView('new')}>
                Create one
              </button>
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reports.map((r) => (
                <div
                  key={r.id}
                  style={{
                    border: '1px solid #eee',
                    borderRadius: 10,
                    padding: 14,
                    background: r.manager_response ? '#f8fff8' : '#fafafa',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 16 }}>{r.title}</strong>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#fff',
                        background: statusColor(r.status),
                        borderRadius: 20,
                        padding: '4px 10px',
                        textTransform: 'capitalize',
                      }}
                    >
                      {r.status || 'open'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                  </div>
                  <p style={{ margin: '10px 0', color: '#333', whiteSpace: 'pre-wrap' }}>{r.description}</p>

                  <div
                    style={{
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 8,
                      background: r.manager_response ? '#e8f5e9' : '#fff3e0',
                      border: `1px solid ${r.manager_response ? '#c8e6c9' : '#ffe0b2'}`,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                      {r.manager_response ? 'Manager response' : 'Manager response'}
                    </div>
                    {r.manager_response ? (
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.manager_response}</p>
                    ) : (
                      <p style={{ margin: 0, color: '#888', fontStyle: 'italic' }}>
                        Waiting for manager response…
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    style={{ marginTop: 10 }}
                    onClick={() => setView(r.id)}
                  >
                    View details
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <div style={card}>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setView('list')} style={{ marginBottom: 12 }}>
            ← Back to list
          </button>
          <h3 style={{ marginTop: 0 }}>{selected.title}</h3>
          <p style={{ fontSize: 13, color: '#888' }}>
            Status: <strong style={{ color: statusColor(selected.status) }}>{selected.status || 'open'}</strong>
            {' · '}
            {selected.created_at ? new Date(selected.created_at).toLocaleString() : ''}
          </p>
          <h4>Your report</h4>
          <p style={{ whiteSpace: 'pre-wrap' }}>{selected.description}</p>
          <h4>Manager response</h4>
          {selected.manager_response ? (
            <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 8, padding: 14 }}>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{selected.manager_response}</p>
            </div>
          ) : (
            <p style={{ color: '#888', fontStyle: 'italic' }}>No response from the manager yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

const card = {
  background: '#fff',
  border: '1px solid #eee',
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
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
const btn = {
  border: 'none',
  borderRadius: 8,
  padding: '10px 16px',
  fontWeight: 700,
  cursor: 'pointer',
};

export default ReportProblem;
