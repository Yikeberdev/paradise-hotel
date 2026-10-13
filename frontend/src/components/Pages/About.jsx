import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

/**
 * Correct place: Paradise Hotel (Centera), Debre Markos, Ethiopia
 * Use Ethiopia + Debre Markos in every query so Google does not pick another "Paradise Hotel".
 * Coordinates approximate the 8PQJ+4F2 area in Debre Markos.
 */
const FALLBACK = {
  about_title: 'About Paradise Hotel',
  about_body:
    'Paradise Hotel (also known as Centera Hotel) is a full-service hotel in Debre Markos, Ethiopia. We offer comfortable rooms, workspace desks, restaurant dining, and reliable guest services for travelers and local customers.',
  about_location_name: 'Paradise Hotel',
  about_address: 'Paradise Hotel, Debre Markos, Amhara, Ethiopia',
  about_map_query: 'Paradise Hotel, Debre Markos, Ethiopia',
  about_extra: 'Plus code: 8PQJ+4F2 · Reception open 24/7',
  about_lat: '10.3515',
  about_lng: '37.7282',
};

export default function About() {
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

  // Prefer explicit Debre Markos, Ethiopia query so Maps does not open another city
  const placeName = (content.about_location_name || 'Paradise Hotel').trim();
  const address = (content.about_address || FALLBACK.about_address).trim();
  const mapQuery = (
    content.about_map_query ||
    `${placeName}, Debre Markos, Ethiopia`
  ).trim();

  // Force Ethiopia + Debre Markos in destination string
  const destinationText = address.toLowerCase().includes('debre markos')
    ? address
    : `${placeName}, Debre Markos, Amhara, Ethiopia`;

  const mapsDirUrl =
    'https://www.google.com/maps/dir/?api=1' +
    '&destination=' + encodeURIComponent(destinationText) +
    '&travelmode=driving';

  // Search URL — most reliable for named places in a specific city
  const mapsSearchUrl =
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(mapQuery.includes('Debre Markos') ? mapQuery : mapQuery + ', Debre Markos, Ethiopia');

  // Coordinates fallback (Debre Markos area) if manager stores lat/lng in map_query as "lat,lng"
  const coordMatch = String(content.about_map_query || '').match(
    /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/
  );
  const mapsCoordUrl = coordMatch
    ? `https://www.google.com/maps/search/?api=1&query=${coordMatch[1]},${coordMatch[2]}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Paradise Hotel Debre Markos Ethiopia')}`;

  if (loading) {
    return <p style={{ textAlign: 'center', padding: 40 }}>Loading…</p>;
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px' }}>
      <h1 style={{ color: '#1a1a2e', marginBottom: 8 }}>
        About <span style={{ color: '#f0a500' }}>Paradise Hotel</span>
      </h1>
      <p style={{ color: '#555', lineHeight: 1.6, fontSize: 16, whiteSpace: 'pre-wrap' }}>
        {content.about_body}
      </p>

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Location</h2>
        <p style={{ margin: '0 0 8px' }}>
          <strong>{placeName}</strong>
        </p>
        <p style={{ color: '#666', margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{destinationText}</p>
        {content.about_extra ? (
          <p style={{ margin: '0 0 16px', whiteSpace: 'pre-wrap', color: '#666' }}>{content.about_extra}</p>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <a href={mapsDirUrl}  target="_blank" rel="noopener noreferrer" style={btnOutline,{background:'rgb(95, 62, 62)',color:'white', borderRadius:'3px'}}>
            Use google map
          </a>
        </div>
       
      </div>

      <p style={{ marginTop: 20 }}>
        <Link to="/contact" style={{ color: '#f0a500', fontWeight: 700 }}>
          Contact us →
        </Link>
      </p>
    </div>
  );
}

const card = {
  background: '#fff',
  border: '1px solid #eee',
  borderRadius: 12,
  padding: 20,
  marginTop: 20,
};
const btnPrimary = {
  display: 'inline-block',
  background: '#f0a500',
  color: '#1a1a2e',
  fontWeight: 800,
  padding: '12px 18px',
  borderRadius: 8,
  textDecoration: 'none',
};
const btnOutline = {
  display: 'inline-block',
  border: '1px solid #ccc',
  color: '#333',
  fontWeight: 600,
  padding: '12px 18px',
  borderRadius: 8,
  textDecoration: 'none',
};
