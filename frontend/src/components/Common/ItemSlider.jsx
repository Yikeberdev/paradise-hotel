import React, { useState, useRef, useEffect } from 'react';

/**
 * Android-style full-width horizontal slider.
 * Swipe or use arrows to move between items one at a time.
 */
export default function ItemSlider({
  items = [],
  renderItem,
  getKey = (item, i) => item.id ?? i,
  emptyMessage = 'No items to display',
  height = 420,
}) {
  // ALL hooks must be called every render (before any conditional return)
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(null);
  const touchDelta = useRef(0);
  const trackRef = useRef(null);
  const mouseDown = useRef(false);
  const mouseStartX = useRef(0);

  useEffect(() => {
    setIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (items.length > 0 && index >= items.length) {
      setIndex(items.length - 1);
    }
  }, [items.length, index]);

  const go = (dir) => {
    if (!items.length) return;
    setIndex((i) => {
      const next = i + dir;
      if (next < 0) return items.length - 1;
      if (next >= items.length) return 0;
      return next;
    });
  };

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchDelta.current = 0;
  };

  const onTouchMove = (e) => {
    if (touchStartX.current == null) return;
    touchDelta.current = e.touches[0].clientX - touchStartX.current;
  };

  const onTouchEnd = () => {
    if (Math.abs(touchDelta.current) > 50) {
      go(touchDelta.current < 0 ? 1 : -1);
    }
    touchStartX.current = null;
    touchDelta.current = 0;
  };

  const onMouseDown = (e) => {
    mouseDown.current = true;
    mouseStartX.current = e.clientX;
  };

  const onMouseUp = (e) => {
    if (!mouseDown.current) return;
    mouseDown.current = false;
    const dx = e.clientX - mouseStartX.current;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  const onMouseLeave = () => {
    mouseDown.current = false;
  };

  if (!items.length) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: '#888', background: '#f9f9f9', borderRadius: 16 }}>
        {emptyMessage}
      </div>
    );
  }

  const safeIndex = Math.min(index, items.length - 1);

  return (
    <div className="item-slider-root" style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
      <div
        style={{
          textAlign: 'center',
          marginBottom: 12,
          fontSize: 14,
          color: '#555',
          fontWeight: 600,
        }}
      >
        <span style={{ background: '#1a1a2e', color: '#f0a500', padding: '4px 14px', borderRadius: 20 }}>
          {safeIndex + 1} / {items.length}
        </span>
      </div>

      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 16,
          minHeight: height,
          background: '#0d0d14',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <div
          ref={trackRef}
          style={{
            display: 'flex',
            width: `${items.length * 100}%`,
            transform: `translateX(-${(safeIndex * 100) / items.length}%)`,
            transition: 'transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1)',
          }}
        >
          {items.map((item, i) => (
            <div
              key={getKey(item, i)}
              style={{
                width: `${100 / items.length}%`,
                flexShrink: 0,
                boxSizing: 'border-box',
                padding: '0 4px',
              }}
            >
              {renderItem(item, i, safeIndex === i)}
            </div>
          ))}
        </div>

        {items.length > 1 && (
          <>
            <button type="button" aria-label="Previous" onClick={() => go(-1)} style={arrowStyle('left')}>
              ‹
            </button>
            <button type="button" aria-label="Next" onClick={() => go(1)} style={arrowStyle('right')}>
              ›
            </button>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            marginTop: 14,
            flexWrap: 'wrap',
            maxWidth: '100%',
          }}
        >
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to item ${i + 1}`}
              onClick={() => setIndex(i)}
              style={{
                width: i === safeIndex ? 22 : 10,
                height: 10,
                borderRadius: 5,
                border: 'none',
                background: i === safeIndex ? '#f0a500' : '#ccc',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.25s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function arrowStyle(side) {
  return {
    position: 'absolute',
    top: '50%',
    [side]: 8,
    transform: 'translateY(-50%)',
    width: 48,
    height: 48,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(240, 165, 0, 0.92)',
    color: '#1a1a2e',
    fontSize: 32,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
    zIndex: 5,
  };
}
