'use strict';
/* ============================================================
   فایل‌های ملکی — منطق خالص (بدون DOM/دیتابیس؛ قابل تست در Node)
   ============================================================ */
const ListingsCore = (() => {
  const U = (typeof Utils !== 'undefined') ? Utils : require('./utils.js');
  const CC = (typeof ClientsCore !== 'undefined') ? ClientsCore : require('./clients-core.js');

  /* «رهن» و «اجاره» یکی شده‌اند: نوع واحد rent با برچسب «رهن و اجاره». کلید mortgage فقط برای داده‌ی قدیمی می‌ماند (در رابط دیده نمی‌شود) */
  const TYPES = { sale: { label: 'فروش', icon: '🏷️' }, rent: { label: 'رهن و اجاره', icon: '🏠' }, mortgage: { label: 'رهن و اجاره', icon: '🏠' } };
  const TYPE_KEYS = ['sale', 'rent'];
  const normType = (t) => (t === 'mortgage' ? 'rent' : t);
  const STATUSES = { active: 'فعال', reserved: 'رزرو', closed: 'بسته‌شده' };
  const INTENT_TO_TYPE = { buy: 'sale', mortgage: 'rent', rent: 'rent' };
  const bad = (m) => Object.assign(new Error(m), { userFacing: true });

  const floorText = (f) => (f === null || f === undefined) ? '' : (f === 0 ? 'همکف' : f < 0 ? 'زیرزمین' : 'طبقه ' + U.faDigits(f));

  /* ورودی فرم → ردیف تمیز؛ خطا با throw (userFacing) */
  function validateListing(f) {
    f = Object.assign({}, f, { type: normType(f.type) });
    if (!TYPES[f.type]) throw bad('نوع فایل را انتخاب کن.');
    const area = String(f.area || '').trim();
    if (!area) throw bad('محله را وارد کن.');
    const num = (v, lo, hi, label) => {
      if (v === '' || v == null) return null;
      const n = Math.round(Number(v));
      if (!isFinite(n) || n < lo || n > hi) throw bad(label + ' معتبر نیست.');
      return n;
    };
    const money = (v, label) => { if (v === '' || v == null) return null; const n = Math.round(Number(v)); if (!isFinite(n) || n < 0) throw bad(label + ' معتبر نیست.'); return n; };
    const row = {
      type: f.type, area, size: num(f.size, 1, 20000, 'متراژ'), floor: num(f.floor, -3, 100, 'طبقه'), age: num(f.age, 0, 200, 'سن بنا'),
      price: f.type === 'sale' ? money(f.price, 'قیمت') : null,
      deposit: f.type === 'sale' ? null : money(f.deposit, 'ودیعه'),
      rentMonthly: f.type === 'sale' ? null : money(f.rentMonthly, 'اجاره'),
      features: String(f.features || '').trim() || null,
      ownerName: String(f.ownerName || '').trim() || null,
      ownerPhone: CC.normalizePhone(f.ownerPhone) || null,
      address: String(f.address || '').trim() || null
    };
    row.collabOpen = f.collabOpen === true;
    row.collabSharePct = null;
    if (row.collabOpen) {
      row.collabSharePct = num(f.collabSharePct, 1, 99, 'درصد سهم');
      if (row.collabSharePct === null) throw bad('درصد سهم همکار را وارد کن.');
    }
    if (row.type === 'sale' && row.price === null) throw bad('قیمت فروش را وارد کن.');
    if (row.type !== 'sale' && row.deposit === null && row.rentMonthly === null) throw bad('رهن یا اجاره را وارد کن.');
    if (row.ownerPhone && !CC.isMobile(row.ownerPhone) && row.ownerPhone.length < 7) throw bad('شماره‌ی مالک معتبر نیست.');
    return row;
  }

  const areaKey = (s) => U.norm(String(s || '')).replace(/\s+/g, '');
  const within = (a, b, pct) => a != null && b != null && Math.abs(a - b) <= Math.max(a, b) * pct;

  /* فایل تکراری: همان نوع و محله، متراژ نزدیک، و قیمت نزدیک */
  function isSimilar(a, b) {
    if (!a || !b || a.type !== b.type) return false;
    const ka = areaKey(a.area), kb = areaKey(b.area);
    if (!ka || !kb || !(ka.includes(kb) || kb.includes(ka))) return false;
    if (a.size == null || b.size == null || Math.abs(a.size - b.size) > 3) return false;
    if (a.floor != null && b.floor != null && a.floor !== b.floor) return false;
    if (a.type === 'sale') return a.price == null || b.price == null || within(a.price, b.price, 0.05);
    const dep = a.deposit == null || b.deposit == null || within(a.deposit, b.deposit, 0.05);
    const rent = a.rentMonthly == null || b.rentMonthly == null || within(a.rentMonthly, b.rentMonthly, 0.05);
    return dep && rent;
  }
  const findSimilar = (list, row, ignoreId) => (list || []).find((l) => l.id !== ignoreId && isSimilar(l, row)) || null;

  /* تطبیق فایل و مشتری. خروجی: { ok, score, reasons[], warns[] } */
  function matchScore(l, c) {
    const no = { ok: false, score: 0, reasons: [], warns: [] };
    if (!l || !c || l.status !== 'active') return no;
    if (c.stage === 'won' || c.stage === 'lost') return no;
    if (INTENT_TO_TYPE[c.intent] !== l.type) return no;
    let score = 0; const reasons = [], warns = [];

    const money = (have, want, okText, warnText) => {
      if (!want || have == null) return true;
      if (have <= want) { score += 2; reasons.push(okText); return true; }
      if (have <= want * 1.1) { score += 1; warns.push(warnText); return true; }
      return false;
    };
    if (l.type === 'sale') {
      if (!money(l.price, c.budgetMax, 'در بودجه', 'کمی بالاتر از بودجه')) return no;
    } else {
      if (!money(l.deposit, c.budgetMax, 'رهن در بودجه', 'رهن کمی بالاتر')) return no;
      if (!money(l.rentMonthly, c.rentMax, 'اجاره در بودجه', 'اجاره کمی بالاتر')) return no;
    }
    const wants = String(c.areas || '').split(/[،,;؛\n]+|\sو\s/).map(areaKey).filter((x) => x.length >= 2);
    if (wants.length) {
      const la = areaKey(l.area);
      if (!wants.some((w) => la.includes(w) || w.includes(la))) return no;
      score += 2; reasons.push('محله‌ی دلخواه');
    }
    if (c.minSize && l.size != null) {
      if (l.size < c.minSize) return no;
      score += 1; reasons.push('متراژ کافی');
    }
    return { ok: true, score, reasons, warns };
  }

  function matchClientsForListing(l, clients) {
    return (clients || []).map((c) => ({ client: c, m: matchScore(l, c) })).filter((x) => x.m.ok).sort((a, b) => b.m.score - a.m.score);
  }
  function matchListingsForClient(c, listings) {
    return (listings || []).map((l) => ({ listing: l, m: matchScore(l, c) })).filter((x) => x.m.ok).sort((a, b) => b.m.score - a.m.score);
  }

  function priceText(l) {
    if (l.type === 'sale') return l.price != null ? 'قیمت: ' + CC.fmtShort(l.price) + ' تومان' : '';
    const p = [];
    if (l.deposit != null) p.push('رهن: ' + CC.fmtShort(l.deposit) + ' تومان');
    if (l.rentMonthly != null) p.push('اجاره: ' + CC.fmtShort(l.rentMonthly) + ' تومان');
    return p.join(' | ');
  }
  function specText(l) {
    return [l.size != null ? U.faDigits(l.size) + ' متر' : '', floorText(l.floor), l.age != null ? U.faDigits(l.age) + ' ساله' : ''].filter(Boolean).join(' | ');
  }

  /* پیام آماده برای هر سطح. سطح ۳ فقط آدرس دارد؛ شماره/نام مالک هرگز در پیام نمی‌آید. */
  function buildMessage(level, l) {
    const head = TYPES[l.type].icon + ' ' + TYPES[l.type].label + ' ملک در ' + l.area;
    const lines = [head, specText(l), priceText(l)].filter(Boolean);
    if (level >= 2 && l.features) lines.push('ویژگی‌ها: ' + l.features);
    if (level >= 3) lines.push(l.address ? '📍 آدرس: ' + l.address : '📍 آدرس دقیق را هنگام هماهنگی بازدید می‌دهم.');
    if (level < 3) lines.push('برای اطلاعات بیشتر و هماهنگی بازدید پیام بدهید.');
    return lines.join('\n');
  }

  function sortListings(list) {
    const rank = { active: 0, reserved: 1, closed: 2 };
    return (list || []).slice().sort((a, b) => (rank[a.status] - rank[b.status]) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
  function matchesQuery(l, q) {
    /* کد رهگیری آگهی (مثل Y-124) مستقیم همان فایل را پیدا می‌کند */
    const code = /^\s*y[-\s]?(\d{1,12})\s*$/i.exec(U.toLatinDigits(String(q || '')));
    if (code) return String(l.id) === code[1];
    const n = U.norm(q || ''); if (!n) return true;
    return U.norm([l.area, l.features, l.ownerName, l.address].join(' ')).includes(n);
  }

  const collabShareText = (pct) => pct ? 'سهم همکار: ' + U.faDigits(pct) + '٪' : '';
  /* لیست مشترک: فیلتر نوع (all = همه) و جستجو */
  function filterCollab(list, type, q) {
    return (list || []).filter((l) => (!type || type === 'all' || l.type === type) && matchesQuery(l, q));
  }

  const COLLAB_STATUS = { requested: 'منتظر پاسخ', accepted: 'تأیید شده', rejected: 'رد شده', done: 'انجام شد', cancelled: 'لغو شد' };
  const normDigits = (s) => String(s || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  /* مشخصات مشتری برای درخواست همکاری: بدون شماره تماس */
  function validateCollabRequest(text) {
    const s = String(text || '').trim();
    if (s.length < 3) throw bad('مشخصات مشتری را بنویس (بودجه، محله، زمان خرید).');
    if (s.length > 500) throw bad('مشخصات مشتری حداکثر ۵۰۰ حرف باشد.');
    const n = normDigits(s).replace(/(\d)[\s.\-،,]+(?=\d)/g, '$1');
    if (/(^|\D)(0|\+?98)9\d{9}(\D|$)/.test(n) || /(^|\D)0\d{10}(\D|$)/.test(n)) throw bad('شماره یا اطلاعات تماس مشتری را ننویس.');
    return s;
  }
  function validateCollabContact(text) {
    const s = String(text || '').trim();
    if (s.length > 200) throw bad('راه تماس حداکثر ۲۰۰ حرف باشد.');
    return s || null;
  }
  /* تعداد درخواست‌های بی‌پاسخ برای صاحب فایل */
  const collabPendingCount = (mine) => (mine || []).filter((c) => c.role === 'owner' && c.status === 'requested').length;
  /* آیا برای این فایل درخواست فعالی (منتظر یا تأییدشده) دارم؟ */
  const hasActiveCollab = (mine, listingId) => (mine || []).some((c) => c.role === 'advisor' && String(c.listingId) === String(listingId) && (c.status === 'requested' || c.status === 'accepted'));

  /* سهم‌ها: درصد = سهم مشاور مشتری‌دار؛ بقیه برای صاحب فایل */
  function splitCommission(total, pct) {
    if (total == null || pct == null || !isFinite(total) || !isFinite(pct)) return null;
    const advisor = Math.round(total * pct / 100);
    return { advisor, owner: total - advisor };
  }
  /* ورودی میلیون تومان → تومان؛ خالی = null */
  function validateCommission(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const n = CC.parseDecimal(raw);
    if (isNaN(n) || n < 0 || n > 1e6) throw bad('مبلغ کمیسیون معتبر نیست.');
    return Math.round(n * 1e6);
  }
  function ratingText(avg, count) {
    if (!count) return 'بدون امتیاز';
    return '⭐ ' + Number(avg).toFixed(1).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]).replace('.', '٫') + ' (' + U.faDigits(count) + ' نظر)';
  }

  return { splitCommission, validateCommission, ratingText, COLLAB_STATUS, validateCollabRequest, validateCollabContact, collabPendingCount, hasActiveCollab, collabShareText, filterCollab, TYPES, TYPE_KEYS, normType, STATUSES, INTENT_TO_TYPE, floorText, validateListing, isSimilar, findSimilar, matchScore, matchClientsForListing, matchListingsForClient, priceText, specText, buildMessage, sortListings, matchesQuery };
})();

if (typeof globalThis !== 'undefined') globalThis.ListingsCore = ListingsCore;
if (typeof module !== 'undefined' && module.exports) module.exports = ListingsCore;
