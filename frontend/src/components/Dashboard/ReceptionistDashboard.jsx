import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';

/** Build absolute URL for files served by the backend (/uploads/...) */
const UPLOAD_ORIGIN = (
  process.env.REACT_APP_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:5000' : '')
).replace(/\/api\/?$/, '');

const resolveUpload = (path) => {
  if (!path) return null;
  const raw = String(path).trim();
  if (!raw || raw === 'undefined' || raw === 'null') return null;
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;

  let p = raw.replace(/\\/g, '/');
  const isId = p.includes('id_card') || p.startsWith('id-') || p.includes('/id_cards/');
  const isReceipt = p.includes('receipt') || p.includes('/receipts/');
  const file = p.replace(/^.*\//, '');
  const token = (typeof localStorage !== 'undefined' && localStorage.getItem('token')) || '';

  if (isId || isReceipt) {
    const folder = isReceipt ? 'receipts' : 'id_cards';
    const q = token ? `?access_token=${encodeURIComponent(token)}` : '';
    const apiPath = `/api/secure-media/${folder}/${file}${q}`;
    return UPLOAD_ORIGIN ? `${UPLOAD_ORIGIN}${apiPath}` : apiPath;
  }

  if (!p.startsWith('/')) {
    p = '/uploads/' + p.replace(/^\/+/, '');
  }
  if (p.startsWith('/uploads')) {
    return UPLOAD_ORIGIN ? `${UPLOAD_ORIGIN}${p}` : p;
  }
  return UPLOAD_ORIGIN ? `${UPLOAD_ORIGIN}${p.startsWith('/') ? p : '/' + p}` : p;
};

function customerLabel(row) {
  if (!row) return '—';
  const clean = (v) => {
    if (v == null) return '';
    const s = String(v).trim();
    if (!s || s === 'undefined' || s === 'null') return '';
    return s;
  };
  const full = clean(row.full_name);
  if (full && full !== '—') return full;
  const first = clean(row.first_name);
  const last = clean(row.last_name);
  const guest = clean(row.guest_name);
  const customer = clean(row.customer_name);
  const name = customer || guest || [first, last].filter(Boolean).join(' ').trim();
  if (name && name !== '—') return name;
  const email = clean(row.email) || clean(row.guest_email);
  if (email && email !== '—') return email;
  const phone = clean(row.phone) || clean(row.guest_phone);
  if (phone && phone !== '—') return phone;
  return '—';
}

function customerSubLine(row) {
  if (!row) return '';
  const parts = [];
  if (row.username) parts.push('@' + row.username);
  const email = row.email || row.guest_email;
  if (email && email !== '—' && email !== 'undefined') parts.push(email);
  const phone = row.phone || row.guest_phone;
  if (phone && phone !== '—' && phone !== 'undefined') parts.push(phone);
  return parts.join(' · ') || '';
}

export default function ReceptionistDashboard() {
  const { user } = useContext(AuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') || 'food';
  const [activeTab, setActiveTab] = useState(tabFromUrl);

  // Data
  const [pendingPayments, setPendingPayments] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [pendingRooms, setPendingRooms] = useState([]);
  const [allRoomsRes, setAllRoomsRes] = useState([]);
  const [pendingDesks, setPendingDesks] = useState([]);
  const [allDesksRes, setAllDesksRes] = useState([]);
  const [pendingFood, setPendingFood] = useState([]);
  const [allFood, setAllFood] = useState([]);
  const [pendingRefunds, setPendingRefunds] = useState([]);
  const [allRooms, setAllRooms] = useState([]);
  const [allDesks, setAllDesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkInFilter, setCheckInFilter] = useState('');
  const [checkOutFilter, setCheckOutFilter] = useState('');
  const [error, setError] = useState('');

  // Filters
  const [payFilter, setPayFilter] = useState({ status: '', method: '', q: '', from: '', to: '', checkIn: '', checkOut: '' });
  const [roomFilter, setRoomFilter] = useState({ status: 'all', q: '' });
  const [deskFilter, setDeskFilter] = useState({ status: 'all', q: '' });
  const [foodFilter, setFoodFilter] = useState({ status: '', q: '' });

  // Customer search
  const [custQuery, setCustQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [custLoading, setCustLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Payment detail
  const [paymentDetail, setPaymentDetail] = useState(null);

  // Modals
  const [rejectionModal, setRejectionModal] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [previewMedia, setPreviewMedia] = useState(null);
  const [foodItemsModal, setFoodItemsModal] = useState(null);
  const [foodItems, setFoodItems] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [unreadCounts, setUnreadCounts] = useState({
    payments: 0, rooms: 0, desks: 0, food: 0, reservations: 0, total: 0,
  });
  const [unreadFilter, setUnreadFilter] = useState(false); // show only unread rows on current table
  const [unreadItems, setUnreadItems] = useState({ payments: [], rooms: [], desks: [], food: [] });


  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);


  const loadRoomsByStatus = async (filter) => {
    const f = String(filter || 'available').toLowerCase();
    try {
      if (f === 'all') {
        const [a, r] = await Promise.all([
          api.get('/rooms/status', { params: { filter: 'available' } }),
          api.get('/rooms/status', { params: { filter: 'reserved' } }),
        ]);
        const available = (a.data.rooms || []).map((x) => ({ ...x, inventory_status: x.inventory_status || 'available' }));
        const reserved = (r.data.rooms || []).filter((x) => x.reservation_id != null && x.reservation_id !== '');
        // reserved first, then available rooms not already in reserved set
        const reservedIds = new Set(reserved.map((x) => x.id));
        setAllRooms([...reserved, ...available.filter((x) => !reservedIds.has(x.id))]);
        return;
      }
      if (f === 'reserved' || f === 'booked') {
        const res = await api.get('/rooms/status', { params: { filter: 'reserved' } });
        const list = Array.isArray(res.data.rooms) ? res.data.rooms : [];
        setAllRooms(list.filter((x) => x.reservation_id != null && x.reservation_id !== ''));
        return;
      }
      // available only — never show rows that have a reservation
      const res = await api.get('/rooms/status', { params: { filter: 'available' } });
      const list = Array.isArray(res.data.rooms) ? res.data.rooms : [];
      setAllRooms(list.filter((x) => !x.reservation_id && String(x.inventory_status || x.status || 'available') !== 'reserved'));
    } catch (err) {
      console.error(err);
      setAllRooms([]);
      toast.error(err.response?.data?.message || 'Could not load rooms');
    }
  };

  const loadDesksByStatus = async (filter) => {
    const f = String(filter || 'available').toLowerCase();
    try {
      if (f === 'all') {
        const [a, r] = await Promise.all([
          api.get('/desks/status', { params: { filter: 'available' } }),
          api.get('/desks/status', { params: { filter: 'reserved' } }),
        ]);
        const available = (a.data.desks || []).map((x) => ({ ...x, inventory_status: x.inventory_status || 'available' }));
        const reserved = (r.data.desks || []).filter((x) => x.reservation_id != null && x.reservation_id !== '');
        const reservedIds = new Set(reserved.map((x) => x.id));
        // For "all": show each reserved booking row + available desks not reserved
        setAllDesks([...reserved, ...available.filter((x) => !reservedIds.has(x.id))]);
        return;
      }
      if (f === 'reserved' || f === 'booked') {
        const res = await api.get('/desks/status', { params: { filter: 'reserved' } });
        const list = Array.isArray(res.data.desks) ? res.data.desks : [];
        setAllDesks(list.filter((x) => x.reservation_id != null && x.reservation_id !== ''));
        return;
      }
      // available ONLY — strip any reserved rows client-side as safety net
      const res = await api.get('/desks/status', { params: { filter: 'available' } });
      const list = Array.isArray(res.data.desks) ? res.data.desks : [];
      setAllDesks(
        list.filter(
          (x) =>
            !x.reservation_id &&
            String(x.inventory_status || '').toLowerCase() !== 'reserved' &&
            String(x.reservation_status || '').toLowerCase() !== 'approved'
        )
      );
    } catch (err) {
      console.error(err);
      setAllDesks([]);
      toast.error(err.response?.data?.message || 'Could not load desks');
    }
  };



  const switchTab = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [
        payRes, allPayRes, roomRes, allRoomRes, deskRes, allDeskRes,
        foodRes, allFoodRes, refundRes
      ] = await Promise.all([
        api.get('/payments/pending').catch(() => ({ data: { payments: [] } })),
        api.get('/payments').catch(() => ({ data: { payments: [] } })),
        api.get('/reservations/pending').catch(() => ({ data: { reservations: [] } })),
        api.get('/reservations/all').catch(() => ({ data: { reservations: [] } })),
        api.get('/desks/pending').catch(() => ({ data: { reservations: [] } })),
        api.get('/desks/reservations').catch(() => ({ data: { reservations: [] } })),
        api.get('/food/pending').catch(() => ({ data: { orders: [] } })),
        api.get('/food/orders').catch(() => ({ data: { orders: [] } })),
        api.get('/refunds/pending').catch(() => ({ data: { refunds: [] } })),
      ]);

      setPendingPayments(payRes.data.payments || []);
      setAllPayments(allPayRes.data.payments || []);
      setPendingRooms(roomRes.data.reservations || []);
      setAllRoomsRes(allRoomRes.data.reservations || allRoomRes.data || []);
      setPendingDesks(deskRes.data.reservations || []);
      setAllDesksRes(allDeskRes.data.reservations || []);
      setPendingFood(foodRes.data.orders || []);
      setAllFood(allFoodRes.data.orders || []);
      setPendingRefunds(refundRes.data.refunds || []);
      // Rooms/desks lists come ONLY from /rooms/status and /desks/status (never full inventory here)
    } catch (err) {
      console.error(err);
      setError('Failed to load dashboard data. Check network / API.');
      toast.error('Failed to load receptionist dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);


  const loadUnread = useCallback(async () => {
    try {
      const res = await api.get('/receptionist/unread');
      if (res.data?.unread) setUnreadCounts(res.data.unread);
    } catch (e) {
      console.warn('loadUnread', e.message);
    }
  }, []);

  const loadUnreadItems = async () => {
    try {
      const res = await api.get('/receptionist/unread-items');
      setUnreadItems({
        payments: res.data.payments || [],
        rooms: res.data.rooms || [],
        desks: res.data.desks || [],
        food: res.data.food || [],
      });
    } catch (e) {
      console.warn('loadUnreadItems', e.message);
    }
  };

  const markSeen = async (type) => {
    try {
      const res = await api.post('/receptionist/mark-seen', { type });
      if (res.data?.unread) setUnreadCounts(res.data.unread);
      else await loadUnread();
      await loadUnreadItems();
    } catch (e) {
      console.warn('markSeen', e?.message || e);
    }
  };

  // Map tab → unread type
  const tabUnreadType = (tab) => {
    if (tab === 'payments') return 'payments';
    if (tab === 'rooms') return 'rooms';
    if (tab === 'desks') return 'desks';
    if (tab === 'food') return 'food';
    return null;
  };

  useEffect(() => {
    fetchDashboardData();
    loadUnread();
    loadUnreadItems();
    const t = setInterval(() => { loadUnread(); loadUnreadItems(); }, 20000);
    return () => clearInterval(t);
  }, [fetchDashboardData, loadUnread]);

  // Previous feature: load rooms/desks/customers by tab
  useEffect(() => {
    setUnreadFilter(false);
    if (activeTab === 'rooms') {
      loadRoomsByStatus(roomFilter.status || 'all');
    } else if (activeTab === 'desks') {
      loadDesksByStatus(deskFilter.status || 'all');
    } else if (activeTab === 'customers' || activeTab === 'search') {
      loadAllCustomers();
    }
  }, [activeTab, roomFilter.status, deskFilter.status]);

  // Auto mark-as-read when receptionist views the table (count downs by itself — no Unread click needed)
  useEffect(() => {
    const type = tabUnreadType(activeTab);
    if (!type) return undefined;
    const timer = setTimeout(() => {
      markSeen(type);
    }, 1500);
    return () => clearTimeout(timer);
  }, [activeTab]);


  const handleAction = async (type, id, action, reason = null) => {
    if (action === 'reject' && reason === null) {
      setRejectionModal({ type, id });
      setRejectionReason('');
      return;
    }
    try {
      let endpoint = '';
      if (type === 'payment') endpoint = `/payments/${id}/action`;
      else if (type === 'room') endpoint = `/reservations/${id}/action`;
      else if (type === 'desk') endpoint = `/desks/${id}/action`;
      else if (type === 'food') endpoint = `/food/${id}/action`;
      else if (type === 'refund') endpoint = `/refunds/${id}/action`;

      const res = await api.post(endpoint, { action, rejectionReason: reason });
      if (res.data.success) {
        toast.success(res.data.message || `${action} successful`);
        setRejectionModal(null);
        setPaymentDetail(null);
        fetchDashboardData();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Action failed');
    }
  };

  const handleRejectionSubmit = (e) => {
    e.preventDefault();
    if (!rejectionReason || rejectionReason.trim().length < 3) {
      toast.error('Please enter a rejection reason (min 3 characters).');
      return;
    }
    handleAction(rejectionModal.type, rejectionModal.id, 'reject', rejectionReason.trim());
  };

  const openFoodItems = async (orderId) => {
    try {
      const res = await api.get(`/food/${orderId}/items`);
      setFoodItems(res.data.items || []);
      setFoodItemsModal(orderId);
    } catch {
      toast.error('Error fetching food order items');
    }
  };

  const openPaymentDetail = async (id) => {
    try {
      const res = await api.get(`/payments/${id}`);
      setPaymentDetail(res.data.payment);
      try { await api.post('/receptionist/mark-seen', { type: 'payments', ids: [id] }); loadUnread(); } catch (_) {}
    } catch {
      // fallback from list
      const p = allPayments.find((x) => x.id === id) || pendingPayments.find((x) => x.id === id);
      if (p) setPaymentDetail(p);
      else toast.error('Could not load payment details');
    }
  };

  const loadAllCustomers = async () => {
    setCustLoading(true);
    try {
      const res = await api.get('/payments/customers/search', { params: { q: '' } });
      setCustomers(res.data.customers || []);
    } catch {
      setCustomers([]);
    } finally {
      setCustLoading(false);
    }
  };

  const searchCustomers = async (e) => {
    e?.preventDefault();
    if (!custQuery.trim()) {
      setCustomers([]);
      return;
    }
    setCustLoading(true);
    try {
      const res = await api.get('/payments/customers/search', { params: { q: custQuery.trim() } });
      setCustomers(res.data.customers || []);
    } catch {
      toast.error('Customer search failed');
      setCustomers([]);
    } finally {
      setCustLoading(false);
    }
  };

  const viewCustomerHistory = async (id) => {
    try {
      const res = await api.get(`/payments/customers/${id}/history`);
      setSelectedCustomer(res.data);
    } catch {
      toast.error('Failed to load customer history');
    }
  };

  const handleSendFeedback = async (e) => {
    e.preventDefault();
    try {
      await api.post('/comments', { comment: feedback });
      setStatusMsg('Feedback sent to Admin successfully.');
      setFeedback('');
      toast.success('Feedback submitted');
    } catch {
      setStatusMsg('Failed to send feedback.');
      toast.error('Failed to send feedback');
    }
  };

  // ---- Payment search helpers (method + check-in/out) ----
  const toYmd = (val) => {
    if (val == null || val === '') return '';
    if (val instanceof Date && !Number.isNaN(val.getTime())) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + d;
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + d;
    }
    return '';
  };

  const matchesPaymentMethod = (p, wantRaw) => {
    if (!wantRaw) return true;
    const method = String(p.payment_method || p.bank_name || p.account_name || '').toLowerCase();
    const want = String(wantRaw).toLowerCase().trim();
    if (!want) return true;
    if (method.includes(want)) return true;
    const aliases = {
      cbe: ['cbe', 'cbe_birr', 'commercial bank', 'commercial bank of ethiopia'],
      cbe_birr: ['cbe', 'cbe_birr', 'commercial bank', 'commercial bank of ethiopia'],
      telebirr: ['telebirr', 'tele birr', 'tele-birr'],
      bank_transfer: ['bank', 'transfer', 'cbe', 'commercial', 'account', 'awash', 'dashen'],
      cash: ['cash'],
    };
    const keys = aliases[want] || [want];
    return keys.some((k) => method.includes(k));
  };

  // Client-side payment filters: method, payment dates, check-in/out (stay)
  const paymentSource = unreadFilter && activeTab === 'payments'
    ? (unreadItems.payments || [])
    : allPayments;
  const filteredPayments = paymentSource.filter((p) => {
    if (payFilter.status && String(p.status || '').toLowerCase() !== String(payFilter.status).toLowerCase()) return false;
    if (payFilter.method && !matchesPaymentMethod(p, payFilter.method)) return false;

    if (payFilter.from) {
      const d = toYmd(p.transaction_date || p.payment_date);
      if (!d || d < payFilter.from) return false;
    }
    if (payFilter.to) {
      const d = toYmd(p.transaction_date || p.payment_date);
      if (!d || d > payFilter.to) return false;
    }

    if (payFilter.checkIn || payFilter.checkOut) {
      const cin =
        toYmd(p.check_in_date) ||
        toYmd(p.desk_start_time) ||
        toYmd(p.desk_reservation_date) ||
        '';
      const cout =
        toYmd(p.check_out_date) ||
        toYmd(p.desk_end_time) ||
        cin;
      if (!cin && !cout) return false;
      const filterStart = payFilter.checkIn || '0000-01-01';
      const filterEnd = payFilter.checkOut || '9999-12-31';
      const stayStart = cin || cout;
      const stayEnd = cout || cin;
      if (stayStart > filterEnd || stayEnd < filterStart) return false;
    }

    if (payFilter.q) {
      const q = payFilter.q.toLowerCase();
      const hay = `${p.reference_number || ''} ${p.transaction_id || ''} ${p.first_name || ''} ${p.last_name || ''} ${p.email || ''} ${p.phone || ''} ${p.payment_method || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });


  // Lists come from backend /rooms/status and /desks/status — display as returned
  const roomSource = unreadFilter && activeTab === 'rooms'
    ? (unreadItems.rooms || []).map((r) => ({
        ...r,
        inventory_status: r.inventory_status || 'reserved',
        full_name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.full_name,
        guest_name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.guest_name,
      }))
    : (allRooms || []);
  const filteredRooms = roomSource.filter((r) => {
    if (roomFilter.q) {
      const q = roomFilter.q.toLowerCase();
      const hay = `${r.room_number || ''} ${r.room_type || ''} ${r.guest_name || ''} ${r.first_name || ''} ${r.last_name || ''} ${r.email || ''} ${r.full_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    // Check-in / check-out date search (reservation window overlap with filter range)
    const cin = r.check_in_date ? String(r.check_in_date).slice(0, 10) : '';
    const cout = r.check_out_date ? String(r.check_out_date).slice(0, 10) : '';
    if (checkInFilter || checkOutFilter) {
      // Only show rooms that have reservation dates when filtering by dates
      if (!cin && !cout) return false;
      if (checkInFilter && cout && cout < checkInFilter) return false;
      if (checkOutFilter && cin && cin > checkOutFilter) return false;
      if (checkInFilter && cin && cin < checkInFilter && (!cout || cout < checkInFilter)) return false;
      if (checkOutFilter && cout && cout > checkOutFilter && (!cin || cin > checkOutFilter)) {
        // still allow if stay overlaps: cin <= checkOutFilter
        if (!(cin && cin <= checkOutFilter)) return false;
      }
    }
    return true;
  });

  const deskSource = unreadFilter && activeTab === 'desks'
    ? (unreadItems.desks || []).map((x) => ({
        ...x,
        inventory_status: x.inventory_status || 'reserved',
        full_name: [x.first_name, x.last_name].filter(Boolean).join(' ') || x.full_name,
        guest_name: [x.first_name, x.last_name].filter(Boolean).join(' ') || x.guest_name,
      }))
    : (allDesks || []);
  const filteredDesks = deskSource.filter((d) => {
    if (deskFilter.q) {
      const q = deskFilter.q.toLowerCase();
      const hay = `${d.desk_number || ''} ${d.location || ''} ${d.guest_name || ''} ${d.first_name || ''} ${d.last_name || ''} ${d.email || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const foodSource = unreadFilter && activeTab === 'food'
    ? (unreadItems.food || [])
    : (allFood.length ? allFood : pendingFood);
  const filteredFood = foodSource.filter((o) => {
    if (foodFilter.status && o.status !== foodFilter.status) return false;
    if (foodFilter.q) {
      const q = foodFilter.q.toLowerCase();
      const hay = `${o.first_name} ${o.last_name} ${o.id} ${o.payment_reference || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="inside" style={{ textAlign: 'center', padding: '60px' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <p>Loading Receptionist Control Center...</p>
      </div>
    );
  }

  return (
    <div className="inside" style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
      <div style={{ background: '#1a1a2e', color: '#fff', padding: '24px', borderRadius: '12px', marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px' }}>🏨 <span style={{ color: '#f0a500' }}>Receptionist</span> Control Center</h1>
          <p style={{ margin: '5px 0 0 0', color: '#ccc', fontSize: 14 }}>
            {user?.first_name} {user?.last_name} · View payments, rooms & desks availability/reservations. Manage food order status (preparing / ready).
          </p>
        </div>
        <button onClick={() => { fetchDashboardData(); loadUnread(); }} className="btn btn-primary" style={{ padding: '10px 18px' }}>
          🔄 Refresh Data
        </button>
      </div>

      {error && (
        <div style={{ background: '#f8d7da', color: '#721c24', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Content driven by sidebar ?tab= only */}

      {/* ========== OVERVIEW ========== */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { label: 'Payments', value: allPayments.length || pendingPayments.length, color: '#f0a500', tab: 'payments' },
            { label: 'Rooms (inventory)', value: allRooms.length, color: '#3498db', tab: 'rooms' },
            { label: 'Desks (inventory)', value: allDesks.length, color: '#9b59b6', tab: 'desks' },
            { label: 'Food Orders', value: pendingFood.length, color: '#e67e22', tab: 'food' },
          ].map((c) => (
            <div
              key={c.label}
              onClick={() => switchTab(c.tab)}
              style={{
                background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #eee',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)', cursor: 'pointer', textAlign: 'center'
              }}
            >
              <div style={{ fontSize: 32, fontWeight: 800, color: c.color }}>{c.value}</div>
              <div style={{ color: '#555', marginTop: 6 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}


      {/* ========== PAYMENTS ========== */}
      {(activeTab === 'payments') && (
        <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #eee', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
          <h2 style={{ marginTop: 0, color: '#1a1a2e' }}>💳 Payments</h2>
          <p style={{ color: '#666', marginBottom: 16 }}>Verify transaction details and payment proof before approving. Approving payment confirms the linked reservation/order.</p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18, alignItems: 'flex-end' }}>
            <input
              placeholder="Search name, email, Tx ID, ref..."
              value={payFilter.q}
              onChange={(e) => setPayFilter({ ...payFilter, q: e.target.value })}
              style={inputStyle}
            />

            <button
              type="button"
              onClick={async () => {
                await loadUnreadItems();
                setUnreadFilter((v) => !v);
              }}
              className="btn"
              style={{
                padding: '8px 14px',
                background: (unreadCounts.payments || 0) > 0 ? '#e74c3c' : '#5d6d7e',
                color: '#fff',
                fontWeight: 700,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title="Show only unread payments on this table"
            >
              🔔 Unread ({unreadCounts.payments || 0})
            </button>

            <select value={payFilter.status} onChange={(e) => setPayFilter({ ...payFilter, status: e.target.value })} style={inputStyle}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="verified">Verified</option>
            </select>
            <select value={payFilter.method} onChange={(e) => setPayFilter({ ...payFilter, method: e.target.value })} style={inputStyle}>
              <option value="">All methods</option>
              <option value="cbe_birr">CBE / Commercial Bank</option>
              <option value="telebirr">Telebirr</option>
              <option value="bank_transfer">Any bank / transfer</option>
              <option value="cash">Cash</option>
            </select>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', color: '#666' }}>Payment from</label>
              <input type="date" value={payFilter.from} onChange={(e) => setPayFilter({ ...payFilter, from: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', color: '#666' }}>Payment to</label>
              <input type="date" value={payFilter.to} onChange={(e) => setPayFilter({ ...payFilter, to: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', color: '#666' }}>Check-in from</label>
              <input type="date" value={payFilter.checkIn || ''} onChange={(e) => setPayFilter({ ...payFilter, checkIn: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', color: '#666' }}>Check-out to</label>
              <input type="date" value={payFilter.checkOut || ''} onChange={(e) => setPayFilter({ ...payFilter, checkOut: e.target.value })} style={inputStyle} />
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setPayFilter({ status: '', method: '', q: '', from: '', to: '', checkIn: '', checkOut: '' })}
            >
              Clear filters
            </button>
          </div>

          {filteredPayments.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', padding: 30 }}>No payments match the filters.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Transaction ID</th>
                    <th>Payer</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Date</th>
                    <th>Stay (check-in → out)</th>
                    <th>Related</th>
                    <th>Status</th>
                    <th>Proof</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <code>{p.transaction_id || '—'}</code>
                        <div style={{ fontSize: 11, color: '#888' }}>{p.reference_number}</div>
                      </td>
                      <td>
                        <strong>{p.first_name} {p.last_name}</strong>
                        <div style={{ fontSize: 11, color: '#777' }}>{p.email}<br />{p.phone}</div>
                      </td>
                      <td style={{ fontWeight: 700, color: '#27ae60' }}>ETB {Number(p.amount).toFixed(2)}</td>
                      <td><span className="badge badge-warning">{(p.payment_method || '').toUpperCase()}</span></td>
                      <td style={{ fontSize: 12 }}>{p.transaction_date ? new Date(p.transaction_date).toLocaleString() : '—'}</td>
                      <td style={{ fontSize: 12 }}>
                        {(p.check_in_date || p.desk_reservation_date || p.desk_start_time)
                          ? `${toYmd(p.check_in_date || p.desk_reservation_date || p.desk_start_time)}${(p.check_out_date || p.desk_end_time) ? ' → ' + toYmd(p.check_out_date || p.desk_end_time) : ''}`
                          : '—'}
                      </td>
                      <td><span className="badge badge-info">{(p.reservation_type || p.payment_type || '').toUpperCase()} #{p.reservation_id}</span></td>
                      <td><span className={`status-badge status-${p.status === 'approved' || p.status === 'verified' ? 'approved' : p.status === 'rejected' ? 'rejected' : 'pending'}`}>{p.status}</span></td>
                      <td>
                        {p.receipt_image ? (
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => setPreviewMedia({ title: `Receipt · ${p.transaction_id}`, url: resolveUpload(p.receipt_image) })}
                          >
                            📄 View
                          </button>
                        ) : <span style={{ color: '#999' }}>—</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn btn-sm btn-outline" onClick={() => openPaymentDetail(p.id)}>Details</button>
                          {p.status === 'pending' && (
                            <>
                              <button className="btn btn-sm btn-success" onClick={() => handleAction('payment', p.id, 'approve')}>✓</button>
                              <button className="btn btn-sm btn-danger" onClick={() => handleAction('payment', p.id, 'reject')}>✗</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========== ROOMS (available & reserved) ========== */}
      {activeTab === 'rooms' && (
        <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #eee' }}>
          <h2 style={{ marginTop: 0 }}>🛏️ Rooms (available & reserved)</h2>
          <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
            All hotel rooms. Filter by available or reserved. Guest shown when the room has an active reservation.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
            <input placeholder="Search room #, guest, type..." value={roomFilter.q} onChange={(e) => setRoomFilter({ ...roomFilter, q: e.target.value })} style={inputStyle} />

            <button
              type="button"
              onClick={async () => {
                await loadUnreadItems();
                setUnreadFilter((v) => !v);
              }}
              className="btn"
              style={{
                padding: '8px 14px',
                background: (unreadCounts.rooms || 0) > 0 ? '#e74c3c' : '#5d6d7e',
                color: '#fff',
                fontWeight: 700,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title="Show only unread room reservations on this table"
            >
              🔔 Unread ({unreadCounts.rooms || 0})
            </button>
            <select
              value={roomFilter.status || 'all'}
              onChange={(e) => {
                const status = e.target.value;
                setRoomFilter({ ...roomFilter, status });
                loadRoomsByStatus(status);
              }}
              style={inputStyle}
            >
              <option value="all">All</option>
              <option value="available">Available</option>
              <option value="reserved">Reserved / Booked</option>
            </select>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', color: '#666' }}>Check-in from</label>
              <input type="date" value={checkInFilter} onChange={(e) => setCheckInFilter(e.target.value)} style={inputStyle} title="Check-in from" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', color: '#666' }}>Check-out to</label>
              <input type="date" value={checkOutFilter} onChange={(e) => setCheckOutFilter(e.target.value)} style={inputStyle} title="Check-out to" />
            </div>
            <button type="button" className="btn btn-outline" onClick={() => { setCheckInFilter(''); setCheckOutFilter(''); setRoomFilter({ ...roomFilter, q: '' }); }}>Clear dates</button>
            <button type="button" className="btn btn-outline" onClick={() => loadRoomsByStatus(roomFilter.status || 'all')}>Refresh</button>
          </div>
          {filteredRooms.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', padding: 30 }}>No rooms match this filter.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Room #</th>
                    <th>Type</th>
                    <th>Price/night</th>
                    <th>Inventory status</th>
                    <th>Guest</th>
                    <th>Check-in / out</th>
                    <th>Payment</th>
                    <th>Reservation</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRooms.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.room_number || r.id}</strong></td>
                      <td>{r.room_type || r.type || '—'}</td>
                      <td>ETB {Number(r.price_per_night || r.price || 0).toFixed(2)}</td>
                      <td>
                        <span className={`badge badge-${(r.reservation_id || r.reservation_status) ? 'warning' : ((r.inventory_status || r.status) === 'available' ? 'approved' : 'warning')}`}>
                          {(r.reservation_id || r.reservation_status) ? (r.reservation_status || 'reserved') : (r.inventory_status || r.status || 'available')}
                        </span>
                      </td>
                      <td>
                        <strong>
                          {(r.full_name && r.full_name !== '—' && !String(r.full_name).includes('undefined'))
                            ? r.full_name
                            : (r.guest_name && !String(r.guest_name).includes('undefined') && r.guest_name !== '—')
                              ? r.guest_name
                              : ([r.first_name, r.last_name].filter((x) => x && String(x) !== 'undefined').join(' ') || r.username || '—')}
                        </strong>
                        <div style={{ fontSize: 11, color: '#777' }}>{customerSubLine(r)}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {r.check_in_date ? new Date(r.check_in_date).toLocaleDateString() : '—'}
                        {' → '}
                        {r.check_out_date ? new Date(r.check_out_date).toLocaleDateString() : '—'}
                      </td>
                      <td>{r.payment_status || '—'}</td>
                      <td>{r.reservation_status || (r.reservation_id ? `#${r.reservation_id}` : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========== DESKS (available & reserved) ========== */}
      {activeTab === 'desks' && (
        <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #eee' }}>
          <h2 style={{ marginTop: 0 }}>🍽️ Desks (available & reserved)</h2>
          <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
            All hotel desks. Filter by available or reserved. Guest shown when the desk has an active reservation.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <input placeholder="Search desk #, guest, location..." value={deskFilter.q} onChange={(e) => setDeskFilter({ ...deskFilter, q: e.target.value })} style={inputStyle} />

            <button
              type="button"
              onClick={async () => {
                await loadUnreadItems();
                setUnreadFilter((v) => !v);
              }}
              className="btn"
              style={{
                padding: '8px 14px',
                background: (unreadCounts.desks || 0) > 0 ? '#e74c3c' : '#5d6d7e',
                color: '#fff',
                fontWeight: 700,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title="Show only unread desk reservations on this table"
            >
              🔔 Unread ({unreadCounts.desks || 0})
            </button>
            <select
              value={deskFilter.status || 'all'}
              onChange={(e) => {
                const status = e.target.value;
                setDeskFilter({ ...deskFilter, status });
                loadDesksByStatus(status);
              }}
              style={inputStyle}
            >
              <option value="all">All</option>
              <option value="available">Available</option>
              <option value="reserved">Reserved / Booked</option>
            </select>
            <button type="button" className="btn btn-outline" onClick={() => loadDesksByStatus(deskFilter.status || 'all')}>Refresh</button>
          </div>
          {filteredDesks.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', padding: 30 }}>No desks match this filter.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Desk #</th>
                    <th>Location</th>
                    <th>Capacity</th>
                    <th>Price</th>
                    <th>Inventory status</th>
                    <th>Guest</th>
                    <th>Time slot</th>
                    <th>Payment</th>
                    <th>Reservation</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDesks.map((d) => (
                    <tr key={d.reservation_id ? `res-${d.reservation_id}` : `desk-${d.id}`}>
                      <td><strong>{d.desk_number || d.id}</strong></td>
                      <td>{d.location || '—'}</td>
                      <td>{d.capacity ?? '—'}</td>
                      <td>ETB {Number(d.price || 0).toFixed(2)}</td>
                      <td>
                        <span className={`badge badge-${(d.inventory_status || d.status) === 'available' ? 'approved' : 'warning'}`}>
                          {d.inventory_status || d.status || 'available'}
                        </span>
                      </td>
                      <td>
                        <strong>
                          {(d.full_name && d.full_name !== '—' && !String(d.full_name).includes('undefined'))
                            ? d.full_name
                            : (d.guest_name && !String(d.guest_name).includes('undefined') && d.guest_name !== '—')
                              ? d.guest_name
                              : ([d.first_name, d.last_name].filter((x) => x && String(x) !== 'undefined').join(' ') || d.username || '—')}
                        </strong>
                        <div style={{ fontSize: 11, color: '#777' }}>{customerSubLine(d)}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {d.start_time ? new Date(d.start_time).toLocaleString() : '—'}
                        {d.end_time ? ` → ${new Date(d.end_time).toLocaleString()}` : ''}
                      </td>
                      <td>{d.payment_status || '—'}</td>
                      <td>{d.reservation_status || (d.reservation_id ? `#${d.reservation_id}` : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========== FOOD ORDERS ========== */}
      {activeTab === 'food' && (
        <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #eee' }}>
          <h2 style={{ marginTop: 0 }}>🍕 Food Orders</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
            <input placeholder="Search customer, order ID..." value={foodFilter.q} onChange={(e) => setFoodFilter({ ...foodFilter, q: e.target.value })} style={inputStyle} />
            <button
              type="button"
              onClick={async () => {
                await loadUnreadItems();
                setUnreadFilter((v) => !v);
              }}
              className="btn"
              style={{
                padding: '8px 14px',
                background: (unreadCounts.food || 0) > 0 ? '#e74c3c' : '#5d6d7e',
                color: '#fff',
                fontWeight: 700,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title="Show only unread food orders on this table"
            >
              🔔 Unread ({unreadCounts.food || 0})
            </button>
            <select value={foodFilter.status} onChange={(e) => setFoodFilter({ ...foodFilter, status: e.target.value })} style={inputStyle}>
              <option value="">All statuses</option>
              <option value="waiting">Waiting</option>
              <option value="preparing">Preparing</option>
              <option value="ready">Ready</option>
              <option value="served">Served</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          {filteredFood.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', padding: 30 }}>No food orders found.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Total</th>
                    <th>Date</th>
                    <th>Payment</th>
                    <th>Tx / Ref</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFood.map((o) => (
                    <tr key={o.id}>
                      <td><code>FOOD-#{o.id}</code></td>
                      <td><strong>{o.first_name} {o.last_name}</strong></td>
                      <td><span className="badge badge-info">{(o.order_type || '').toUpperCase()}</span></td>
                      <td style={{ fontWeight: 700, color: '#27ae60' }}>ETB {Number(o.total_amount || 0).toFixed(2)}</td>
                      <td style={{ fontSize: 12 }}>{o.order_date ? new Date(o.order_date).toLocaleString() : '—'}</td>
                      <td><span className="badge badge-warning">{o.payment_status}</span></td>
                      <td style={{ fontSize: 11 }}><code>{o.payment_reference || '—'}</code></td>
                      <td>
                        <select
                          value={['waiting', 'preparing', 'ready'].includes(String(o.status)) ? o.status : 'waiting'}
                          onChange={(e) => handleAction('food', o.id, e.target.value)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid #ccc',
                            fontWeight: 600,
                            textTransform: 'capitalize',
                            minWidth: 130,
                            background: o.status === 'ready' ? '#d4edda' : o.status === 'preparing' ? '#fff3cd' : '#e8f4fd',
                          }}
                        >
                          <option value="waiting">Waiting</option>
                          <option value="preparing">Preparing</option>
                          <option value="ready">Ready</option>
                        </select>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-outline" onClick={() => openFoodItems(o.id)}>Items</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========== CUSTOMERS / SEARCH ========== */}
      {(activeTab === 'customers' || activeTab === 'search') && (
        <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #eee' }}>
          <h2 style={{ marginTop: 0 }}>👥 Customers (view only)</h2>
          <p style={{ color: '#666', marginBottom: 12 }}>Customer information is display-only. Receptionists cannot edit customer profiles.</p>
          <p style={{ color: '#666' }}>Search by name, email, phone, or customer ID. Passwords are never shown.</p>
          <form onSubmit={searchCustomers} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <input
              value={custQuery}
              onChange={(e) => setCustQuery(e.target.value)}
              placeholder="Name, email, phone, or ID..."
              style={{ ...inputStyle, flex: 1, minWidth: 220 }}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '10px 20px' }} disabled={custLoading}>
              {custLoading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {customers.length === 0 && !custLoading && (
            <p style={{ color: '#888', textAlign: 'center' }}>{custQuery ? 'No customers found.' : 'No customers registered yet.'}</p>
          )}

          {customers.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>ID card</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Registered</th>
                    <th>Rooms</th>
                    <th>Desks</th>
                    <th>Food</th>
                    <th>Paid</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td>{c.id}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {resolveUpload(c.id_card_image) ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => setPreviewMedia({
                                title: `ID Front · ${c.first_name || ''} ${c.last_name || ''}`,
                                url: resolveUpload(c.id_card_image),
                              })}
                            >
                              Front ID
                            </button>
                          ) : (
                            <span style={{ color: '#999', fontSize: 11 }}>No front</span>
                          )}
                          {resolveUpload(c.id_card_back_image) ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => setPreviewMedia({
                                title: `ID Back · ${c.first_name || ''} ${c.last_name || ''}`,
                                url: resolveUpload(c.id_card_back_image),
                              })}
                            >
                              Back ID
                            </button>
                          ) : (
                            <span style={{ color: '#999', fontSize: 11 }}>No back</span>
                          )}
                        </div>
                      </td>
                      <td><strong>{c.first_name} {c.last_name}</strong></td>
                      <td>{c.email}</td>
                      <td>{c.phone || '—'}</td>
                      <td style={{ fontSize: 12, maxWidth: 160 }}>{c.address || [c.wereda, c.kebele, c.zone, c.region].filter(Boolean).join(', ') || '—'}</td>
                      <td style={{ fontSize: 12 }}>{c.registration_date ? new Date(c.registration_date).toLocaleDateString() : '—'}</td>
                      <td>{c.reservations_count ?? 0}</td>
                      <td>{c.desk_reservations_count ?? 0}</td>
                      <td>{c.food_orders_count ?? 0}</td>
                      <td style={{ color: '#27ae60', fontWeight: 600 }}>ETB {Number(c.total_paid || 0).toFixed(2)}</td>
                      <td>
                        <button className="btn btn-sm btn-outline" onClick={() => viewCustomerHistory(c.id)}>History</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========== REFUNDS ========== */}
      {false && activeTab === 'refunds' && (
        <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #eee' }}>
          <h2 style={{ marginTop: 0 }}>💸 Pending Refunds</h2>
          {pendingRefunds.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', padding: 30 }}>No pending refunds.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Booking</th>
                    <th>Original</th>
                    <th>Penalty</th>
                    <th>Net Refund</th>
                    <th>Reason</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRefunds.map((rf) => (
                    <tr key={rf.id}>
                      <td><strong>{rf.first_name} {rf.last_name}</strong><div style={{ fontSize: 11, color: '#777' }}>{rf.email}</div></td>
                      <td><span className="badge badge-info">{rf.reservation_type?.toUpperCase()} #{rf.reservation_id}</span></td>
                      <td>ETB {Number(rf.original_amount).toFixed(2)}</td>
                      <td style={{ color: '#d9534f' }}>{rf.penalty_percentage}% (−{Number(rf.penalty_amount).toFixed(2)})</td>
                      <td style={{ fontWeight: 700, color: '#27ae60' }}>ETB {Number(rf.refund_amount).toFixed(2)}</td>
                      <td style={{ fontSize: 12, maxWidth: 180 }}>{rf.reason}</td>
                      <td>
                        <button className="btn btn-sm btn-success" onClick={() => handleAction('refund', rf.id, 'approve')}>✓</button>{' '}
                        <button className="btn btn-sm btn-danger" onClick={() => handleAction('refund', rf.id, 'reject')}>✗</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========== AVAILABILITY ========== */}
      {false && activeTab === 'availability' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #eee' }}>
            <h3>🛏️ Rooms</h3>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {allRooms.filter((r) => {
                        if (!checkInFilter && !checkOutFilter) return true;
                        const cin = r.check_in_date ? String(r.check_in_date).slice(0, 10) : '';
                        const cout = r.check_out_date ? String(r.check_out_date).slice(0, 10) : '';
                        if (checkInFilter && cout && cout < checkInFilter) return false;
                        if (checkOutFilter && cin && cin > checkOutFilter) return false;
                        if (checkInFilter && cin && cin < checkInFilter && (!cout || cout < checkInFilter)) return false;
                        return true;
                      }).map((rm) => (
                <div key={rm.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                  <div>
                    <strong>#{rm.room_number}</strong> ({rm.room_type})
                    <div style={{ fontSize: 12, color: '#666' }}>ETB {Number(rm.price_per_night || 0).toFixed(2)}/night</div>
                  </div>
                  <span className={`status-badge ${rm.status === 'available' ? 'status-approved' : 'status-rejected'}`}>{rm.status}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #eee' }}>
            <h3>🍽️ Desks</h3>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {allDesks.map((dk) => (
                <div key={dk.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                  <div>
                    <strong>#{dk.desk_number}</strong> ({dk.location})
                    <div style={{ fontSize: 12, color: '#666' }}>Cap: {dk.capacity}</div>
                  </div>
                  <span className={`status-badge ${dk.status === 'available' ? 'status-approved' : 'status-rejected'}`}>{dk.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========== FEEDBACK ========== */}
      {false && activeTab === 'feedback' && (
        <div style={{ background: '#fff', padding: 25, borderRadius: 12, border: '1px solid #eee', maxWidth: 600, margin: '0 auto' }}>
          <h3>💬 Feedback to Admin</h3>
          {statusMsg && <p style={{ color: '#27ae60', fontWeight: 700 }}>{statusMsg}</p>}
          <form onSubmit={handleSendFeedback}>
            <textarea
              rows={5}
              style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ccc', marginBottom: 15, boxSizing: 'border-box' }}
              placeholder="Operational notes, issues, recommendations..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: 12 }}>Submit</button>
          </form>
        </div>
      )}

      {/* PAYMENT DETAIL MODAL */}
      {paymentDetail && (
        <div style={modalOverlay} onClick={() => setPaymentDetail(null)}>
          <div style={{ ...modalBox, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPaymentDetail(null)} style={closeBtn}>×</button>
            <h3 style={{ marginTop: 0 }}>Payment Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: 14 }}>
              <div><strong>Transaction ID</strong><div><code>{paymentDetail.transaction_id || '—'}</code></div></div>
              <div><strong>Reference</strong><div><code>{paymentDetail.reference_number}</code></div></div>
              <div><strong>Payer</strong><div>{paymentDetail.first_name} {paymentDetail.last_name}</div></div>
              <div><strong>Email</strong><div>{paymentDetail.email}</div></div>
              <div><strong>Phone</strong><div>{paymentDetail.phone || '—'}</div></div>
              <div><strong>Method</strong><div>{(paymentDetail.payment_method || '').toUpperCase()}</div></div>
              <div><strong>Amount</strong><div style={{ color: '#27ae60', fontWeight: 700 }}>ETB {Number(paymentDetail.amount).toFixed(2)}</div></div>
              <div><strong>Status</strong><div>{paymentDetail.status}</div></div>
              <div><strong>Date</strong><div>{paymentDetail.transaction_date ? new Date(paymentDetail.transaction_date).toLocaleString() : '—'}</div></div>
              <div><strong>Related</strong><div>{(paymentDetail.reservation_type || paymentDetail.payment_type || '').toUpperCase()} #{paymentDetail.reservation_id}</div></div>
              <div><strong>Account</strong><div>{paymentDetail.account_name || '—'} {paymentDetail.account_number ? `(${paymentDetail.account_number})` : ''}</div></div>
              <div><strong>Notes</strong><div>{paymentDetail.notes || '—'}</div></div>
            </div>
            {paymentDetail.receipt_image && (
              <div style={{ marginTop: 16 }}>
                <strong>Payment proof</strong>
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => setPreviewMedia({ title: 'Payment Receipt', url: resolveUpload(paymentDetail.receipt_image) })}
                  >
                    📄 View / enlarge
                  </button>
                  <a
                    href={resolveUpload(paymentDetail.receipt_image)}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-outline"
                    style={{ marginLeft: 8, textDecoration: 'none' }}
                  >
                    ⬇️ Download
                  </a>
                </div>
              </div>
            )}
            {paymentDetail.status === 'pending' && (
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button className="btn btn-success" style={{ flex: 1, padding: 10 }} onClick={() => handleAction('payment', paymentDetail.id, 'approve')}>✓ Approve</button>
                <button className="btn btn-danger" style={{ flex: 1, padding: 10 }} onClick={() => handleAction('payment', paymentDetail.id, 'reject')}>✗ Reject</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CUSTOMER DETAIL MODAL */}
      {selectedCustomer && (() => {
        const cu = selectedCustomer.customer || {};
        const fromRoomsFront = (selectedCustomer.room_reservations || [])
          .map((r) => r.id_card_image)
          .find((x) => x);
        const fromRoomsBack = (selectedCustomer.room_reservations || [])
          .map((r) => r.id_card_back_image)
          .find((x) => x);
        const idSrc = resolveUpload(
          cu.id_card_image ||
          cu.id_card_url ||
          cu.id_card ||
          selectedCustomer.id_card_url ||
          fromRoomsFront
        );
        const idBackSrc = resolveUpload(
          cu.id_card_back_image ||
          cu.id_card_back_url ||
          selectedCustomer.id_card_back_url ||
          fromRoomsBack
        );
        return (
        <div style={modalOverlay} onClick={() => setSelectedCustomer(null)}>
          <div style={{ ...modalBox, maxWidth: 800, maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedCustomer(null)} style={closeBtn}>×</button>
            <h3 style={{ marginTop: 0 }}>Customer details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14, marginBottom: 16 }}>
              <div><strong>First name:</strong> {cu.first_name || '—'}</div>
              <div><strong>Last name:</strong> {cu.last_name || '—'}</div>
              <div><strong>Username:</strong> {cu.username || '—'}</div>
              <div><strong>Email:</strong> {cu.email || '—'}</div>
              <div><strong>Phone:</strong> {cu.phone || '—'}</div>
              <div><strong>Registered:</strong> {cu.registration_date ? new Date(cu.registration_date).toLocaleString() : '—'}</div>
              <div><strong>Country:</strong> {cu.country || '—'}</div>
              <div><strong>Region:</strong> {cu.region || '—'}</div>
              <div><strong>Zone:</strong> {cu.zone || '—'}</div>
              <div><strong>Woreda:</strong> {cu.wereda || '—'}</div>
              <div><strong>Kebele:</strong> {cu.kebele || '—'}</div>
              <div><strong>Address:</strong> {cu.address || '—'}</div>
              <div><strong>Sex:</strong> {cu.sex || '—'}</div>
              <div><strong>Age:</strong> {cu.age || '—'}</div>
              <div><strong>FIDA:</strong> {cu.fida_number || '—'}</div>
            </div>

            <h4 style={{ marginBottom: 8 }}>Identification cards (front & back)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ textAlign: 'center', border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Front of ID</div>
                {idSrc ? (
                  <>
                    {String(idSrc).toLowerCase().endsWith('.pdf') ? (
                      <a href={idSrc} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Open PDF</a>
                    ) : (
                      <img
                        src={idSrc}
                        alt="ID front"
                        style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, border: '1px solid #ddd', objectFit: 'contain', cursor: 'pointer' }}
                        onClick={() => setPreviewMedia({ title: 'ID Front', url: idSrc })}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <div style={{ marginTop: 6 }}>
                      <a href={idSrc} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Open full size</a>
                    </div>
                  </>
                ) : (
                  <p style={{ color: '#888', fontSize: 13 }}>No front ID on file</p>
                )}
              </div>
              <div style={{ textAlign: 'center', border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Back of ID</div>
                {idBackSrc ? (
                  <>
                    {String(idBackSrc).toLowerCase().endsWith('.pdf') ? (
                      <a href={idBackSrc} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Open PDF</a>
                    ) : (
                      <img
                        src={idBackSrc}
                        alt="ID back"
                        style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, border: '1px solid #ddd', objectFit: 'contain', cursor: 'pointer' }}
                        onClick={() => setPreviewMedia({ title: 'ID Back', url: idBackSrc })}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    <div style={{ marginTop: 6 }}>
                      <a href={idBackSrc} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Open full size</a>
                    </div>
                  </>
                ) : (
                  <p style={{ color: '#888', fontSize: 13 }}>No back ID on file</p>
                )}
              </div>
            </div>

            <h4>Room reservations</h4>
            <ul style={{ fontSize: 13 }}>{(selectedCustomer.room_reservations || []).length === 0 ? <li>None</li> : (selectedCustomer.room_reservations || []).map((r) => (
              <li key={r.id}>#{r.id} Room {r.room_number} · {r.check_in_date} → {r.check_out_date} · {r.status} · ETB {Number(r.total_price || 0).toFixed(2)}</li>
            ))}</ul>
            <h4>Desk reservations</h4>
            <ul style={{ fontSize: 13 }}>{(selectedCustomer.desk_reservations || []).length === 0 ? <li>None</li> : (selectedCustomer.desk_reservations || []).map((d) => (
              <li key={d.id}>#{d.id} Desk {d.desk_number} · {d.reservation_date} · {d.status}</li>
            ))}</ul>
            <h4>Food orders</h4>
            <ul style={{ fontSize: 13 }}>{(selectedCustomer.food_orders || []).length === 0 ? <li>None</li> : (selectedCustomer.food_orders || []).map((o) => (
              <li key={o.id}>#{o.id} · ETB {Number(o.total_amount || 0).toFixed(2)} · {o.status}</li>
            ))}</ul>
            <h4>Payments</h4>
            <ul style={{ fontSize: 13 }}>{(selectedCustomer.payments || []).length === 0 ? <li>None</li> : (selectedCustomer.payments || []).map((p) => (
              <li key={p.id}>{p.reference_number} · ETB {Number(p.amount).toFixed(2)} · {p.status} · {p.transaction_id}</li>
            ))}</ul>
          </div>
        </div>
        );
      })()}

      {/* REJECTION MODAL */}
      {rejectionModal && (
        <div style={modalOverlay}>
          <div style={{ ...modalBox, maxWidth: 450 }}>
            <button onClick={() => setRejectionModal(null)} style={closeBtn}>×</button>
            <h3 style={{ marginTop: 0, color: '#d9534f' }}>Rejection reason</h3>
            <p style={{ color: '#666', fontSize: 13 }}>Reason is stored and sent to the customer.</p>
            <form onSubmit={handleRejectionSubmit}>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                required
                placeholder="e.g. Invalid payment reference..."
                style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box', marginBottom: 15 }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setRejectionModal(null)} style={{ flex: 1, padding: 10, border: '1px solid #ccc', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ flex: 1, padding: 10, border: 'none', borderRadius: 6, background: '#d9534f', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Confirm Reject</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MEDIA PREVIEW */}
      {previewMedia && (
        <div style={{ ...modalOverlay, background: 'rgba(0,0,0,0.85)' }} onClick={() => setPreviewMedia(null)}>
          <div style={{ ...modalBox, maxWidth: 700, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPreviewMedia(null)} style={closeBtn}>×</button>
            <h3 style={{ marginTop: 0 }}>{previewMedia.title}</h3>
            {(previewMedia.url || '').toLowerCase().endsWith('.pdf') ? (
              <iframe src={previewMedia.url} title="Document" style={{ width: '100%', height: 450, border: 'none', borderRadius: 8 }} />
            ) : (
              <img src={previewMedia.url} alt="Proof" style={{ maxWidth: '100%', maxHeight: 450, objectFit: 'contain', borderRadius: 8 }} />
            )}
            <div style={{ marginTop: 15 }}>
              <a href={previewMedia.url} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ padding: '8px 16px', textDecoration: 'none' }}>
                Open / Download
              </a>
            </div>
          </div>
        </div>
      )}

      {/* FOOD ITEMS */}
      {foodItemsModal && (
        <div style={modalOverlay} onClick={() => setFoodItemsModal(null)}>
          <div style={{ ...modalBox, maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setFoodItemsModal(null)} style={closeBtn}>×</button>
            <h3 style={{ marginTop: 0 }}>Order #{foodItemsModal} items</h3>
            <ul style={{ paddingLeft: 20 }}>
              {foodItems.map((item, idx) => (
                <li key={idx} style={{ marginBottom: 8 }}>
                  <strong>{item.item_name}</strong> × {item.quantity} = ETB {Number(item.subtotal || item.price * item.quantity || 0).toFixed(2)}
                </li>
              ))}
            </ul>
            <button onClick={() => setFoodItemsModal(null)} className="btn btn-primary" style={{ width: '100%', marginTop: 12 }}>Close</button>
          </div>
        </div>
      )}

      <style>{`
        .tab-btn { padding: 10px 16px; border: 1px solid #ddd; background: #fff; border-radius: 8px; cursor: pointer; font-weight: 600; color: #555; transition: all 0.2s; font-size: 13px; }
        .tab-btn.active { background: #f0a500; color: #1a1a2e; border-color: #f0a500; }
        .custom-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
        .custom-table th, .custom-table td { padding: 11px 12px; text-align: left; border-bottom: 1px solid #eee; }
        .custom-table th { background: #f8f9fa; color: #333; font-weight: 700; white-space: nowrap; }
        .badge { padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; }
        .badge-info { background: #e2f0fb; color: #0c5460; }
        .badge-warning { background: #fff3cd; color: #856404; }
        .badge-success { background: #d4edda; color: #155724; }
        .status-badge { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
        .status-approved { background: #d4edda; color: #155724; }
        .status-rejected { background: #f8d7da; color: #721c24; }
        .status-pending { background: #fff3cd; color: #856404; }
        .btn { border: none; border-radius: 6px; cursor: pointer; font-weight: 700; transition: all 0.2s; }
        .btn-sm { padding: 6px 11px; font-size: 12px; }
        .btn-success { background: #27ae60; color: #fff; }
        .btn-danger { background: #d9534f; color: #fff; }
        .btn-primary { background: #f0a500; color: #1a1a2e; }
        .btn-outline { border: 1px solid #ccc; background: #fff; color: #333; }
      `}</style>
    </div>
  );
}

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #ddd',
  fontSize: 13,
  minWidth: 140,
};

const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 20,
};

const modalBox = {
  background: '#fff', borderRadius: 14, width: '100%', padding: 24, position: 'relative',
};

const closeBtn = {
  position: 'absolute', top: 12, right: 14, border: 'none', background: 'none', fontSize: 24, cursor: 'pointer',
};


function UnreadBlock({ title, items, empty, onOpen }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>{title}</strong>
        <button type="button" className="btn btn-sm btn-primary" onClick={onOpen}>Open</button>
      </div>
      {!(items && items.length) ? (
        <p style={{ color: '#888', fontSize: 13 }}>{empty}</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, maxHeight: 220, overflowY: 'auto' }}>
          {items.map((it) => (
            <li key={it.id} style={{ marginBottom: 6 }}>{it.line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const chipStyle = {
  background: '#f0a500',
  color: '#1a1a2e',
  padding: '6px 12px',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 700,
};
