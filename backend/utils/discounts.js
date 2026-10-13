const db = require('../config/db');

async function ensureDiscountColumns() {
  try { await db.execute('ALTER TABLE discounts ADD COLUMN target_item_id INT NULL'); } catch (_) {}
  try { await db.execute('ALTER TABLE discounts ADD COLUMN target_item_name VARCHAR(150) NULL'); } catch (_) {}
}

/** Active discounts at server NOW() */
async function getActiveDiscounts() {
  await ensureDiscountColumns();
  try {
    const [rows] = await db.execute(
      `SELECT * FROM discounts
       WHERE TIMESTAMP(start_date, COALESCE(start_time, '00:00:00')) <= NOW()
         AND TIMESTAMP(end_date, COALESCE(end_time, '23:59:59')) >= NOW()
       ORDER BY id DESC`
    );
    return rows || [];
  } catch (e) {
    const [all] = await db.execute('SELECT * FROM discounts ORDER BY id DESC');
    const now = Date.now();
    const toMs = (dateVal, timeVal, endOfDay) => {
      let ds = dateVal instanceof Date ? dateVal.toISOString().slice(0, 10) : String(dateVal || '').slice(0, 10);
      let ts = timeVal instanceof Date ? timeVal.toISOString().slice(11, 19) : String(timeVal || (endOfDay ? '23:59:59' : '00:00:00'));
      if (ts.length === 5) ts += ':00';
      const ms = Date.parse(`${ds}T${ts.slice(0, 8)}`);
      return Number.isNaN(ms) ? (endOfDay ? Infinity : 0) : ms;
    };
    return (all || []).filter((d) => now >= toMs(d.start_date, d.start_time, false) && now <= toMs(d.end_date, d.end_time, true));
  }
}

/**
 * Best matching discount for an item
 * type: 'food' | 'room' | 'desk'
 */
function findDiscountForItem(discounts, type, itemId, category) {
  if (!discounts || !discounts.length) return null;
  const id = itemId != null ? Number(itemId) : null;
  const list = discounts.filter((d) => d.discount_type === type || d.discount_type === 'all');
  // Prefer exact item match
  let match = list.find((d) => d.target_item_id != null && Number(d.target_item_id) === id);
  if (!match && category) {
    match = list.find((d) => !d.target_item_id && d.target_category && String(d.target_category) === String(category));
  }
  if (!match) {
    match = list.find((d) => d.discount_type === 'all' || (!d.target_item_id && !d.target_category && d.discount_type === type));
  }
  return match || null;
}

function applyPct(price, pct) {
  const p = Number(price) || 0;
  const n = Number(pct) || 0;
  const discounted = Number((p * (1 - n / 100)).toFixed(2));
  return { originalPrice: p, discountPercent: n, discountedPrice: discounted, hasDiscount: n > 0 && discounted < p };
}

function decorateItem(item, type, discounts) {
  const id = item.id;
  const category = item.category || item.room_type || item.location || null;
  const basePrice = Number(
    item.price != null ? item.price : item.price_per_night != null ? item.price_per_night : 0
  );
  const d = findDiscountForItem(discounts, type, id, category);
  if (!d) {
    return {
      ...item,
      original_price: basePrice,
      price: basePrice,
      price_per_night: item.price_per_night != null ? basePrice : item.price_per_night,
      has_discount: false,
      discount_percent: 0,
      discounted_price: basePrice,
    };
  }
  const applied = applyPct(basePrice, d.discount_percentage);
  const out = {
    ...item,
    original_price: applied.originalPrice,
    has_discount: true,
    discount_percent: applied.discountPercent,
    discounted_price: applied.discountedPrice,
    discount_id: d.id,
    discount_label: `${applied.discountPercent}% off`,
  };
  if (type === 'room') {
    out.price_per_night = applied.discountedPrice;
    out.price = applied.discountedPrice;
  } else {
    out.price = applied.discountedPrice;
  }
  return out;
}

async function getDiscountedPrice(type, itemId, basePrice, category) {
  const discounts = await getActiveDiscounts();
  const d = findDiscountForItem(discounts, type, itemId, category);
  if (!d) return { price: Number(basePrice) || 0, discountPercent: 0, hasDiscount: false, discountId: null };
  const applied = applyPct(basePrice, d.discount_percentage);
  return {
    price: applied.discountedPrice,
    discountPercent: applied.discountPercent,
    hasDiscount: applied.hasDiscount,
    discountId: d.id,
    originalPrice: applied.originalPrice,
  };
}

module.exports = {
  getActiveDiscounts,
  findDiscountForItem,
  decorateItem,
  getDiscountedPrice,
  applyPct,
};
