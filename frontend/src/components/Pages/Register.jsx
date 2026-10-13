import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';

const lettersOnly = (value) => value.replace(/[^A-Za-z ]/g, '').replace(/  +/g, ' ');
const digitsOnlyPhone = (value) => value.replace(/\D/g, '').slice(0, 15);

const Register = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    const em = searchParams.get('email');
    const fn = searchParams.get('firstName');
    const ln = searchParams.get('lastName');
    if (em || fn || ln) {
      setFormData((prev) => ({
        ...prev,
        email: em || prev.email || '',
        firstName: fn || prev.firstName || '',
        lastName: ln || prev.lastName || '',
      }));
    }
  }, [searchParams]);

  const onNameChange = (field) => (e) => {
    const raw = e.target.value;
    const v = lettersOnly(raw);
    if (v !== raw) toast.error('Only letters and spaces are allowed in the name', { id: 'name-key' });
    setFormData((prev) => ({ ...prev, [field]: v }));
  };

  const onPhoneChange = (e) => {
    setFormData((prev) => ({ ...prev, phone: digitsOnlyPhone(e.target.value) }));
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
      toast.error('Please fill in all required fields');
      return;
    }
    const nameRe = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
    if (!nameRe.test(formData.firstName.trim()) || !nameRe.test(formData.lastName.trim())) {
      toast.error('Full name may only contain letters and spaces');
      return;
    }
    const email = formData.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    const phoneDigits = String(formData.phone || '').replace(/\D/g, '');
    if (!phoneDigits || phoneDigits.length < 10 || phoneDigits.length > 15) {
      toast.error('Phone number mmust be between 10 and 15 digits');
      return;
    }
    const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!strong.test(formData.password)) {
      toast.error('Password must be 8+ characters with uppercase, lowercase, a number, and a special character');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/register', {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email,
        phone: formData.phone,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
      });
      if (response.data.success) {
        toast.success(
          response.data.message ||
          'Check your email and click the link to create your account. You are not registered until you click it.',
          { duration: 12000 }
        );
        navigate('/login');
      } else {
        toast.error(response.data.message || 'Registration failed');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Create Account</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>First Name:</label>
            <input type="text" name="firstName" value={formData.firstName} onChange={onNameChange('firstName')} placeholder="Letters only" required />
          </div>
          <div className="form-group">
            <label>Last Name:</label>
            <input type="text" name="lastName" value={formData.lastName} onChange={onNameChange('lastName')} placeholder="Letters only" required />
          </div>
          <div className="form-group">
            <label>Email:</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Phone: </label>
            <input type="tel" name="phone" value={formData.phone} onChange={onPhoneChange} placeholder="e.g. 0912345678" required />
          </div>
          <div className="form-group">
            <label>Password:</label>
            <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="8+ upper, lower, number, special" required minLength={8} />
          </div>
          <div className="form-group">
            <label>Confirm Password:</label>
            <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required minLength={8} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>
        <div style={styles.footer}>
          <p>
            Already have an account? <Link to="/login" style={styles.link}>Sign in</Link>
          </p>
        </div>
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
  card: { background: '#fff', padding: 32, borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.08)', maxWidth: 440, width: '100%' },
  title: { margin: '0 0 6px', textAlign: 'center', color: '#1a1a2e' },
  sub: { textAlign: 'center', color: '#888', marginBottom: 20, fontSize: 14 },
  footer: { textAlign: 'center', marginTop: 20 },
  link: { color: '#f0a500', fontWeight: 700 },
};

export default Register;
