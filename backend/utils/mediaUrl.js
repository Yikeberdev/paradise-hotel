/**
 * Resolve media paths.
 * - rooms/desks/foods: public /uploads/...
 * - id_cards/receipts: authenticated /api/secure-media/...?access_token=
 */

function apiOrigin() {
  const raw = (process.env.REACT_APP_API_URL || '').replace(/\/api\/?$/, '');
  if (raw) return raw;
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:5000';
  }
  return '';
}

function authToken() {
  try {
    return localStorage.getItem('token') || '';
  } catch {
    return '';
  }
}

/** Sensitive folders must go through secure-media */
export function resolveSecureUpload(src, folderHint) {
  if (!src) return null;
  let p = String(src).trim().replace(/\\/g, '/');
  if (!p || p === 'undefined' || p === 'null') return null;
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return p;

  let folder = folderHint || 'id_cards';
  let file = p.replace(/^.*\//, '');
  if (p.includes('receipt')) folder = 'receipts';
  if (p.includes('id_card') || p.includes('/id_cards/') || p.startsWith('id-')) folder = 'id_cards';
  if (p.includes('/receipts/')) folder = 'receipts';

  const token = authToken();
  const q = token ? `?access_token=${encodeURIComponent(token)}` : '';
  const origin = apiOrigin();
  const path = `/api/secure-media/${folder}/${file}${q}`;
  return origin ? `${origin}${path}` : path;
}

export function resolveMediaUrl(src, folder = 'rooms', fallback) {
  const defaults = {
    rooms: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
    desks: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    foods: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80',
  };
  const def = fallback || defaults[folder] || defaults.rooms;
  if (!src) return def;
  let p = String(src).trim().replace(/\\/g, '/');
  if (!p || p === 'undefined' || p === 'null') return def;
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return p;

  // Route sensitive paths through auth
  if (
    p.includes('id_card') ||
    p.includes('/id_cards/') ||
    p.includes('receipt') ||
    folder === 'id_cards' ||
    folder === 'receipts'
  ) {
    return resolveSecureUpload(p, folder === 'receipts' ? 'receipts' : 'id_cards') || def;
  }

  if (p.startsWith('/uploads/')) return p;
  if (p.startsWith('uploads/')) return '/' + p;
  const file = p.replace(/^.*\//, '');
  return `/uploads/${folder}/${file}`;
}

export default resolveMediaUrl;
