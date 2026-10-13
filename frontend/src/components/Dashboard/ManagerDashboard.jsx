import React, { useState, useEffect, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';

const TABS = [
  { key: 'employees', label: '👥 Employees', icon: '👥' },
  { key: 'rooms', label: '🛏️ Rooms', icon: '🛏️' },
  { key: 'desks', label: '🍽️ Desks', icon: '🍽️' },
  { key: 'foods', label: '🍕 Food', icon: '🍕' },
  { key: 'users', label: '👤 Users', icon: '👤' },
  { key: 'discounts', label: '🏷️ Discounts', icon: '🏷️' },
  { key: 'refunds', label: '💰 Cancellation', icon: '💰' },
  { key: 'reports', label: '📋 Reports', icon: '📋' },
  { key: 'pages', label: '📄 About & Contact', icon: '📄' },
];

const ManagerDashboard = () => {
  const { user } = useContext(AuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') || 'employees';
  const tabMap = {
    'penalties': 'penalties',
    'cancellation': 'penalties',
    'customer-reports': 'customer-reports',
  };
  const [activeTab, setActiveTab] = useState(tabMap[tabFromUrl] || tabFromUrl);

  useEffect(() => {
    const t = searchParams.get('tab') || 'employees';
    setActiveTab(tabMap[t] || t);
    setShowAddForm(false);
    setEditingId(null);
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});

  // Users
  const [employees, setEmployees] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [desks, setDesks] = useState([]);
  const [foods, setFoods] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userHistory, setUserHistory] = useState(null);

  // Discounts
  const [discounts, setDiscounts] = useState([]);
  const [foodCategories, setFoodCategories] = useState([]);
  const [foodItemsForDiscount, setFoodItemsForDiscount] = useState([]);
  const [roomItemsForDiscount, setRoomItemsForDiscount] = useState([]);
  const [deskItemsForDiscount, setDeskItemsForDiscount] = useState([]);
  const [siteContentForm, setSiteContentForm] = useState({
    about_title: '',
    about_body: '',
    about_location_name: '',
    about_address: '',
    about_map_query: '',
    about_extra: '',
    contact_phone: '',
    contact_email: '',
    contact_address: '',
    contact_hours: '',
    contact_extra: '',
  });
  const [savingSite, setSavingSite] = useState(false);
  const [discountForm, setDiscountForm] = useState({
    discountPercentage: '', discountType: 'food', targetCategory: '', targetItemId: '', targetItemName: '',
    startDate: '', endDate: '', startTime: '00:00', endTime: '23:59'
  });

  // Refunds/Cancellations
  const [refunds, setRefunds] = useState([]);
  const [penaltyModal, setPenaltyModal] = useState(null);
  const [penaltyForm, setPenaltyForm] = useState({ penaltyPercentage: 0, refundAmount: '', reason: '' });
  // Reports
  const [report, setReport] = useState(null);
  const [reportTab, setReportTab] = useState('rooms');
  const [reportPage, setReportPage] = useState(0);
  const PAGE_SIZE = 8;

  // Feedback/Reports from customers
  const [customerReports, setCustomerReports] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [penalties, setPenalties] = useState([]);
  const [empForm, setEmpForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '', role: 'receptionist' });
  const [roomForm, setRoomForm] = useState({ roomNumber: '', type: 'Single', price: '', capacity: 2, description: '', amenities: '', image: '', status: 'available' });
  const [foodForm, setFoodForm] = useState({ name: '', category: 'Main Course', price: '', description: '', image: '', availability: 'available', is_hidden: 0 });
  const [deskForm, setDeskForm] = useState({ deskNumber: '', capacity: 2, location: 'Main Hall', price: 0, description: '', image: '', status: 'available' });
  const [roomImageFile, setRoomImageFile] = useState(null);
  const [deskImageFile, setDeskImageFile] = useState(null);
  const [foodImageFile, setFoodImageFile] = useState(null);

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => { fetchTabData(); }, [activeTab]);

  const fetchStats = async () => {
    try {
      const res = await api.get('/manager/stats');
      setStats(res.data.stats || {});
    } catch (e) { console.error(e); }
  };

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

  const fetchTabData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'employees') {
        const res = await api.get('/manager/employees');
        setEmployees(sortByRecent(res.data.employees || []));
      } else if (activeTab === 'rooms') {
        const res = await api.get('/rooms');
        setRooms(sortByRecent((res.data.rooms || []).map(r => ({
          id: r.id, roomNumber: r.room_number, type: r.room_type, price: r.price_per_night,
          capacity: r.capacity, description: r.description, status: r.status
        }))));
      } else if (activeTab === 'desks') {
        const res = await api.get('/desks');
        setDesks(sortByRecent(res.data.desks || []));
      } else if (activeTab === 'foods') {
        const res = await api.get('/food/all');
        setFoods(sortByRecent(res.data.menuItems || res.data.items || res.data || []));
      } else if (activeTab === 'users') {
        const res = await api.get('/manager/users');
        setUsers(sortByRecent(res.data.users || []));
      } else if (activeTab === 'discounts') {
        const res = await api.get('/manager/discounts');
        setDiscounts(sortByRecent(res.data.discounts || []));
        try {
          const menuRes = await api.get('/food/all').catch(() => api.get('/food'));
          const items = menuRes.data.menuItems || menuRes.data.items || menuRes.data.foods || [];
          setFoodItemsForDiscount(items);
          const cats = [...new Set(items.map((x) => x.category).filter(Boolean))];
          setFoodCategories(cats.length ? cats : ['Breakfast', 'Main Course', 'Vegetarian', 'Beverage', 'Dessert', 'International', 'Appetizer']);
        } catch (_) {
          setFoodCategories(['Breakfast', 'Main Course', 'Vegetarian', 'Beverage', 'Dessert', 'International', 'Appetizer']);
        }
        try {
          const roomRes = await api.get('/rooms');
          const rooms = roomRes.data.rooms || roomRes.data || [];
          setRoomItemsForDiscount(Array.isArray(rooms) ? rooms : []);
        } catch (_) { setRoomItemsForDiscount([]); }
        try {
          const deskRes = await api.get('/desks');
          const desks = deskRes.data.desks || deskRes.data || [];
          setDeskItemsForDiscount(Array.isArray(desks) ? desks : []);
        } catch (_) { setDeskItemsForDiscount([]); }
      } else if (activeTab === 'refunds' || activeTab === 'penalties') {
        const [refRes, penRes] = await Promise.all([
          api.get('/manager/refunds/pending').catch(() => ({ data: { refunds: [] } })),
          api.get('/manager/penalties').catch(() => ({ data: { penalties: [] } })),
        ]);
        setRefunds(sortByRecent(refRes.data.refunds || []));
        setPenalties(sortByRecent(penRes.data.penalties || []));
      } else if (activeTab === 'pages') {
        const res = await api.get('/site/content');
        if (res.data?.content) setSiteContentForm((prev) => ({ ...prev, ...res.data.content }));
      } else if (activeTab === 'reports') {
        const res = await api.get('/reports');
        setReport(res.data);
      } else if (activeTab === 'customer-reports') {
        try {
          const res = await api.get('/reports/customer-reports');
          setCustomerReports(sortByRecent(res.data.reports || []));
        } catch (err) {
          console.error(err);
          toast.error(err.response?.data?.message || 'Failed to load customer reports');
          setCustomerReports([]);
        }
      }
    } catch (err) {
      toast.error('Failed to load data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };


  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    try {
      if (!editingId && empForm.password !== empForm.confirmPassword) {
        toast.error('Passwords do not match'); return;
      }
      if (editingId) await api.put(`/manager/employees/${editingId}`, empForm);
      else await api.post('/manager/employees', empForm);
      toast.success(editingId ? 'Employee updated' : 'Employee created');
      setEditingId(null);
      setEmpForm({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '', role: 'receptionist' });
      fetchTabData();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
  };

  const handleSaveRoom = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('roomNumber', roomForm.roomNumber || '');
      fd.append('type', roomForm.type || 'Single');
      fd.append('price', roomForm.price || 0);
      fd.append('capacity', roomForm.capacity || 2);
      fd.append('description', roomForm.description || '');
      fd.append('amenities', roomForm.amenities || '');
      fd.append('status', roomForm.status || 'available');
      if (roomForm.image && !roomImageFile) fd.append('image', roomForm.image);
      if (roomImageFile) fd.append('image', roomImageFile);
      if (editingId) await api.put(`/manager/rooms/${editingId}`, fd);
      else await api.post('/manager/rooms', fd);
      toast.success(editingId ? 'Room updated' : 'Room created');
      setEditingId(null);
      setRoomImageFile(null);
      setRoomForm({ roomNumber: '', type: 'Single', price: '', capacity: 2, description: '', amenities: '', image: '', status: 'available' });
      fetchTabData();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
  };

  const handleSaveFood = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('name', foodForm.name || '');
      fd.append('category', foodForm.category || 'Main Course');
      fd.append('price', foodForm.price || 0);
      fd.append('description', foodForm.description || '');
      fd.append('availability', foodForm.availability || 'available');
      fd.append('is_hidden', foodForm.is_hidden ? 1 : 0);
      if (foodForm.image && !foodImageFile) fd.append('image', foodForm.image);
      if (foodImageFile) fd.append('image', foodImageFile);
      if (editingId) await api.put(`/manager/food/${editingId}`, fd);
      else await api.post('/manager/food', fd);
      toast.success(editingId ? 'Food updated' : 'Food created');
      setEditingId(null);
      setFoodImageFile(null);
      setFoodForm({ name: '', category: 'Main Course', price: '', description: '', image: '', availability: 'available', is_hidden: 0 });
      fetchTabData();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
  };

  const handleSaveDesk = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('deskNumber', deskForm.deskNumber || '');
      fd.append('capacity', deskForm.capacity || 2);
      fd.append('location', deskForm.location || 'Main Hall');
      fd.append('price', deskForm.price || 0);
      fd.append('description', deskForm.description || '');
      fd.append('status', deskForm.status || 'available');
      if (deskForm.image && !deskImageFile) fd.append('image', deskForm.image);
      if (deskImageFile) fd.append('image', deskImageFile);
      if (editingId) await api.put(`/manager/desks/${editingId}`, fd);
      else await api.post('/manager/desks', fd);
      toast.success(editingId ? 'Desk updated' : 'Desk created');
      setEditingId(null);
      setDeskImageFile(null);
      setDeskForm({ deskNumber: '', capacity: 2, location: 'Main Hall', price: 0, description: '', image: '', status: 'available' });
      fetchTabData();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
  };

  const handleDeleteMgr = async (kind, id) => {
    if (!window.confirm('Delete this item?')) return;
    try {
      const map = { employees: `/manager/employees/${id}`, rooms: `/manager/rooms/${id}`, desks: `/manager/desks/${id}`, food: `/manager/food/${id}` };
      await api.delete(map[kind]);
      toast.success('Deleted');
      fetchTabData();
    } catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  const toggleFoodHidden = async (item) => {
    const nextHidden = item.is_hidden ? 0 : 1;
    try {
      // Primary: dedicated visibility endpoint
      await api.put(`/food/menu/${item.id}/visibility`, { hidden: !!nextHidden });
      toast.success(nextHidden ? 'Food hidden from customers' : 'Food visible to customers');
      fetchTabData();
    } catch (err1) {
      try {
        // Fallback: manager food update
        await api.put(`/manager/food/${item.id}`, {
          is_hidden: nextHidden,
          availability: item.availability || 'available',
          name: item.item_name || item.name,
          category: item.category,
          price: item.price,
          description: item.description,
          image: item.image,
        });
        toast.success(nextHidden ? 'Food hidden from customers' : 'Food visible to customers');
        fetchTabData();
      } catch (err2) {
        toast.error(err2.response?.data?.message || err1.response?.data?.message || 'Failed to update visibility');
      }
    }
  };

  const handleStatusChange = async (userId, status) => {
    try {
      await api.put(`/manager/users/${userId}/status`, { status });
      toast.success(`User status updated to ${status}`);
      fetchTabData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  const viewUserHistory = async (usr) => {
    try {
      const res = await api.get(`/manager/users/${usr.id}/history`);
      setUserHistory(res.data);
      setSelectedUser(usr);
    } catch (err) {
      toast.error('Failed to load history');
    }
  };

  const handleCreateDiscount = async (e) => {
    e.preventDefault();
    try {
      if (['food', 'room', 'desk'].includes(discountForm.discountType) && !discountForm.targetItemId) {
        toast.error('Please select a specific item from the database for this discount');
        return;
      }
      await api.post('/manager/discounts', {
        ...discountForm,
        targetItemId: discountForm.targetItemId || null,
        targetItemName: discountForm.targetItemName || null,
      });
      toast.success('Discount created. Customers can open it from the Discounts link when it is active.');
      setDiscountForm({ discountPercentage: '', discountType: 'food', targetCategory: '', targetItemId: '', targetItemName: '', startDate: '', endDate: '', startTime: '00:00', endTime: '23:59' });
      fetchTabData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create discount');
    }
  };

  const handleDeleteDiscount = async (id) => {
    if (!window.confirm('Delete this discount?')) return;
    try {
      await api.delete(`/manager/discounts/${id}`);
      toast.success('Discount deleted');
      fetchTabData();
    } catch (err) {
      toast.error('Failed to delete discount');
    }
  };

  const handleSaveSiteContent = async (e) => {
    e.preventDefault();
    setSavingSite(true);
    try {
      const res = await api.put('/site/content', siteContentForm);
      toast.success(res.data.message || 'About & Contact updated');
      if (res.data.content) setSiteContentForm((prev) => ({ ...prev, ...res.data.content }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save pages');
    } finally {
      setSavingSite(false);
    }
  };


  const openPenaltyModal = (refund) => {
    const penaltyAmt = (refund.original_amount * (refund.penalty_percentage || 0)) / 100;
    setPenaltyModal(refund);
    setPenaltyForm({
      penaltyPercentage: refund.penalty_percentage || 0,
      refundAmount: (refund.original_amount - penaltyAmt).toFixed(2),
      reason: ''
    });
  };

  const calcRefundAmount = (originalAmount, penaltyPct) => {
    const penalty = Math.min(100, Math.max(0, Number(penaltyPct)));
    return (originalAmount * (1 - penalty / 100)).toFixed(2);
  };

  const handlePenaltyChange = (field, value) => {
    const updated = { ...penaltyForm, [field]: value };
    if (field === 'penaltyPercentage' && penaltyModal) {
      updated.refundAmount = calcRefundAmount(penaltyModal.original_amount, value);
    }
    setPenaltyForm(updated);
  };

  const handleProcessRefund = async (action) => {
    try {
      await api.post(`/manager/refunds/${penaltyModal.id}/process`, {
        action,
        penaltyPercentage: penaltyForm.penaltyPercentage,
        refundAmount: penaltyForm.refundAmount,
        reason: penaltyForm.reason
      });
      toast.success(`Refund ${action === 'approve' ? 'approved' : 'rejected'} — customer notified`);
      setPenaltyModal(null);
      fetchTabData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };
  const statusBadge = (status) => {
    const map = { active: 'badge-active', suspended: 'badge-rejected', inactive: 'badge-inactive', pending: 'badge-pending', approved: 'badge-available', rejected: 'badge-rejected' };
    return <span className={`badge ${map[status] || 'badge-pending'}`}>{status}</span>;
  };

  const fmt = (v) => v ? new Date(v).toLocaleString() : '—';
  const fmtDate = (v) => v ? new Date(v).toLocaleDateString() : '—';

  const reportRows = report ? (report[reportTab] || []) : [];
  const totalPages = Math.max(1, Math.ceil(reportRows.length / PAGE_SIZE));
  const pagedRows = reportRows.slice(reportPage * PAGE_SIZE, (reportPage + 1) * PAGE_SIZE);

  return (
    <div className="inside">
      <div className="page-header">
        <div>
          <h1 className="page-title">🏨 Manager Dashboard</h1>
          <p className="page-subtitle">User management and perform all manager operations overview</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '28px' }}>
        {[
          { icon: '🏨', label: 'Total Rooms', value: stats.totalRooms || 0 },
          { icon: '✅', label: 'Available', value: stats.availableRooms || 0 },
          { icon: '📋', label: 'Reservations', value: stats.totalReservations || 0 },
          { icon: '👤', label: 'Customers', value: stats.totalCustomers || 0 },
          { icon: '💰', label: 'Revenue', value: `${Number(stats.totalRevenue || 0).toLocaleString()} ETB` },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-info">
              <div className="stat-value" style={{ fontSize: '20px' }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation via Sidebar only */}

      {loading ? <div className="loading-wrap"><div className="spinner" /></div> : (
        <>

          {/* ====== EMPLOYEES ====== */}
          {activeTab === 'employees' && (
            <div className="card">
              <h3 className="card-title">👥 Employees</h3>
              <div style={{ marginBottom: 12 }}>
                <button type="button" className="btn btn-primary" onClick={() => { setShowAddForm(true); setEditingId(null); setEmpForm({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '', role: 'receptionist' }); }}>
                  + Add Employee
                </button>
              </div>
              {(showAddForm || editingId) && (
                <form onSubmit={async (e) => { await handleSaveEmployee(e); setShowAddForm(false); }} className="form-grid" style={{ marginBottom: 20 }}>


                  <input style={{ marginLeft: '0px', paddingLeft: '0px' }} className="form-input" placeholder="First name" value={empForm.firstName} onChange={e => setEmpForm({ ...empForm, firstName: e.target.value })} required />
                  <input className="form-input" placeholder="Last name" value={empForm.lastName} onChange={e => setEmpForm({ ...empForm, lastName: e.target.value })} required />
                  <input className="form-input" type="email" placeholder="Email" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} required />
                  <input className="form-input" placeholder="Phone" value={empForm.phone} onChange={e => setEmpForm({ ...empForm, phone: e.target.value })} />

                  <select className="form-select" value={empForm.role} onChange={e => setEmpForm({ ...empForm, role: e.target.value })}>
                    <option value="receptionist">Receptionist</option>
                    <option value="manager">Manager</option>
                  </select>
                  {!editingId && <>
                    <input className="form-input" type="password" placeholder="Password" value={empForm.password} onChange={e => setEmpForm({ ...empForm, password: e.target.value })} required />
                    <input className="form-input" type="password" placeholder="Confirm password" value={empForm.confirmPassword} onChange={e => setEmpForm({ ...empForm, confirmPassword: e.target.value })} required />

                  </>}<br></br>


                  <button type="submit" className="btn btn-primary">{editingId ? 'Update' : 'Add'} Employee</button>
                  <button type="button" className="btn btn-outline" onClick={() => { setEditingId(null); setShowAddForm(false); }}>Cancel</button>

                </form>
              )}
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Actions</th></tr></thead>
                  <tbody>
                    {employees.map(emp => (
                      <tr key={emp.id}>
                        <td>{emp.full_name || emp.fullName || `${emp.first_name || ''} ${emp.last_name || ''}`}</td>
                        <td>{emp.email}</td>
                        <td>{emp.role || emp.position}</td>
                        <td>{emp.phone}</td>
                        <td>
                          <button className="btn btn-sm btn-secondary" onClick={() => {
                            setEditingId(emp.id); setShowAddForm(true);
                            setEmpForm({
                              firstName: emp.first_name || '', lastName: emp.last_name || '',
                              username: emp.username || '', email: emp.email || '', phone: emp.phone || '',
                              password: '', confirmPassword: '', role: emp.role || 'receptionist', address: emp.address || ''
                            });
                          }}>Edit</button>{' '}
                          <button className="btn btn-sm btn-danger" onClick={() => handleDeleteMgr('employees', emp.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ====== ROOMS ====== */}
          {activeTab === 'rooms' && (
            <div className="card">
              <h3 className="card-title">🛏️ Rooms</h3>
              <div style={{ marginBottom: 12 }}>
                <button type="button" className="btn btn-primary" onClick={() => { setShowAddForm(true); setEditingId(null); }}>
                  + Add Room
                </button>
              </div>
              {(showAddForm || editingId) && (
                <form onSubmit={async (e) => { await handleSaveRoom(e); setShowAddForm(false); }} className="form-grid" style={{ marginBottom: 20 }}>
                  <input className="form-input" placeholder="Room number" value={roomForm.roomNumber} onChange={e => setRoomForm({ ...roomForm, roomNumber: e.target.value })} required />
                  <select className="form-select" value={roomForm.type} onChange={e => setRoomForm({ ...roomForm, type: e.target.value })}>
                    {['Single', 'Double', 'Twin', 'Suite', 'Family', 'Deluxe'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input className="form-input" type="number" placeholder="Price/night" value={roomForm.price} onChange={e => setRoomForm({ ...roomForm, price: e.target.value })} required />
                  <input className="form-input" type="number" placeholder="Capacity" value={roomForm.capacity} onChange={e => setRoomForm({ ...roomForm, capacity: e.target.value })} />
                  <select className="form-select" value={roomForm.status} onChange={e => setRoomForm({ ...roomForm, status: e.target.value })}>
                    <option value="available">available</option>
                    <option value="booked">booked</option>
                    <option value="maintenance">maintenance</option>
                  </select>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Room image (upload)</label>
                  <input className="form-input" type="file" accept="image/*" onChange={e => setRoomImageFile(e.target.files?.[0] || null)} />
                  {roomForm.image ? <small style={{ color: '#666' }}>Current: {roomForm.image}</small> : null}
                  <input className="form-input" placeholder="Or image URL (optional)" value={roomForm.image} onChange={e => setRoomForm({ ...roomForm, image: e.target.value })} />
                  <input className="form-input" placeholder="Amenities" value={roomForm.amenities} onChange={e => setRoomForm({ ...roomForm, amenities: e.target.value })} />
                  <textarea className="form-textarea" placeholder="Description" value={roomForm.description} onChange={e => setRoomForm({ ...roomForm, description: e.target.value })} />
                  <button type="submit" className="btn btn-primary">{editingId ? 'Update' : 'Add'} Room</button>
                  <button type="button" className="btn btn-outline" onClick={() => { setEditingId(null); setShowAddForm(false); }}>Cancel</button>
                </form>
              )}
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>#</th><th>Type</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {rooms.map(r => (
                      <tr key={r.id}>
                        <td>{r.roomNumber || r.room_number}</td>
                        <td>{r.type || r.room_type}</td>
                        <td>{r.price || r.price_per_night}</td>
                        <td>{r.status}</td>
                        <td>
                          <button className="btn btn-sm btn-secondary" onClick={() => {
                            setEditingId(r.id); setShowAddForm(true);
                            setRoomForm({
                              roomNumber: r.roomNumber || r.room_number || '', type: r.type || r.room_type || 'Single',
                              price: r.price || r.price_per_night || '', capacity: r.capacity || 2,
                              description: r.description || '', amenities: r.amenities || '', image: r.image || '', status: r.status || 'available'
                            });
                          }}>Edit</button>{' '}
                          <button className="btn btn-sm btn-danger" onClick={() => handleDeleteMgr('rooms', r.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ====== DESKS ====== */}
          {activeTab === 'desks' && (
            <div className="card">
              <h3 className="card-title">🍽️ Desks</h3>
              <div style={{ marginBottom: 12 }}>
                <button type="button" className="btn btn-primary" onClick={() => { setShowAddForm(true); setEditingId(null); }}>+ Add Desk</button>
              </div>
              {(showAddForm || editingId) && (
                <form onSubmit={async (e) => { await handleSaveDesk(e); setShowAddForm(false); }} className="form-grid" style={{ marginBottom: 20 }}>
                  <input className="form-input" placeholder="Desk number" value={deskForm.deskNumber} onChange={e => setDeskForm({ ...deskForm, deskNumber: e.target.value })} required />
                  <input className="form-input" type="number" placeholder="Capacity" value={deskForm.capacity} onChange={e => setDeskForm({ ...deskForm, capacity: e.target.value })} />
                  <input className="form-input" placeholder="Location" value={deskForm.location} onChange={e => setDeskForm({ ...deskForm, location: e.target.value })} />
                  <input className="form-input" type="number" placeholder="Price/hr" value={deskForm.price} onChange={e => setDeskForm({ ...deskForm, price: e.target.value })} />
                  <select className="form-select" value={deskForm.status} onChange={e => setDeskForm({ ...deskForm, status: e.target.value })}>
                    <option value="available">available</option>
                    <option value="reserved">reserved</option>
                  </select>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Desk image (upload)</label>
                  <input className="form-input" type="file" accept="image/*" onChange={e => setDeskImageFile(e.target.files?.[0] || null)} />
                  {deskForm.image ? <small style={{ color: '#666' }}>Current: {deskForm.image}</small> : null}
                  <input className="form-input" placeholder="Or image URL (optional)" value={deskForm.image} onChange={e => setDeskForm({ ...deskForm, image: e.target.value })} />
                  <button type="submit" className="btn btn-primary">{editingId ? 'Update' : 'Add'} Desk</button>
                  <button type="button" className="btn btn-outline" onClick={() => { setEditingId(null); setShowAddForm(false); }}>Cancel</button>
                </form>
              )}
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>#</th><th>Location</th><th>Cap</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {desks.map(d => (
                      <tr key={d.id}>
                        <td>{d.desk_number || d.deskNumber}</td>
                        <td>{d.location}</td>
                        <td>{d.capacity}</td>
                        <td>{d.price}</td>
                        <td>{d.status}</td>
                        <td>
                          <button className="btn btn-sm btn-secondary" onClick={() => {
                            setEditingId(d.id); setShowAddForm(true);
                            setDeskForm({
                              deskNumber: d.desk_number || '', capacity: d.capacity || 2, location: d.location || '',
                              price: d.price || 0, description: d.description || '', image: d.image || '', status: d.status || 'available'
                            });
                          }}>Edit</button>{' '}
                          <button className="btn btn-sm btn-danger" onClick={() => handleDeleteMgr('desks', d.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ====== FOODS ====== */}
          {activeTab === 'foods' && (
            <div className="card">
              <h3 className="card-title">🍕 Food Menu </h3>
              <div style={{ marginBottom: 12 }}>
                <button type="button" className="btn btn-primary" onClick={() => { setShowAddForm(true); setEditingId(null); }}>+ Add Food</button>
              </div>
              {(showAddForm || editingId) && (
                <form onSubmit={async (e) => { await handleSaveFood(e); setShowAddForm(false); }} className="form-grid" style={{ marginBottom: 20 }}>
                  <input className="form-input" placeholder="Item name" value={foodForm.name} onChange={e => setFoodForm({ ...foodForm, name: e.target.value })} required />
                  <select className="form-select" value={foodForm.category} onChange={e => setFoodForm({ ...foodForm, category: e.target.value })}>
                    {['Breakfast', 'Main Course', 'Vegetarian', 'Beverage', 'Dessert', 'International', 'Appetizer'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input className="form-input" type="number" placeholder="Price" value={foodForm.price} onChange={e => setFoodForm({ ...foodForm, price: e.target.value })} required />
                  <select className="form-select" value={foodForm.availability} onChange={e => setFoodForm({ ...foodForm, availability: e.target.value })}>
                    <option value="available">available</option>
                    <option value="unavailable">unavailable</option>
                  </select>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Food image (upload)</label>
                  <input className="form-input" type="file" accept="image/*" onChange={e => setFoodImageFile(e.target.files?.[0] || null)} />
                  {foodForm.image ? <small style={{ color: '#666' }}>Current: {foodForm.image}</small> : null}
                  <input className="form-input" placeholder="Or image URL (optional)" value={foodForm.image} onChange={e => setFoodForm({ ...foodForm, image: e.target.value })} />
                  <textarea className="form-textarea" placeholder="Description" value={foodForm.description} onChange={e => setFoodForm({ ...foodForm, description: e.target.value })} />
                  <button type="submit" className="btn btn-primary">{editingId ? 'Update' : 'Add'} Food</button>
                  <button type="button" className="btn btn-outline" onClick={() => { setEditingId(null); setShowAddForm(false); }}>Cancel</button>
                </form>
              )}
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Availability</th><th>Hidden</th><th>Actions</th></tr></thead>
                  <tbody>
                    {foods.map(f => (
                      <tr key={f.id}>
                        <td>{f.item_name || f.name}</td>
                        <td>{f.category}</td>
                        <td>{f.price}</td>
                        <td>{f.availability}</td>
                        <td>{f.is_hidden ? 'Yes' : 'No'}</td>
                        <td>
                          <button className="btn btn-sm btn-secondary" onClick={() => {
                            setEditingId(f.id); setShowAddForm(true);
                            setFoodForm({
                              name: f.item_name || f.name || '', category: f.category || 'Main Course', price: f.price || '',
                              description: f.description || '', image: f.image || '', availability: f.availability || 'available', is_hidden: f.is_hidden || 0
                            });
                          }}>Edit</button>{' '}
                          <button className="btn btn-sm btn-outline" onClick={() => toggleFoodHidden(f)}>
                            {f.is_hidden ? 'Show' : 'Hide'}
                          </button>{' '}
                          <button className="btn btn-sm btn-danger" onClick={() => handleDeleteMgr('food', f.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {/* ====== USERS TAB ====== */}
          {activeTab === 'users' && !selectedUser && (
            <div className="card">
              <h3 className="card-title">👤 Customer User Management</h3>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr>
                    <th>Name</th><th>Username</th><th>Email</th><th>Status</th>
                    <th>Last Login</th><th>Last Active</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No customers found</td></tr>
                    ) : users.map(u => (
                      <tr key={u.id}>
                        <td><strong>{u.first_name} {u.last_name}</strong></td>
                        <td>{u.username}</td>
                        <td>{u.email}</td>
                        <td>{statusBadge(u.status || 'active')}</td>
                        <td style={{ fontSize: '12px' }}>{fmt(u.last_login)}</td>
                        <td style={{ fontSize: '12px' }}>{fmt(u.last_active)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <select className="form-select" style={{ padding: '4px 8px', fontSize: '12px', width: 'auto' }}
                              value={u.status || 'active'}
                              onChange={ev => handleStatusChange(u.id, ev.target.value)}>
                              <option value="active">Active</option>
                              <option value="suspended">Suspended</option>
                              <option value="inactive">Inactive</option>
                            </select>
                            <button className="btn btn-sm btn-secondary" onClick={() => viewUserHistory(u)}>History</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* User History */}
          {activeTab === 'users' && selectedUser && userHistory && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 className="card-title" style={{ margin: 0 }}>
                  📋 History for {selectedUser.first_name} {selectedUser.last_name}
                </h3>
                <button className="btn btn-outline btn-sm" onClick={() => setSelectedUser(null)}>← Back</button>
              </div>
              <div className="tabs" style={{ marginBottom: '20px' }}>
                {['roomReservations', 'deskReservations', 'foodOrders', 'payments'].map(k => (
                  <button key={k} className="tab-btn" onClick={() => { }}>
                    {k === 'roomReservations' ? '🛌 Rooms' : k === 'deskReservations' ? '🪑 Desks' : k === 'foodOrders' ? '🍕 Food' : '💳 Payments'}
                    <span style={{ fontSize: '10px', marginLeft: '4px' }}>({(userHistory[k] || []).length})</span>
                  </button>
                ))}
              </div>
              {['roomReservations', 'deskReservations', 'foodOrders', 'payments'].map(key => (
                userHistory[key] && userHistory[key].length > 0 && (
                  <div key={key} style={{ marginBottom: '24px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '10px', color: 'var(--primary)' }}>
                      {key === 'roomReservations' ? '🛌 Room Reservations' : key === 'deskReservations' ? '🪑 Desk Reservations' : key === 'foodOrders' ? '🍕 Food Orders' : '💳 Payments'}
                    </h4>
                    <div className="table-wrapper">
                      <table className="table">
                        <thead><tr>
                          <th>ID</th><th>Date</th><th>Amount</th><th>Status</th><th>Payment</th>
                        </tr></thead>
                        <tbody>
                          {userHistory[key].slice(0, 5).map(r => (
                            <tr key={r.id}>
                              <td>#{r.id}</td>
                              <td style={{ fontSize: '12px' }}>{fmtDate(r.reservation_date || r.check_in_date || r.order_date || r.transaction_date)}</td>
                              <td><strong>{Number(r.total_price || r.amount || r.total_amount || 0).toFixed(2)} ETB</strong></td>
                              <td>{statusBadge(r.status)}</td>
                              <td>{statusBadge(r.payment_status || 'pending')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

          {/* ====== DISCOUNTS TAB ====== */}
          {activeTab === 'discounts' && (
            <div className="card">
              <h3 className="card-title">🏷️ Create New Discount</h3>
              <form onSubmit={handleCreateDiscount} style={{ background: 'var(--bg-main)', padding: '20px', borderRadius: '12px', marginBottom: '24px' }}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Discount % <span className="required">*</span></label>
                    <input type="number" className="form-input" placeholder="e.g. 15" min="1" max="100"
                      value={discountForm.discountPercentage}
                      onChange={e => setDiscountForm({ ...discountForm, discountPercentage: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Discount Type <span className="required">*</span></label>
                    <select className="form-select" value={discountForm.discountType}
                      onChange={e => setDiscountForm({ ...discountForm, discountType: e.target.value })}>
                      <option value="food">Food</option>
                      <option value="room">Room</option>
                      <option value="desk">Desk</option>
                      <option value="all">All Services</option>
                    </select>
                  </div>
                  {discountForm.discountType === 'food' && (
                    <div className="form-group">
                      <label className="form-label">Food category</label>
                      <select
                        className="form-select"
                        value={discountForm.targetCategory}
                        onChange={e => setDiscountForm({ ...discountForm, targetCategory: e.target.value, targetItemId: '', targetItemName: '' })}
                      >
                        <option value="">All categories</option>
                        {(foodCategories.length
                          ? foodCategories
                          : ['Breakfast', 'Main Course', 'Vegetarian', 'Beverage', 'Dessert', 'International', 'Appetizer']
                        ).map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {discountForm.discountType === 'food' && (
                    <div className="form-group">
                      <label className="form-label">Specific food item <span className="required">*</span></label>
                      <select
                        className="form-select"
                        value={discountForm.targetItemId || ''}
                        onChange={e => {
                          const id = e.target.value;
                          const item = (foodItemsForDiscount || []).find((f) => String(f.id) === String(id));
                          setDiscountForm({
                            ...discountForm,
                            targetItemId: id,
                            targetItemName: item ? (item.item_name || item.name) : '',
                            targetCategory: item?.category || discountForm.targetCategory,
                          });
                        }}
                        required
                      >
                        <option value="">Select food item…</option>
                        {(foodItemsForDiscount || [])
                          .filter((f) => !discountForm.targetCategory || f.category === discountForm.targetCategory)
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {(f.item_name || f.name)} — ETB {Number(f.price).toFixed(2)} ({f.category})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                  {discountForm.discountType === 'room' && (
                    <div className="form-group">
                      <label className="form-label">Specific room <span className="required">*</span></label>
                      <select
                        className="form-select"
                        value={discountForm.targetItemId || ''}
                        onChange={e => {
                          const id = e.target.value;
                          const item = (roomItemsForDiscount || []).find((r) => String(r.id) === String(id));
                          setDiscountForm({
                            ...discountForm,
                            targetItemId: id,
                            targetItemName: item ? `Room ${item.room_number} (${item.room_type})` : '',
                            targetCategory: item?.room_type || '',
                          });
                        }}
                        required
                      >
                        <option value="">Select room…</option>
                        {(roomItemsForDiscount || []).map((r) => (
                          <option key={r.id} value={r.id}>
                            Room {r.room_number} — {r.room_type} — ETB {Number(r.price_per_night || r.price || 0).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {discountForm.discountType === 'desk' && (
                    <div className="form-group">
                      <label className="form-label">Specific desk <span className="required">*</span></label>
                      <select
                        className="form-select"
                        value={discountForm.targetItemId || ''}
                        onChange={e => {
                          const id = e.target.value;
                          const item = (deskItemsForDiscount || []).find((d) => String(d.id) === String(id));
                          setDiscountForm({
                            ...discountForm,
                            targetItemId: id,
                            targetItemName: item ? `Desk ${item.desk_number}` : '',
                            targetCategory: item?.location || 'desk',
                          });
                        }}
                        required
                      >
                        <option value="">Select desk…</option>
                        {(deskItemsForDiscount || []).map((d) => (
                          <option key={d.id} value={d.id}>
                            Desk {d.desk_number}{d.location ? ` — ${d.location}` : ''} — ETB {Number(d.price || 0).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Start Date <span className="required">*</span></label>
                    <input type="date" className="form-input" value={discountForm.startDate}
                      onChange={e => setDiscountForm({ ...discountForm, startDate: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Date <span className="required">*</span></label>
                    <input type="date" className="form-input" value={discountForm.endDate}
                      onChange={e => setDiscountForm({ ...discountForm, endDate: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Start Time</label>
                    <input type="time" className="form-input" value={discountForm.startTime}
                      onChange={e => setDiscountForm({ ...discountForm, startTime: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Time</label>
                    <input type="time" className="form-input" value={discountForm.endTime}
                      onChange={e => setDiscountForm({ ...discountForm, endTime: e.target.value })} />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ marginTop: '12px' }}>🏷️ Create Discount</button>
              </form>

              <h4 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '14px' }}>Active Discounts ({discounts.length})</h4>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr>
                    <th>%</th><th>Type</th><th>Target</th><th>Valid Period</th><th>Status</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {discounts.length === 0 ? (
                      <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>No discounts yet</td></tr>
                    ) : discounts.map(d => (
                      <tr key={d.id}>
                        <td><strong style={{ color: 'var(--accent)', fontSize: '18px' }}>{d.discount_percentage}%</strong></td>
                        <td><span className="badge badge-reserved">{d.discount_type}</span></td>
                        <td>{d.target_item_name || d.target_category || 'All'}{d.target_item_id ? ` (#${d.target_item_id})` : ''}</td>
                        <td style={{ fontSize: '12px' }}>
                          {d.start_date?.slice(0, 10)} {d.start_time?.slice(0, 5)}<br />
                          to {d.end_date?.slice(0, 10)} {d.end_time?.slice(0, 5)}
                        </td>
                        <td>{d.is_active ? <span className="badge badge-active">Active</span> : <span className="badge badge-inactive">Inactive</span>}</td>
                        <td>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDeleteDiscount(d.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ====== REFUNDS / CANCELLATION PENALTY TAB ====== */}
          {activeTab === 'refunds' && (
            <div className="card">
              <h3 className="card-title">💰 Cancellation & Refund Requests</h3>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr>
                    <th>Customer</th><th>Type</th><th>Original</th><th>Penalty %</th><th>Refund</th><th>Reason</th><th>Date</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {refunds.length === 0 ? (
                      <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>No pending refunds</td></tr>
                    ) : refunds.map(r => (
                      <tr key={r.id}>
                        <td><strong>{r.first_name} {r.last_name}</strong></td>
                        <td><span className="badge badge-reserved">{r.reservation_type}</span></td>
                        <td>{Number(r.original_amount).toFixed(2)} ETB</td>
                        <td>{r.penalty_percentage}%</td>
                        <td><strong style={{ color: 'var(--success)' }}>{Number(r.refund_amount).toFixed(2)} ETB</strong></td>
                        <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.reason}</td>
                        <td style={{ fontSize: '12px' }}>{fmtDate(r.created_at)}</td>
                        <td>
                          <button className="btn btn-sm btn-primary" onClick={() => openPenaltyModal(r)}>Process</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {/* ====== CANCELLATION PENALTIES ====== */}
          {(activeTab === 'penalties' || activeTab === 'refunds') && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 className="card-title">💰 Cancellation penalties by type (%)</h3>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Type</th><th>Penalty %</th><th>Action</th></tr></thead>
                  <tbody>
                    {(['room', 'desk', 'food']).map(type => {
                      const row = (penalties || []).find(p => p.reservation_type === type) || { penalty_percentage: 10 };
                      return (
                        <tr key={type}>
                          <td style={{ textTransform: 'capitalize' }}>{type}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              defaultValue={row.penalty_percentage}
                              id={`penalty-${type}`}
                              className="form-input"
                              style={{ width: 100 }}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={async () => {
                                const el = document.getElementById(`penalty-${type}`);
                                const percentage = Number(el?.value);
                                try {
                                  await api.put(`/manager/penalties/${type}`, { percentage });
                                  toast.success(`${type} penalty set to ${percentage}%`);
                                  const res = await api.get('/manager/penalties');
                                  setPenalties(res.data.penalties || []);
                                } catch (err) {
                                  toast.error(err.response?.data?.message || 'Update failed');
                                }
                              }}
                            >
                              Save
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ====== CUSTOMER REPORTS ====== */}
          {activeTab === 'customer-reports' && (
            <div className="card">
              <h3 className="card-title">⚠️ Customer Reports</h3>
              {(customerReports || []).length === 0 ? (
                <p style={{ color: '#888' }}>No customer reports found.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="table">
                    <thead><tr><th>Customer</th><th>Title</th><th>Description</th><th>Status</th><th>Date</th><th>Response</th></tr></thead>
                    <tbody>
                      {customerReports.map(r => (
                        <tr key={r.id}>
                          <td><strong>{[r.first_name, r.last_name].filter(Boolean).join(' ') || r.username || '—'}</strong>
                            <div style={{ fontSize: 12, color: '#666' }}>{r.email || r.user_email || ''}</div>
                          </td>
                          <td>{r.title}</td>
                          <td style={{ maxWidth: 280 }}>{r.description}</td>
                          <td>{r.status || 'open'}</td>
                          <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              onClick={async () => {
                                const managerResponse = window.prompt('Write your response to the customer:', r.manager_response || '');
                                if (managerResponse === null) return;
                                if (!String(managerResponse).trim()) {
                                  toast.error('Please enter a response for the customer');
                                  return;
                                }
                                const statusChoice = window.prompt('Status: open / reviewed / resolved', r.status || 'reviewed');
                                if (statusChoice === null) return;
                                const status = ['open', 'reviewed', 'resolved'].includes(String(statusChoice).toLowerCase().trim())
                                  ? String(statusChoice).toLowerCase().trim()
                                  : 'reviewed';
                                try {
                                  await api.put(`/reports/customer-reports/${r.id}`, { status, managerResponse: String(managerResponse).trim() });
                                  toast.success('Response sent to customer');
                                  const res = await api.get('/reports/customer-reports');
                                  setCustomerReports(res.data.reports || []);
                                } catch (err) {
                                  toast.error(err.response?.data?.message || 'Failed to save response');
                                }
                              }}
                            >
                              Respond
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
          {/* ====== REPORTS TAB ====== */}
          {activeTab === 'reports' && report && (
            <div className="card">
              <h3 className="card-title">📋 Operations Report</h3>
              {report.summary && (
                <div className="stats-grid" style={{ marginBottom: '20px' }}>
                  {[
                    { label: 'Room Reservations', value: report.summary.totalRoomReservations },
                    { label: 'Desk Reservations', value: report.summary.totalDeskReservations },
                    { label: 'Food Orders', value: report.summary.totalFoodOrders },
                    { label: 'Completed Payments', value: report.summary.completedPayments },
                    { label: 'Total Revenue', value: `${Number(report.summary.totalRevenue || 0).toLocaleString()} ETB` },
                  ].map((s, i) => (
                    <div key={i} className="stat-card" style={{ padding: '14px' }}>
                      <div className="stat-info">
                        <div className="stat-value" style={{ fontSize: '18px' }}>{s.value}</div>
                        <div className="stat-label">{s.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="tabs" style={{ marginBottom: '16px' }}>
                {['rooms', 'desks', 'food', 'payments'].map(t => (
                  <button key={t} className={`tab-btn ${reportTab === t ? 'active' : ''}`}
                    onClick={() => { setReportTab(t); setReportPage(0); }}>
                    {t === 'rooms' ? '🛏️ Rooms' : t === 'desks' ? '🪑 Desks' : t === 'food' ? '🍕 Food' : '💳 Payments'}
                  </button>
                ))}
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    {reportTab === 'rooms' && <tr><th>ID</th><th>Room</th><th>Guest</th><th>Check-In</th><th>Check-Out</th><th>Total</th><th>Status</th><th>Payment</th></tr>}
                    {reportTab === 'desks' && <tr><th>ID</th><th>Desk</th><th>Guest</th><th>Date</th><th>Duration</th><th>Amount</th><th>Status</th><th>Payment</th></tr>}
                    {reportTab === 'food' && <tr><th>ID</th><th>Guest</th><th>Type</th><th>Amount</th><th>Status</th><th>Payment</th><th>Date</th></tr>}
                    {reportTab === 'payments' && <tr><th>Ref</th><th>Guest</th><th>Type</th><th>Method</th><th>Amount</th><th>Status</th><th>Date</th></tr>}
                  </thead>
                  <tbody>
                    {pagedRows.length === 0 ? (
                      <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No records yet</td></tr>
                    ) : pagedRows.map(r => (
                      <tr key={r.id}>
                        {reportTab === 'rooms' && <>
                          <td>#{r.id}</td>
                          <td>{r.room_number} ({r.room_type})</td>
                          <td>{r.first_name} {r.last_name}</td>
                          <td style={{ fontSize: '12px' }}>{r.check_in_date?.slice(0, 10)}</td>
                          <td style={{ fontSize: '12px' }}>{r.check_out_date?.slice(0, 10)}</td>
                          <td>{Number(r.total_price || 0).toFixed(2)} ETB</td>
                          <td>{statusBadge(r.status)}</td>
                          <td>{statusBadge(r.payment_status)}</td>
                        </>}
                        {reportTab === 'desks' && <>
                          <td>#{r.id}</td>
                          <td>{r.desk_number}</td>
                          <td>{r.first_name} {r.last_name}</td>
                          <td style={{ fontSize: '12px' }}>{r.reservation_date?.slice(0, 10)}</td>
                          <td>{Number(r.duration_hours || 0).toFixed(1)}h</td>
                          <td>{r.is_free_with_food ? 'Free' : `${Number(r.amount || 0).toFixed(2)} ETB`}</td>
                          <td>{statusBadge(r.status)}</td>
                          <td>{statusBadge(r.payment_status)}</td>
                        </>}
                        {reportTab === 'food' && <>
                          <td>#{r.id}</td>
                          <td>{r.first_name} {r.last_name}</td>
                          <td>{r.order_type}</td>
                          <td>{Number(r.total_amount || 0).toFixed(2)} ETB</td>
                          <td>{statusBadge(r.status)}</td>
                          <td>{statusBadge(r.payment_status)}</td>
                          <td style={{ fontSize: '12px' }}>{r.order_date?.slice(0, 10)}</td>
                        </>}
                        {reportTab === 'payments' && <>
                          <td style={{ fontSize: '11px' }}>{r.reference_number}</td>
                          <td>{r.first_name} {r.last_name}</td>
                          <td>{r.payment_type}</td>
                          <td>{r.payment_method === 'telebirr' ? 'Telebirr' : r.payment_method === 'cbe_birr' ? 'CBE' : r.payment_method}</td>
                          <td>{Number(r.amount || 0).toFixed(2)} ETB</td>
                          <td>{statusBadge(r.status)}</td>
                          <td style={{ fontSize: '12px' }}>{r.transaction_date?.slice(0, 10)}</td>
                        </>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="pagination">
                  <button className="btn btn-sm btn-secondary" disabled={reportPage === 0} onClick={() => setReportPage(p => p - 1)}>← Prev</button>
                  <span className="page-indicator">Page {reportPage + 1} of {totalPages}</span>
                  <button className="btn btn-sm btn-secondary" disabled={reportPage >= totalPages - 1} onClick={() => setReportPage(p => p + 1)}>Next →</button>
                </div>
              )}
            </div>
          )}

          {/* ====== CUSTOMER FEEDBACK TAB ====== */}

          {activeTab === 'pages' && (
            <div className="card">
              <h3 className="card-title">📄 Edit About & Contact pages</h3>
              <p style={{ color: '#666', marginBottom: 16 }}>
                Changes appear on the public About and Contact pages. Map opens only when customers click Use Map.
              </p>
              <form onSubmit={handleSaveSiteContent}>
                <h4 style={{ marginTop: 8 }}>About page</h4>
                <div className="form-grid">
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Title</label>
                    <input className="form-input" value={siteContentForm.about_title || ''}
                      onChange={(e) => setSiteContentForm({ ...siteContentForm, about_title: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">About text</label>
                    <textarea className="form-textarea" rows={4} value={siteContentForm.about_body || ''}
                      onChange={(e) => setSiteContentForm({ ...siteContentForm, about_body: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Location name</label>
                    <input className="form-input" value={siteContentForm.about_location_name || ''}
                      onChange={(e) => setSiteContentForm({ ...siteContentForm, about_location_name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Address (map destination)</label>
                    <input className="form-input" value={siteContentForm.about_address || ''}
                      onChange={(e) => setSiteContentForm({ ...siteContentForm, about_address: e.target.value })}
                      placeholder="Paradise Hotel Centera, 8PQJ+4F2, Debre Markos, Ethiopia" />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Google Maps search query</label>
                    <input className="form-input" value={siteContentForm.about_map_query || ''}
                      onChange={(e) => setSiteContentForm({ ...siteContentForm, about_map_query: e.target.value })}
                      placeholder="Paradise Hotel Centera 8PQJ+4F2 Debre Markos Ethiopia" />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Extra (hours, landmarks…)</label>
                    <textarea className="form-textarea" rows={2} value={siteContentForm.about_extra || ''}
                      onChange={(e) => setSiteContentForm({ ...siteContentForm, about_extra: e.target.value })} />
                  </div>
                </div>

                <h4 style={{ marginTop: 20 }}>Contact page</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="form-input" value={siteContentForm.contact_phone || ''}
                      onChange={(e) => setSiteContentForm({ ...siteContentForm, contact_phone: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={siteContentForm.contact_email || ''}
                      onChange={(e) => setSiteContentForm({ ...siteContentForm, contact_email: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Address</label>
                    <input className="form-input" value={siteContentForm.contact_address || ''}
                      onChange={(e) => setSiteContentForm({ ...siteContentForm, contact_address: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Hours</label>
                    <input className="form-input" value={siteContentForm.contact_hours || ''}
                      onChange={(e) => setSiteContentForm({ ...siteContentForm, contact_hours: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Extra notes</label>
                    <textarea className="form-textarea" rows={2} value={siteContentForm.contact_extra || ''}
                      onChange={(e) => setSiteContentForm({ ...siteContentForm, contact_extra: e.target.value })} />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingSite} style={{ marginTop: 16 }}>
                  {savingSite ? 'Saving…' : 'Save About & Contact'}
                </button>
              </form>
            </div>
          )}


          {false && activeTab === 'feedback' && (
            <div className="card">
              <h3 className="card-title">📩 Customer Reports & Feedback</h3>
              {customerReports.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📩</div>
                  <div className="empty-state-title">No reports yet</div>
                  <div className="empty-state-desc">Customer reports submitted to the manager will appear here</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {customerReports.map(r => (
                    <div key={r.id} style={{ background: 'var(--bg-main)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div>
                          <strong>{r.first_name} {r.last_name}</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '8px' }}>@{r.username}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {statusBadge(r.status || 'pending')}
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fmtDate(r.created_at)}</span>
                        </div>
                      </div>
                      <h4 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '6px' }}>{r.title}</h4>
                      <p style={{ fontSize: '14px', color: 'var(--text-dark)', lineHeight: '1.6' }}>{r.description}</p>
                      {r.manager_response && (
                        <div style={{ marginTop: '12px', padding: '12px', background: 'var(--accent-light)', borderRadius: '8px', borderLeft: '3px solid var(--accent)' }}>
                          <strong style={{ fontSize: '12px' }}>Manager Response:</strong>
                          <p style={{ fontSize: '13px', marginTop: '4px' }}>{r.manager_response}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ====== CANCELLATION PENALTY MODAL ====== */}
      {penaltyModal && (
        <div className="modal-overlay" onClick={() => setPenaltyModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Process Refund Request #{penaltyModal.id}</h3>
              <button className="modal-close" onClick={() => setPenaltyModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg-main)', padding: '14px', borderRadius: '8px', marginBottom: '16px' }}>
                <p style={{ fontSize: '14px', marginBottom: '6px' }}><strong>Customer:</strong> {penaltyModal.first_name} {penaltyModal.last_name}</p>
                <p style={{ fontSize: '14px', marginBottom: '6px' }}><strong>Original Amount:</strong> {Number(penaltyModal.original_amount).toFixed(2)} ETB</p>
                <p style={{ fontSize: '14px', marginBottom: '6px' }}><strong>Customer Reason:</strong> {penaltyModal.reason}</p>
              </div>
              <div className="form-group">
                <label className="form-label">Penalty Percentage (%)</label>
                <input type="number" className="form-input" min="0" max="100"
                  value={penaltyForm.penaltyPercentage}
                  onChange={e => handlePenaltyChange('penaltyPercentage', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Calculated Refund Amount (ETB)</label>
                <input type="number" className="form-input" value={penaltyForm.refundAmount}
                  onChange={e => setPenaltyForm({ ...penaltyForm, refundAmount: e.target.value })} />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Auto-calculated: {penaltyModal.original_amount} - {penaltyForm.penaltyPercentage}% = {penaltyForm.refundAmount} ETB
                </p>
              </div>
              <div className="form-group">
                <label className="form-label">Manager Notes / Reason</label>
                <textarea className="form-textarea" placeholder="Reason for this decision..."
                  value={penaltyForm.reason}
                  onChange={e => setPenaltyForm({ ...penaltyForm, reason: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setPenaltyModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleProcessRefund('reject')}>❌ Reject</button>
              <button className="btn btn-success" onClick={() => handleProcessRefund('approve')}>✅ Approve Refund</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerDashboard;
