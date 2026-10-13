import React, { useState, useContext, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // forgot: null | 'request' | 'otp' | 'password'
  const [forgotStep, setForgotStep] = useState(null);
  const [forgotEmail, setForgotEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const otpCheckRef = useRef(false); // prevent duplicate OTP requests
  const { login, setAuthFromToken } = useContext(AuthContext);
  const navigate = useNavigate();

  const redirectByRole = (role) => {
    const r = (role || '').toLowerCase();
    if (r === 'admin') navigate('/dashboard/admin');
    else if (r === 'manager') navigate('/dashboard/manager');
    else if (r === 'receptionist') navigate('/dashboard/receptionist');
    else navigate('/dashboard/customer');
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const handleGoogleCredential = useCallback(
    async (response) => {
      try {
        setLoading(true);
        if (!response?.credential) {
          toast.error('Google did not return a credential. Try again.');
          return;
        }
        const res = await api.post('/auth/google', { credential: response.credential });
        if (res.data && res.data.success === true && res.data.token) {
          localStorage.setItem('token', res.data.token);
          if (typeof setAuthFromToken === 'function') {
            await setAuthFromToken(res.data.token, res.data.user);
          } else {
            localStorage.setItem('user', JSON.stringify(res.data.user));
            window.location.href = '/dashboard/customer';
            return;
          }
          toast.success('Signed in with Google');
          redirectByRole(res.data.user?.role);
          return;
        }
        if (res.data?.code === 'NOT_REGISTERED' || res.data?.requireRegistration) {
          toast.error(res.data.message || 'Please register this email first.');
          const params = new URLSearchParams();
          if (res.data.email) params.set('email', res.data.email);
          if (res.data.firstName) params.set('firstName', res.data.firstName);
          if (res.data.lastName) params.set('lastName', res.data.lastName);
          navigate('/register' + (params.toString() ? '?' + params.toString() : ''));
          return;
        }
        toast.error(res.data?.message || 'Google sign-in failed');
      } catch (err) {
        const status = err.response?.status;
        const data = err.response?.data || {};
        if (data.code === 'NOT_REGISTERED' || data.requireRegistration || status === 403 || status === 404) {
          toast.error(data.message || 'This Google email is not registered. Please register first.');
          const params = new URLSearchParams();
          if (data.email) params.set('email', data.email);
          if (data.firstName) params.set('firstName', data.firstName);
          if (data.lastName) params.set('lastName', data.lastName);
          navigate('/register' + (params.toString() ? '?' + params.toString() : ''));
          return;
        }
        toast.error(data.message || err.message || 'Google sign-in failed');
      } finally {
        setLoading(false);
      }
    },
    [setAuthFromToken, navigate]
  );

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || forgotStep) return;
    const scriptId = 'google-gsi';
    const init = () => {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });
      const el = document.getElementById('google-btn');
      if (el) {
        el.innerHTML = '';
        window.google.accounts.id.renderButton(el, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
        });
      }
    };
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = init;
      document.body.appendChild(s);
    } else {
      init();
    }
  }, [handleGoogleCredential, forgotStep]);

  // Countdown 2:00 → 0:00
  useEffect(() => {
    if (forgotStep !== 'otp' || otpSecondsLeft <= 0) return undefined;
    const t = setInterval(() => {
      setOtpSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [forgotStep, otpSecondsLeft > 0]);

  // Fast OTP check — runs once when 5th digit is typed (no extra delays)
  const verifyOtpNow = useCallback(async (code) => {
    const digits = String(code || '').replace(/\D/g, '').slice(0, 5);
    if (digits.length !== 5) return;
    if (otpCheckRef.current || otpVerified) return;
    otpCheckRef.current = true;
    setOtpVerifying(true);
    try {
      const res = await api.post(
        '/auth/verify-reset-otp',
        { email: forgotEmail.trim().toLowerCase(), otp: digits },
        { timeout: 8000 }
      );
      if (res.data && res.data.success) {
        setOtpVerified(true);
        setOtp(digits);
        toast.success('OTP verified');
        setForgotStep('password');
      } else {
        toast.error(res.data?.message || 'Invalid OTP');
        setOtp('');
        otpCheckRef.current = false;
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid or expired OTP');
      setOtp('');
      otpCheckRef.current = false;
    } finally {
      setOtpVerifying(false);
    }
  }, [forgotEmail, otpVerified]);

  const onOtpChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 5);
    setOtp(digits);
    if (digits.length === 5) {
      verifyOtpNow(digits);
    } else {
      otpCheckRef.current = false;
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error('Email and password are required');
      return;
    }
    setLoading(true);
    try {
      const result = await login(email.trim(), password);
      if (result?.success === false) {
        toast.error(result.message || 'Login failed');
        return;
      }
      toast.success('Welcome back');
      redirectByRole(result?.user?.role || localStorage.getItem('role'));
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const startOtpTimer = () => {
    setOtp('');
    setOtpVerified(false);
    otpCheckRef.current = false;
    setOtpSecondsLeft(120);
    setForgotStep('otp');
  };

  const handleForgotRequest = async (e) => {
    e.preventDefault();
    const em = forgotEmail.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      toast.error('Enter a valid registered email address');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: em });
      if (res.data.emailSent) {
        toast.success(res.data.message || 'OTP sent to your email (valid 2 minutes)');
      } else {
        toast.error(res.data.message || 'Could not send email. Check backend console for OTP.', {
          duration: 8000,
        });
      }
      startOtpTimer();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpSecondsLeft > 0 || loading) return;
    const em = forgotEmail.trim().toLowerCase();
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: em });
      toast.success(res.data.message || 'New OTP sent to your email');
      startOtpTimer();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not resend OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    const code = String(otp || '').trim();
    if (!/^\d{5}$/.test(code)) {
      toast.error('OTP missing — go back and enter the code again');
      setForgotStep('otp');
      return;
    }
    const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!strong.test(newPassword)) {
      toast.error('Password must be 8+ chars with upper, lower, number, and special character');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', {
        email: forgotEmail.trim().toLowerCase(),
        otp: code,
        newPassword,
      });
      toast.success(res.data.message || 'Password updated. You can sign in now.');
      setForgotStep(null);
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setEmail(forgotEmail.trim().toLowerCase());
      setPassword('');
      setOtpSecondsLeft(0);
      setOtpVerified(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed — OTP may be invalid or expired');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>
          {!forgotStep && 'Sign In'}
          {forgotStep === 'request' && 'Forgot password'}
          {forgotStep === 'otp' && 'Enter OTP'}
          {forgotStep === 'password' && 'New password'}
        </h2>
        <p style={styles.sub}>
          {!forgotStep && 'Sign in with your email and password'}
          {forgotStep === 'request' && 'Enter your registered email to receive a 5-digit OTP'}
          {forgotStep === 'otp' && 'Enter the 5-digit code sent to your email. It is checked automatically.'}
          {forgotStep === 'password' && 'OTP verified. Choose a new strong password.'}
        </p>

        {!forgotStep && (
          <>
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Email:</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="username"
                />
              </div>
              <div className="form-group">
                <label>Password:</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div style={{ textAlign: 'right', marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setForgotStep('request');
                    setForgotEmail(email);
                  }}
                  style={styles.linkBtn}
                >
                  Forgot password?
                </button>
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            {GOOGLE_CLIENT_ID && (
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <div style={{ color: '#999', marginBottom: 10, fontSize: 13 }}>or</div>
                <div id="google-btn" style={{ display: 'flex', justifyContent: 'center' }} />
              </div>
            )}
            <p style={{ textAlign: 'center', marginTop: 18 }}>
              No account? <Link to="/register" style={styles.link}>Register</Link>
            </p>
          </>
        )}

        {forgotStep === 'request' && (
          <form onSubmit={handleForgotRequest}>
            <div className="form-group">
              <label>EWnter email:</label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Sending OTP…' : 'Send OTP'}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-block"
              style={{ marginTop: 8 }}
              onClick={() => setForgotStep(null)}
            >
              Back to login
            </button>
          </form>
        )}

        {forgotStep === 'otp' && (
          <div>
            <div className="form-group">
              <label>Enter otp from Email:</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={otp}
                onChange={onOtpChange}
                placeholder="•••••"
                autoFocus
                disabled={otpVerifying}
                style={{ letterSpacing: 8, fontSize: 20, textAlign: 'center' }}
              />
              {otpVerifying && (
                <p style={{ color: '#666', fontSize: 13, marginTop: 6 }}>Checking OTP…</p>
              )}
            </div>

            <div
              style={{
                textAlign: 'center',
                margin: '12px 0 16px',
                fontWeight: 700,
                fontSize: 22,
                color: otpSecondsLeft > 0 ? '#1a1a2e' : '#c0392b',
              }}
            >
              {otpSecondsLeft > 0 ? (
                <>⏱ {formatTimer(otpSecondsLeft)}</>
              ) : (
                <>OTP expired</>
              )}
            </div>
            <p style={{ textAlign: 'center', fontSize: 13, color: '#888', marginTop: 0 }}>
              Code expires in 2 minutes.
            </p>

            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={otpSecondsLeft > 0 || loading}
              onClick={handleResendOtp}
              style={{
                opacity: otpSecondsLeft > 0 ? 0.5 : 1,
                cursor: otpSecondsLeft > 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {otpSecondsLeft > 0
                ? `Resend OTP (wait ${formatTimer(otpSecondsLeft)})`
                : loading
                  ? 'Sending…'
                  : 'Resend OTP'}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-block"
              style={{ marginTop: 8 }}
              onClick={() => {
                setForgotStep('request');
                setOtp('');
                setOtpSecondsLeft(0);
              }}
            >
              Change email
            </button>
            <button
              type="button"
              className="btn btn-outline btn-block"
              style={{ marginTop: 8 }}
              onClick={() => {
                setForgotStep(null);
                setOtp('');
                setOtpSecondsLeft(0);
              }}
            >
              Back to login
            </button>
          </div>
        )}

        {forgotStep === 'password' && (
          <form onSubmit={handleResetPassword}>
            <div
              style={{
                background: '#e8f8ef',
                border: '1px solid #b8e6c8',
                borderRadius: 8,
                padding: 10,
                marginBottom: 14,
                fontSize: 13,
                color: '#1a7f37',
              }}
            >
              {/*✓ OTP verified for {forgotEmail}*/}
            </div>
            <div className="form-group">
              <label>New password:</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
                placeholder="8+ upper, lower, number, special"
              />
            </div>
            <div className="form-group">
              <label>Confirm new password:</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-block"
              style={{ marginTop: 8 }}
              onClick={() => {
                setForgotStep('otp');
                setOtpVerified(false);
                setOtp('');
              }}
            >
              Back to OTP
            </button>
          </form>
        )}
      </div>
      <style>{`
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 14px; }
        .form-group input {
          width: 100%; padding: 12px 14px; border: 1px solid #ddd; border-radius: 6px;
          font-size: 15px; box-sizing: border-box;
        }
        .btn-block { width: 100%; padding: 12px; margin-top: 8px; }
      `}</style>
    </div>
  );
};

const styles = {
  container: { minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.08)', maxWidth: 420, width: '100%' },
  title: { margin: '0 0 6px', textAlign: 'center', color: '#1a1a2e' },
  sub: { textAlign: 'center', color: '#888', marginBottom: 20, fontSize: 14 },
  link: { color: '#f0a500', fontWeight: 700 },
  linkBtn: { background: 'none', border: 'none', color: '#f0a500', cursor: 'pointer', fontWeight: 600 },
};

export default Login;
