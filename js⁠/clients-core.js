'use strict';
/* ============================================================
   پرونده‌ی مشتری — منطق خالص (بدون DOM و بدون دیتابیس؛ قابل تست در Node)
   ============================================================ */
const ClientsCore = (() => {
  const U = (typeof Utils !== 'undefined') ? Utils : require('./utils.js');

  const STAGES = [
    { key: 'first_call', label: 'تماس اول', icon: '📞' },
    { key: 'visit', label: 'بازدید', icon: '🏠' },
    { key: 'negotiation', label: 'مذاکره', icon: '🤝' },
    { key: 'won', label: 'معامله', icon: '✅' },
    { key: 'lost', label: 'از دست رفته', icon: '✖️' }
  ];
  /* «رهن» و «اجاره» یکی شده‌اند: نیاز واحد rent با برچسب «رهن و اجاره»؛ mortgage فقط برای داده‌ی قدیمی */
  const INTENTS = { buy: 'خرید', rent: 'رهن و اجاره', mortgage: 'رهن و اجاره' };
  const INTENT_KEYS = ['buy', 'rent'];
  const normIntent = (i) => (i === 'mortgage' ? 'rent' : i);
  const LOST_REASONS = { price: 'قیمت', location: 'موقعیت', other_advisor: 'رفت پیش مشاور دیگر', changed_mind: 'منصرف شد', other: 'سایر' };
  const NOTE_KINDS = { note: '📝 یادداشت', call: '📞 تماس', visit: '🏠 بازدید', reject: '🚫 رد کرد' };

  const stageLabel = (k) => (STAGES.find((s) => s.key === k) || {}).label || k;
  const stageIcon = (k) => (STAGES.find((s) => s.key === k) || {}).icon || '';

  /* شماره → ۰۹۱۲… ؛ اگر معتبر نبود همان ارقام را برمی‌گرداند (برای شماره‌های ثابت) */
  function normalizePhone(raw) {
    let d = U.toLatinDigits(raw == null ? '' : String(raw)).replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('0098')) d = d.slice(4);
    else if (d.startsWith('98') && d.length >= 12) d = d.slice(2);
    if (d.length === 10 && d.startsWith('9')) d = '0' + d;
    return d;
  }
  const isMobile = (p) => /^09\d{9}$/.test(p || '');

  /* ۵٬۰۰۰٬۰۰۰٬۰۰۰ → «۵ میلیارد» ؛ ۲٬۵۰۰٬۰۰۰٬۰۰۰ → «۲٫۵ میلیارد» */
  function fmtShort(n) {
    if (n === null || n === undefined || isNaN(n)) return '';
    const trim = (x) => String(Math.round(x * 100) / 100).replace(/\.0+$/, '');
    const fa = (s) => String(s).replace(/\d/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[c]).replace('.', '٫');
    if (n >= 1e9) return fa(trim(n / 1e9)) + ' میلیارد';
    if (n >= 1e6) return fa(trim(n / 1e6)) + ' میلیون';
    return U.faNum(n);
  }

  /* عددِ تایپ‌شده در فرم‌های مبلغ/متراژ. ممیز فارسی (٫) و اسلش را اعشار می‌گیرد؛ وگرنه «۴٫۸» می‌شد ۴۸ */
  function parseDecimal(v) {
    if (v === null || v === undefined) return NaN;
    const s = U.toLatinDigits(String(v)).replace(/[\u066C\s]/g, '').replace(/[\u066B\/]/g, '.');
    return U.parseNumber(s);
  }

  const pad = (x) => String(x).padStart(2, '0');
  const isoDate = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  function addDaysISO(days, from) {
    const d = from ? new Date(from) : new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return isoDate(d);
  }

  /* 'overdue' | 'today' | 'later' | null — کلاینت‌های بسته‌شده (won/lost) پیگیری ندارند */
  function followupState(c, todayISO) {
    if (!c || !c.nextFollowupDate || c.stage === 'won' || c.stage === 'lost') return null;
    const t = todayISO || isoDate(new Date());
    const f = String(c.nextFollowupDate).slice(0, 10);
    if (f < t) return 'overdue';
    if (f === t) return 'today';
    return 'later';
  }

  function dayDiff(aISO, bISO) {
    const a = new Date(aISO + 'T12:00:00'), b = new Date(bISO + 'T12:00:00');
    return Math.round((a - b) / 86400000);
  }

  function followupText(c, todayISO) {
    const st = followupState(c, todayISO);
    if (!st) return '';
    const t = todayISO || isoDate(new Date());
    const diff = dayDiff(String(c.nextFollowupDate).slice(0, 10), t);
    if (st === 'today') return 'پیگیری: امروز';
    if (st === 'overdue') return 'پیگیری: ' + U.faDigits(-diff) + ' روز عقب‌افتاده';
    return 'پیگیری: ' + (diff === 1 ? 'فردا' : U.faDigits(diff) + ' روز دیگر');
  }

  /* مرتب‌سازی: عقب‌افتاده‌ها، امروز، بعد نزدیک‌ترین پیگیری، بعد بدون پیگیری (جدیدترین اول)، آخر بسته‌شده‌ها */
  function sortClients(list, todayISO) {
    const rank = (c) => {
      if (c.stage === 'won' || c.stage === 'lost') return 4;
      const s = followupState(c, todayISO);
      return s === 'overdue' ? 0 : s === 'today' ? 1 : s === 'later' ? 2 : 3;
    };
    return list.slice().sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra <= 2) return String(a.nextFollowupDate).localeCompare(String(b.nextFollowupDate));
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }

  function matchesQuery(c, q) {
    const n = U.norm ? U.norm(q) : String(q || '').trim();
    if (!n) return true;
    const hay = U.norm([c.name, c.phone, c.areas, c.mustHaves].join(' '));
    const digits = normalizePhone(q);
    return hay.includes(n) || (digits.length >= 3 && String(c.phone || '').includes(digits));
  }

  /* «خلاصه‌ی ۵ خطی» — حداکثر ۵ خط، فقط از داده‌ی خودِ مشاور ساخته می‌شود (بدون هوش مصنوعی) */
  function buildSummary(c, notes, todayISO) {
    const lines = [];
    const l1 = [INTENTS[c.intent] || ''];
    if (c.budgetMax) l1.push((c.intent === 'buy' ? 'بودجه تا ' : 'رهن تا ') + fmtShort(c.budgetMax) + ' تومان');
    if (c.rentMax && c.intent !== 'buy') l1.push('اجاره تا ' + fmtShort(c.rentMax));
    if (l1.filter(Boolean).length) lines.push(l1.filter(Boolean).join('، '));

    const l2 = [];
    if (c.areas) l2.push('محله: ' + c.areas);
    if (c.minSize) l2.push('حداقل ' + U.faDigits(c.minSize) + ' متر');
    if (c.mustHaves) l2.push('مهم: ' + c.mustHaves);
    if (l2.length) lines.push(l2.join('، '));

    const sorted = (notes || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const rejects = sorted.filter((n) => n.kind === 'reject').slice(0, 2).map((n) => clip(n.text, 40));
    if (rejects.length) lines.push('رد کرد: ' + rejects.join('؛ '));

    const last = sorted.find((n) => n.kind !== 'reject');
    if (last) lines.push('آخرین: ' + clip(last.text, 70) + ' (' + U.faDateShort(last.createdAt) + ')');

    const ft = followupText(c, todayISO);
    if (ft) lines.push(ft);
    return lines.slice(0, 5);
  }

  function clip(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  const bad = (m) => Object.assign(new Error(m), { userFacing: true });

  /* ورودی فرم → ردیف تمیز؛ خطا را با throw (userFacing) برمی‌گرداند */
  function validateClient(f) {
    const name = String(f.name || '').trim();
    if (!name) throw bad('نام مشتری را وارد کن.');
    const phone = normalizePhone(f.phone);
    if (phone && !isMobile(phone) && phone.length < 7) throw bad('شماره‌ی تماس معتبر نیست.');
    f = Object.assign({}, f, { intent: normIntent(f.intent) });
    if (!INTENTS[f.intent]) throw bad('نوع نیاز معتبر نیست.');
    const money = (v) => { if (v === '' || v == null) return null; const n = Number(v); if (!isFinite(n) || n < 0) throw bad('مبلغ معتبر نیست.'); return Math.round(n); };
    const size = f.minSize === '' || f.minSize == null ? null : Math.round(Number(f.minSize));
    if (size !== null && (!isFinite(size) || size < 1 || size > 5000)) throw bad('متراژ معتبر نیست.');
    return {
      name, phone: phone || null, intent: f.intent,
      budgetMax: money(f.budgetMax), rentMax: f.intent === 'buy' ? null : money(f.rentMax),
      areas: String(f.areas || '').trim() || null, minSize: size,
      mustHaves: String(f.mustHaves || '').trim() || null
    };
  }

  return {
    STAGES, INTENTS, INTENT_KEYS, normIntent, LOST_REASONS, NOTE_KINDS, stageLabel, stageIcon,
    normalizePhone, isMobile, parseDecimal, fmtShort, isoDate, addDaysISO,
    followupState, followupText, sortClients, matchesQuery, buildSummary, validateClient
  };
})();

if (typeof globalThis !== 'undefined') globalThis.ClientsCore = ClientsCore;
if (typeof module !== 'undefined' && module.exports) module.exports = ClientsCore;
