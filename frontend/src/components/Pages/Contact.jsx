import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

   

const FALLBACK = {
  contact_phone: '+251 58 771 0000',
  contact_email: 'info@paradisehotel.et',
  contact_address: 'Paradise Hotel, Debre Markos, Amhara, Ethiopia',
  contact_hours: 'Reception: 24/7',
  contact_extra: 'Debre Markos, Amhara Region, Ethiopia · Also known as Centera Hotel',
};

export default function Contact() {
  const [content, setContent] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/site/content')
      .then((res) => {
        if (res.data?.content) setContent({ ...FALLBACK, ...res.data.content });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p style={{ textAlign: 'center', padding: 40 }}>Loading…</p>;
  }
  

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 16px' }}>
      <h1 style={{ color: '#1a1a2e' }}>
        Contact <span style={{ color: '#f0a500' }}>Paradise Hotel</span>
      </h1>
      <div style={card}>
        {content.contact_phone ? (
          <p>
            <strong>Phone:</strong> {content.contact_phone}
          </p>
        ) : null}
        {content.contact_email ? (
          <p>
            <strong>Email:</strong> {content.contact_email}
          </p>
        ) : null}
        {content.contact_address ? (
          <p>
            <strong>Address:</strong> {content.contact_address}
          </p>
        ) : null}
        {content.contact_hours ? (
          <p>
            <strong>Hours:</strong> {content.contact_hours}
          </p>
        ) : null}
        {content.contact_extra ? (
          <p style={{ whiteSpace: 'pre-wrap' }}>{content.contact_extra}</p>
        ) : null}
        <p style={{ marginTop: 16 }}>
          <Link to="/about" style={{ color: '#f0a500', fontWeight: 700 }}>
            About us &amp; Use Map →
          </Link>
        </p>
      </div>
    </div>
  );


};
const card = {
  background: '#fff',
  border: '1px solid #eee',
  borderRadius: 12,
  padding: 24,
  marginTop: 16,
  lineHeight: 1.7,
};
