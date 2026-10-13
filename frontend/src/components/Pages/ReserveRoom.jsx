import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';

/**
 * Room reservation with dual-side ID camera scan.
 * Verifies full name, PIN/FAN, and phone against OCR of both sides.
 */
const ReserveRoom = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const todayStr = () => {
    const n = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
  };

  const location = useLocation();
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [numberOfGuests, setNumberOfGuests] = useState(1);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [pinNumber, setPinNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [hasStoredId, setHasStoredId] = useState(false);
  const [storedFida, setStoredFida] = useState('');

  // Camera / ID scan state
  const [frontFile, setFrontFile] = useState(null);
  const [backFile, setBackFile] = useState(null);
  const [frontPreview, setFrontPreview] = useState('');
  const [backPreview, setBackPreview] = useState('');
  const [cameraSide, setCameraSide] = useState(null); // 'front' | 'back' | null
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (user) {
      setFullName(`${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim() || user.username || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
    }
    const params = new URLSearchParams(location.search);
    const roomId = params.get('roomId');
    api
      .get('/rooms/available')
      .then((res) => {
        const list = res.data.rooms || [];
        setRooms(list);
        if (roomId) setSelectedRoomId(Number(roomId));
        else if (list.length > 0) setSelectedRoomId(list[0].id);
      })
      .catch(() => toast.error('Unable to load available rooms.'));
  }, [user, location.search]);

  const [scanHint, setScanHint] = useState('');
  const [autoReady, setAutoReady] = useState(0); // 0..100 progress toward auto-capture
  const autoTimerRef = useRef(null);
  const lastFrameRef = useRef(null);
  const stableCountRef = useRef(0);
  const capturingRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraSide(null);
    setScanHint('');
    setAutoReady(0);
    stableCountRef.current = 0;
    lastFrameRef.current = null;
    capturingRef.current = false;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  /** Score frame: brightness, contrast, edge energy — high when an ID card fills the view steadily */
  const scoreFrame = (video) => {
    const w = 160;
    const h = 90;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let sum = 0;
    let sumSq = 0;
    let edge = 0;
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[p] = g;
      sum += g;
      sumSq += g * g;
    }
    const n = w * h;
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    // simple horizontal gradient energy
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const dx = Math.abs(gray[i] - gray[i - 1]);
        const dy = Math.abs(gray[i] - gray[i - w]);
        edge += dx + dy;
      }
    }
    edge /= n;
    // motion vs previous frame
    let motion = 0;
    if (lastFrameRef.current && lastFrameRef.current.length === gray.length) {
      for (let i = 0; i < gray.length; i++) {
        motion += Math.abs(gray[i] - lastFrameRef.current[i]);
      }
      motion /= n;
    }
    lastFrameRef.current = gray;
    // Good card photo: moderate brightness, enough contrast, visible edges, low motion
    const brightOk = mean > 25 && mean < 245;
    const contrastOk = variance > 150;
    const edgeOk = edge > 3;
    // Always allow OCR attempts after brief settle; quality is soft preference
    const good = brightOk && (contrastOk || edgeOk) && motion < 25;
    return { mean, variance, edge, motion, good };
  };

  const doCapture = useCallback((side) => {
    const video = videoRef.current;
    if (!video || !side || capturingRef.current) return;
    if (!video.videoWidth) return;
    capturingRef.current = true;
    const canvas = document.createElement('canvas');
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          capturingRef.current = false;
          toast.error('Capture failed. Hold the ID steady and try again.');
          return;
        }
        const file = new File([blob], `id-${side}-${Date.now()}.jpg`, { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        if (side === 'front') {
          setFrontFile(file);
          setFrontPreview(url);
          toast.success('Front of ID captured automatically');
        } else {
          setBackFile(file);
          setBackPreview(url);
          toast.success('Back of ID captured automatically');
        }
        stopCamera();
      },
      'image/jpeg',
      0.92
    );
  }, [stopCamera]);

  const scanningRef = useRef(false);

  const startAutoDetect = useCallback(
    (side) => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      stableCountRef.current = 0;
      setAutoReady(0);
      scanningRef.current = false;
      if (side === 'front') {
        setScanHint('Show the FRONT of the ID');
      } else {
        setScanHint('Show the BACK of the ID ');
      }

      let attempt = 0;
      autoTimerRef.current = setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || capturingRef.current || scanningRef.current) return;

        const s = scoreFrame(video);
        // After 2 attempts, OCR even if quality is imperfect (still skip total darkness)
        attempt += 1;
        if (s.mean < 20) {
          setScanHint('Too dark — add light');
          return;
        }
        if (s.motion > 40 && attempt < 3) {
          setScanHint('Hold the phone steady…');
          return;
        }

        scanningRef.current = true;
        setScanHint(side === 'front'
          ? 'Scanning front for full name…'
          : 'Scanning back for PIN and phone…');
        setAutoReady(35);

        try {
          const canvas = document.createElement('canvas');
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;
          const w = Math.min(vw, 800);
          const h = Math.round((w / vw) * vh);
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(video, 0, 0, w, h);
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
          if (!blob) {
            scanningRef.current = false;
            setScanHint('Could not grab frame');
            return;
          }

          const fd = new FormData();
          fd.append('frame', blob, `frame-${side}.jpg`);
          fd.append('side', side);
          fd.append('fullName', fullName || '');
          fd.append('pinNumber', pinNumber || '');
          fd.append('phone', phone || '');

          // OCR can take 15–60s on first run — long timeout
          const res = await api.post('/reservations/scan-frame', fd, { timeout: 90000 });
          setAutoReady(75);

          if (res.data && res.data.matched) {
            setAutoReady(100);
            setScanHint(res.data.message || 'Matched — saving…');
            if (autoTimerRef.current) {
              clearInterval(autoTimerRef.current);
              autoTimerRef.current = null;
            }
            doCapture(side);
            return;
          }

          setScanHint((res.data && res.data.message)
            ? res.data.message + ' — adjust and wait'
            : 'Not matched yet — keep ID in frame');
          setAutoReady(15);
        } catch (err) {
          console.error('scan-frame error', err);
          const msg = err.response?.data?.message
            || (err.code === 'ECONNABORTED' ? 'Scan timed out — still trying…' : null)
            || err.message
            || 'Scan failed';
          setScanHint(msg);
          setAutoReady(5);
        } finally {
          scanningRef.current = false;
        }
      }, 2500); // every 2.5s (OCR needs time)
    },
    [doCapture, fullName, pinNumber, phone]
  );

  const openCamera = async (side) => {
    setCameraError('');
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraSide(side);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { });
          startAutoDetect(side);
        }
      }, 150);
    } catch (err) {
      console.error(err);
      setCameraError(
        'Camera not available. Allow camera permission or upload photos of both sides of the ID instead.'
      );
      toast.error('Could not open camera. You can upload ID images instead.');
    }
  };

  const onFilePick = (side, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.match(/^image\//) && file.type !== 'application/pdf') {
      toast.error('Use JPG, PNG, WEBP, or PDF');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB');
      return;
    }
    const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    if (side === 'front') {
      setFrontFile(file);
      setFrontPreview(url);
    } else {
      setBackFile(file);
      setBackPreview(url);
    }
  };


  useEffect(() => {
    if (!user) return;
    const fn = (user.first_name || user.firstName || '').trim();
    const ln = (user.last_name || user.lastName || '').trim();
    if (fn || ln) setFullName(`${fn} ${ln}`.trim());
    if (user.email) setEmail(user.email);
    if (user.phone) setPhone(user.phone);
    const idOnFile = !!(user.has_id_on_file || user.customer?.has_id_on_file);
    setHasStoredId(idOnFile);
    const fida = user.fida_number || user.customer?.fida_number || '';
    if (fida) {
      setStoredFida(String(fida));
      setPinNumber(String(fida));
    }
    // Refresh from API for latest customer ID flags
    api.get('/auth/me').then((res) => {
      const u = res.data?.user;
      if (!u) return;
      const stored = !!(u.has_id_on_file || u.customer?.has_id_on_file);
      setHasStoredId(stored);
      if (u.fida_number || u.customer?.fida_number) {
        const f = String(u.fida_number || u.customer.fida_number);
        setStoredFida(f);
        setPinNumber(f);
      }
      if (u.email) setEmail(u.email);
      if (u.phone) setPhone(u.phone);
      const f1 = (u.first_name || u.firstName || '').trim();
      const f2 = (u.last_name || u.lastName || '').trim();
      if (f1 || f2) setFullName(`${f1} ${f2}`.trim());
    }).catch(() => { });
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please log in before making a room reservation.');
      navigate('/login');
      return;
    }
    if (!selectedRoomId) {
      toast.error('Please select a room.');
      return;
    }
    if (!checkInDate || !checkOutDate) {
      toast.error('Check-in and check-out dates are required.');
      return;
    }
    if (!hasStoredId) {
      if (!frontFile) {
        toast.error('Scan or upload the FRONT of your ID card.');
        return;
      }
      if (!backFile) {
        toast.error('Scan or upload the BACK of your ID card.');
        return;
      }
      if (!pinNumber || String(pinNumber).replace(/\D/g, '').length < 6) {
        toast.error('Enter the PIN / FAN number from your ID ');
        return;
      }
    }

    const regFirst = (user.first_name || user.firstName || '').trim();
    const regLast = (user.last_name || user.lastName || '').trim();
    if (!regFirst || !regLast) {
      toast.error('Your profile must include first and last name. Update your profile first.');
      return;
    }
    const regName = `${regFirst} ${regLast}`.trim().toLowerCase();
    const formParts = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!regName.split(/\s+/).every((p) => formParts.includes(p)) && fullName.trim().toLowerCase() !== regName) {
      toast.error(`Full name must match your registration: ${regFirst} ${regLast}`);
      return;
    }
    const today = todayStr();
    if (checkInDate < today) {
      toast.error('Check-in date cannot be in the past.');
      return;
    }
    if (checkOutDate < today) {
      toast.error('Check-out date cannot be in the past.');
      return;
    }
    if (new Date(checkOutDate) <= new Date(checkInDate)) {
      toast.error('Check-out date must be after check-in date.');
      return;
    }

    if (!hasStoredId) {
      if (!(frontFile instanceof Blob) && !(frontFile && frontFile.size)) {
        toast.error('Front ID image is missing. Scan or upload the front of your ID.');
        return;
      }
      if (!(backFile instanceof Blob) && !(backFile && backFile.size)) {
        toast.error('Back ID image is missing. Scan or upload the back of your ID.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('roomId', String(selectedRoomId));
      formData.append('checkInDate', checkInDate);
      formData.append('checkOutDate', checkOutDate);
      formData.append('numberOfGuests', String(numberOfGuests || 1));
      formData.append('fullName', (fullName || '').trim());
      formData.append('email', email || '');
      formData.append('phone', phone || '');
      formData.append('specialRequests', specialRequests || '');
      formData.append('pinNumber', (pinNumber || storedFida || '').trim());
      formData.append('fidaNumber', (pinNumber || storedFida || '').trim());
      if (frontFile) {
        formData.append('idCardFront', frontFile, frontFile.name || 'id-front.jpg');
        formData.append('idCard', frontFile, frontFile.name || 'id-front.jpg');
      }
      if (backFile) {
        formData.append('idCardBack', backFile, backFile.name || 'id-back.jpg');
      }

      const res = await api.post('/reservations', formData, { timeout: 120000 });
      if (res.data && res.data.success) {
        toast.success(res.data.message || 'Reservation created. Proceeding to payment…');
        const id = res.data.reservation && res.data.reservation.id;
        navigate(id ? `/payment?type=room&id=${id}` : '/dashboard/customer');
      } else {
        toast.error((res.data && res.data.message) || 'Reservation failed');
      }
    } catch (error) {
      console.error('Reservation error:', error.response?.data || error);
      const data = error.response && error.response.data;
      const msg =
        (data && (data.message || data.error)) ||
        (error.code === 'ECONNABORTED' ? 'Request timed out. Try again with smaller/clearer ID photos.' : null) ||
        error.message ||
        'Error submitting reservation.';
      toast.error(String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="inside" style={{ textAlign: 'center', padding: 40 }}>
        <h2>Login required</h2>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/login')}>
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <div className="inside">
      <div style={styles.header}>
        <h1>Reserve a Room</h1>
        <p>Scan both sides of your national ID with the camera.</p>
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <h3>Select room</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
            {rooms.map((rm) => (
              <button
                key={rm.id}
                type="button"
                style={selectedRoomId === rm.id ? styles.roomButtonActive : styles.roomButton}
                onClick={() => setSelectedRoomId(rm.id)}
              >
                <strong>
                  #{rm.room_number} · {rm.room_type}
                </strong>
                <span style={{ fontSize: 13, color: '#666' }}>ETB {Number(rm.price_per_night || 0).toFixed(2)} / night</span>
              </button>
            ))}
            {rooms.length === 0 && <p style={{ color: '#888' }}>No rooms available for default dates.</p>}
          </div>
        </div>

        <div style={styles.card}>
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.sectionTitle}>Dates</div>
            <div style={styles.row}>
              <div>
                <label style={styles.label}>Check-in:</label>
                <input style={styles.input} type="date" min={todayStr()} value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} required />
              </div>
              <div>
                <label style={styles.label}>Check-out:</label>
                <input style={styles.input} type="date" min={todayStr()} value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} required />
              </div>
            </div>
            <div>
              <label style={styles.label}>Guests</label>
              <input style={styles.input} type="number" min={1} value={numberOfGuests} onChange={(e) => setNumberOfGuests(e.target.value)} />
            </div>

            <div style={styles.sectionTitle}>Personal details</div>
            <div>
              <label style={styles.label}>Full name:</label>
              <input
                style={{ ...styles.input, background: '#f0f0f0' }}
                value={fullName}
                readOnly
                disabled
              />
            </div>
            <div style={styles.row}>
              <div>
                <label style={styles.label}>Email:</label>
                <input style={{ ...styles.input, background: '#f0f0f0' }} type="email" value={email} readOnly disabled />
              </div>
              <div>
                <label style={styles.label}>Phone:</label>
                <input style={{ ...styles.input, background: '#f0f0f0' }} value={phone} readOnly disabled />
              </div>
            </div>
            <div>
              <label style={styles.label}>PIN / FAN number:</label>
              <input
                style={styles.input}
                value={pinNumber}
                onChange={(e) => setPinNumber(e.target.value)}
                placeholder="e.g. 6583612897620451"
                required
              />
            </div>

            {hasStoredId ? (
              <div style={{ background: '#e8f8ef', border: '1px solid #b8e6c8', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <strong style={{ color: '#1a7f37' }}>✓ ID already on file</strong>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#555' }}>
                  Your ID and personal details are stored from a previous reservation.
                  {storedFida ? ` FIDA/PIN on file: ${storedFida}` : ''}
                </p>
              </div>
            ) : (
              <>
                <div style={styles.sectionTitle}>ID card scan (both sides)</div>


                {cameraError && <p style={{ color: '#c0392b', fontSize: 13 }}>{cameraError}</p>}

                {cameraSide && (
                  <div style={{ background: '#111', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                    <p style={{ color: '#f0a500', fontWeight: 700, marginTop: 0 }}>
                      Auto-scanning {cameraSide === 'front' ? 'FRONT' : 'BACK'} of ID
                    </p>

                    <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', maxHeight: 320, borderRadius: 8, background: '#000' }}
                      />
                      <div
                        style={{
                          pointerEvents: 'none',
                          position: 'absolute',
                          left: '8%',
                          right: '8%',
                          top: '12%',
                          bottom: '12%',
                          border: '2px dashed rgba(240,165,0,0.85)',
                          borderRadius: 10,
                        }}
                      />
                    </div>
                    <p style={{ color: '#fff', fontSize: 14, marginTop: 10 }}>{scanHint || 'Looking for ID…'}</p>
                    <div style={{ height: 8, background: '#333', borderRadius: 4, overflow: 'hidden', margin: '8px 20px' }}>
                      <div style={{ height: '100%', width: `${autoReady}%`, background: '#f0a500', transition: 'width 0.15s' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '10px 18px' }}
                        onClick={async () => {
                          const video = videoRef.current;
                          if (!video || !cameraSide || scanningRef.current) return;
                          scanningRef.current = true;
                          setScanHint('Checking current frame…');
                          try {
                            const canvas = document.createElement('canvas');
                            const vw = video.videoWidth || 640;
                            const vh = video.videoHeight || 480;
                            const w = Math.min(vw, 800);
                            const h = Math.round((w / vw) * vh);
                            canvas.width = w;
                            canvas.height = h;
                            canvas.getContext('2d').drawImage(video, 0, 0, w, h);
                            const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
                            const fd = new FormData();
                            fd.append('frame', blob, 'frame.jpg');
                            fd.append('side', cameraSide);
                            fd.append('fullName', fullName || '');
                            fd.append('pinNumber', pinNumber || '');
                            fd.append('phone', phone || '');
                            const res = await api.post('/reservations/scan-frame', fd, { timeout: 90000 });
                            if (res.data?.matched) {
                              setScanHint(res.data.message || 'Matched');
                              doCapture(cameraSide);
                            } else {
                              setScanHint(res.data?.message || 'Not matched on this frame');
                              toast.error(res.data?.message || 'Not matched yet');
                            }
                          } catch (err) {
                            toast.error(err.response?.data?.message || err.message || 'Scan failed');
                            setScanHint(err.response?.data?.message || 'Scan failed');
                          } finally {
                            scanningRef.current = false;
                          }
                        }}
                      >
                        Check frame now
                      </button>
                      <button type="button" className="btn btn-outline" onClick={stopCamera} style={{ padding: '10px 18px', background: '#fff' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={scanBox}>
                    <strong>Front of ID *</strong>
                    {frontPreview ? (
                      <img src={frontPreview} alt="ID front" style={previewImg} />
                    ) : (
                      <div style={placeholder}>No front image</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: 8 }}
                        onClick={() => {
                          if (!fullName || fullName.trim().split(/\s+/).length < 2) {
                            toast.error('Enter your full name (first and last) before scanning the front');
                            return;
                          }
                          openCamera('front');
                        }}
                      >
                        Open camera — front
                      </button>
                      <label style={{ fontSize: 12, cursor: 'pointer', color: '#2980b9' }}>
                        Or upload front photo
                        <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => onFilePick('front', e)} />
                      </label>
                    </div>
                  </div>
                  <div style={scanBox}>
                    <strong>Back of ID *</strong>
                    {backPreview ? (
                      <img src={backPreview} alt="ID back" style={previewImg} />
                    ) : (
                      <div style={placeholder}>No back image</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: 8 }}
                        onClick={() => {
                          if (!pinNumber || String(pinNumber).replace(/\D/g, '').length < 6) {
                            toast.error('Enter PIN/FAN number before scanning the back');
                            return;
                          }
                          if (!phone || String(phone).replace(/\D/g, '').length < 8) {
                            toast.error('Enter your phone number before scanning the back');
                            return;
                          }
                          openCamera('back');
                        }}
                      >
                        Open camera — back
                      </button>
                      <label style={{ fontSize: 12, cursor: 'pointer', color: '#2980b9' }}>
                        Or upload back photo
                        <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => onFilePick('back', e)} />
                      </label>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div>
              <label style={styles.label}>Special requests</label>
              <textarea style={{ ...styles.input, minHeight: 60 }} value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} />
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: 8,
                padding: 14,
                background: '#f0a500',
                color: '#1a1a2e',
                border: 'none',
                borderRadius: 8,
                fontWeight: 'bold',
                fontSize: 16,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Scanning ID & creating reservation…' : 'Scan ID & continue to payment'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const scanBox = {
  border: '1px solid #ddd',
  borderRadius: 10,
  padding: 12,
  background: '#fafafa',
};
const previewImg = { width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, marginTop: 8 };
const placeholder = {
  height: 100,
  marginTop: 8,
  background: '#eee',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#888',
  fontSize: 13,
};

const styles = {
  header: { textAlign: 'center', marginBottom: 20 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 24 },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    border: '1px solid #eee',
    boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginTop: 10,
    borderBottom: '1px solid #eee',
    paddingBottom: 4,
  },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  label: { display: 'block', fontSize: 13, fontWeight: 'bold', marginBottom: 4, color: '#333' },
  input: {
    width: '100%',
    padding: 10,
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 14,
    boxSizing: 'border-box',
  },
  roomButton: {
    display: 'flex',
    flexDirection: 'column',
    padding: 12,
    borderRadius: 8,
    border: '1px solid #ddd',
    background: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
  },
  roomButtonActive: {
    display: 'flex',
    flexDirection: 'column',
    padding: 12,
    borderRadius: 8,
    border: '2px solid #f0a500',
    background: '#fff7e6',
    cursor: 'pointer',
    textAlign: 'left',
  },
};

export default ReserveRoom;
