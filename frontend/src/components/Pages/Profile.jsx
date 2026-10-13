import React, { useContext, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';

const API_ORIGIN = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

const resolveImage = (path) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || path.startsWith('blob:')) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? path : '/' + path}`;
};

export default function Profile() {
  const { user, updateUser } = useContext(AuthContext);
  const isStaff = ['admin', 'manager', 'receptionist'].includes(user?.role);

  const [form, setForm] = useState({
    username: user?.username || '',
    firstName: user?.firstName || user?.first_name || '',
    lastName: user?.lastName || user?.last_name || '',
    phone: user?.phone || '',
    address: user?.address || '',
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(resolveImage(user?.profile_image));
  const [saving, setSaving] = useState(false);

  if (!user) {
    return (
      <div className="inside">
        <div className="page-header"><h1>Update Profile</h1></div>
        <p>Please log in to view your profile.</p>
      </div>
    );
  }

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (form.newPassword || form.confirmNewPassword || form.currentPassword) {
      if (!form.currentPassword) {
        toast.error('Enter your current password to change it');
        return;
      }
      if (form.newPassword.length < 6) {
        toast.error('New password must be at least 6 characters');
        return;
      }
      if (form.newPassword !== form.confirmNewPassword) {
        toast.error('New passwords do not match');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = new FormData();
      if (!isStaff && form.username) payload.append('username', form.username);
      payload.append('firstName', form.firstName || '');
      payload.append('lastName', form.lastName || '');
      payload.append('phone', form.phone || '');
      payload.append('address', form.address || '');
      if (form.newPassword) {
        payload.append('currentPassword', form.currentPassword);
        payload.append('newPassword', form.newPassword);
      }
      if (imageFile) payload.append('profileImage', imageFile);

      // Prefer POST for multipart reliability across proxies
      let res;
      try {
        res = await api.post('/auth/profile', payload);
      } catch (err1) {
        res = await api.put('/auth/profile', payload);
      }

      if (res.data.success && res.data.user) {
        updateUser(res.data.user);
        try {
          localStorage.setItem('user', JSON.stringify(res.data.user));
        } catch (_) {}
        toast.success(res.data.message || 'Profile updated successfully');
        setForm((f) => ({ ...f, currentPassword: '', newPassword: '', confirmNewPassword: '' }));
        setImageFile(null);
        if (res.data.user.profile_image) {
          setPreview(resolveImage(res.data.user.profile_image));
        }
      } else {
        toast.error(res.data.message || 'Failed to update profile');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to update profile';
      // Never show payment errors on profile page
      if (String(msg).toLowerCase().includes('payment')) {
        toast.error('Profile update failed. Please try again or re-login.');
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="inside">
      <div className="page-header">
        <div>
          <h1 className="page-title">Update Profile</h1>
          <p className="page-subtitle">Manage your personal information, photo, and password</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 20 }}>
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                overflow: 'hidden',
                background: '#eee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #ddd',
              }}
            >
              {preview ? (
                <img src={preview} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 28, fontWeight: 700, color: '#888' }}>
                  {(form.firstName || user.username || '?').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>
                Profile image
              </label>
              <input type="file" accept="image/*" onChange={handleImagePick} />
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>JPG, PNG up to 5MB</div>
            </div>
          </div>

          {!isStaff && (
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Username</label>
              <input className="form-input" value={form.username} onChange={handleChange('username')} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">First name</label>
              <input className="form-input" value={form.firstName} onChange={handleChange('firstName')} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Last name</label>
              <input className="form-input" value={form.lastName} onChange={handleChange('lastName')} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Phone</label>
            <input className="form-input" value={form.phone} onChange={handleChange('phone')} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Address</label>
            <input className="form-input" value={form.address} onChange={handleChange('address')} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          </div>

          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #eee' }} />
          <h3 style={{ marginTop: 0 }}>Change password (optional)</h3>

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Current password</label>
            <input type="password" className="form-input" value={form.currentPassword} onChange={handleChange('currentPassword')} autoComplete="current-password" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">New password</label>
            <input type="password" className="form-input" value={form.newPassword} onChange={handleChange('newPassword')} autoComplete="new-password" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Confirm new password</label>
            <input type="password" className="form-input" value={form.confirmNewPassword} onChange={handleChange('confirmNewPassword')} autoComplete="new-password" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd' }} />
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '12px 20px', fontWeight: 700 }}>
            {saving ? 'Saving...' : 'Save profile'}
          </button>
        </form>
      </div>
    </div>
  );
}
