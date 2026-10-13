import React, { useState, useRef, useEffect } from 'react';

/**
 * Modern image carousel with prev/next, indicators, swipe, and optional full preview.
 * images: string | string[]  (URLs or relative paths)
 * alt, title, price, subtitle, onViewDetails, onAction, actionLabel
 */
export default function ImageCarousel({
  images = [],
  alt = 'Item',
  title,
  subtitle,
  price,
  badge,
  onViewDetails,
  onAction,
  actionLabel = 'Reserve',
  height = 220,
  showControls = true,
}) {
  const list = Array.isArray(images)
    ? images.filter(Boolean)
    : images
      ? [images]
      : ['https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80'];

  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState(null);
  const touchStartX = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    setIndex(0);
  }, [list.join('|')]);

  const go = (dir) => {
    setIndex((i) => {
      const next = i + dir;
      if (next < 0) return list.length - 1;
      if (next >= list.length) return 0;
      return next;
    });
  };

  const resolveSrc = (src) => {
    if (!src) return list[0];
    if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('/uploads')) return src;
    return `/uploads/${src.replace(/^\//, '')}`;
  };

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  return (
    <>
      <div
        className="image-carousel-card"
        style={{
          background: '#fff',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 4px 18px rgba(0,0,0,0.08)',
          border: '1px solid #eee',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            height,
            background: '#1a1a2e',
            overflow: 'hidden',
            userSelect: 'none',
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <img
            src={resolveSrc(list[index])}
            alt={alt}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'opacity 0.35s ease',
              cursor: 'pointer',
            }}
            onClick={() => setPreview(resolveSrc(list[index]))}
            onError={(e) => {
              e.target.src =
                'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';
            }}
          />

          {badge && (
            <span
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                background: 'rgba(240,165,0,0.95)',
                color: '#1a1a2e',
                padding: '4px 10px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {badge}
            </span>
          )}

          {showControls && list.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous"
                onClick={() => go(-1)}
                style={navBtnStyle('left')}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={() => go(1)}
                style={navBtnStyle('right')}
              >
                ›
              </button>
              <div
                style={{
                  position: 'absolute',
                  bottom: 10,
                  left: 0,
                  right: 0,
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {list.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Image ${i + 1}`}
                    style={{
                      width: i === index ? 18 : 8,
                      height: 8,
                      borderRadius: 4,
                      border: 'none',
                      background: i === index ? '#f0a500' : 'rgba(255,255,255,0.55)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      padding: 0,
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  background: 'rgba(0,0,0,0.45)',
                  color: '#fff',
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 12,
                }}
              >
                {index + 1} / {list.length}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {title && (
            <h3 style={{ margin: '0 0 4px', fontSize: 17, color: '#1a1a2e' }}>{title}</h3>
          )}
          {subtitle && (
            <p style={{ margin: '0 0 6px', color: '#666', fontSize: 13 }}>{subtitle}</p>
          )}
          {price != null && (
            <p style={{ margin: '0 0 12px', color: '#f0a500', fontWeight: 700, fontSize: 16 }}>
              {typeof price === 'number' ? `ETB ${price.toFixed(2)}` : price}
            </p>
          )}
          <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {onViewDetails && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={onViewDetails}
                style={{ flex: 1, minWidth: 100 }}
              >
                View Details
              </button>
            )}
            {onAction && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={onAction}
                style={{
                  flex: 1,
                  minWidth: 100,
                  background: '#f0a500',
                  color: '#1a1a2e',
                  border: 'none',
                  fontWeight: 700,
                }}
              >
                {actionLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      {preview && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setPreview(null)}
        >
          <img
            src={preview}
            alt="Full preview"
            style={{ maxWidth: '95%', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setPreview(null)}
            style={{
              position: 'absolute',
              top: 20,
              right: 24,
              background: '#f0a500',
              border: 'none',
              borderRadius: '50%',
              width: 40,
              height: 40,
              fontSize: 20,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

function navBtnStyle(side) {
  return {
    position: 'absolute',
    top: '50%',
    [side]: 8,
    transform: 'translateY(-50%)',
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(0,0,0,0.45)',
    color: '#fff',
    fontSize: 22,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  };
}
