'use strict';
/* ============================================================
   ابزارهای عمومی: نرمال‌سازی متن فارسی، اعداد، تاریخ، قالب‌بندی
   ============================================================ */

const Utils = (() => {
  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  function toLatinDigits(s) {
    if (s === null || s === undefined) return '';
    s = String(s);
    for (let i = 0; i < 10; i++) {
      s = s.split(FA_DIGITS[i]).join(String(i));
      s = s.split(AR_DIGITS[i]).join(String(i));
    }
    return s;
  }

  /* نرمال‌سازی متن برای جستجوی فارسی: یکسان‌سازی حروف و ارقام */
  function norm(s) {
    if (s === null || s === undefined) return '';
    s = String(s).toLowerCase();
    s = s.replace(/[يىئ]/g, 'ی').replace(/ك/g, 'ک');
    s = s.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ۀ/g, 'ه').replace(/ؤ/g, 'و');
    s = toLatinDigits(s);
    s = s.replace(/[\u064B-\u0652\u0640]/g, ''); // اعراب و کشیده
    s = s.replace(/[.,،;؛:!?()\[\]{}'"«»"'`~@#$%^&*_+=|\\/<>]/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  /* تبدیل رشته عدد (با جداکننده یا حروف فارسی) به عدد */
  function parseNumber(v) {
    if (v === null || v === undefined) return NaN;
    let s = toLatinDigits(String(v).trim());
    s = s.replace(/[^\d.,\-]/g, ''); // فقط رقم، نقطه، کاما، منفی
    if (!s || s === '-' || s === '.' || s === ',') return NaN;
    if (s.includes('-') && !/^-\d/.test(s)) return NaN;
    const dotCount = (s.match(/\./g) || []).length;
    const commaCount = (s.match(/,/g) || []).length;
    let normalized;
    if (dotCount > 1 && commaCount === 0) {
      // نقطه جداکننده هزارگان است (مثل 1.234.567)
      normalized = s.replace(/\./g, '');
    } else if (commaCount > 1 && dotCount === 0) {
      normalized = s.replace(/,/g, '');
    } else if (commaCount === 1 && dotCount === 0) {
      // یک کاما: اگر بعدش 3 رقم بود جداکننده هزارگان، وگرنه اعشار
      const parts = s.split(',');
      normalized = parts[1] && parts[1].length === 3 ? parts.join('') : s.replace(',', '.');
    } else {
      normalized = s.replace(/,/g, '');
    }
    const n = parseFloat(normalized);
    return isNaN(n) ? NaN : n;
  }

  /* عدد صحیح به فارسی با جداکننده هزارگان */
  function faNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Math.round(n).toLocaleString('fa-IR');
  }

  /* عدد بدون جداکننده هزارگان، فقط با ارقام فارسی (برای سال/روز/ماه) */
  /* رقم‌های هر رشته (ساعت «14:00»، شماره‌ی «0912…») فارسی می‌شود؛ برخلاف faDigits که فقط عدد می‌گیرد و صفرِ اول را حذف می‌کند */
  function faText(s) { return String(s == null ? '' : s).replace(/\d/g, (d) => FA_DIGITS[+d]); }

  function faDigits(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return String(Math.round(n)).replace(/\d/g, (d) => FA_DIGITS[+d]);
  }

  /* ---------- تقویم شمسی (جلالی) ---------- */

  const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  const JALALI_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

  /* تبدیل میلادی به شمسی — الگوریتم استاندارد (مربوط به جلالی) */
  function gregorianToJalali(gy, gm, gd) {
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    const gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
    let jy = -1595 + (33 * Math.floor(days / 12053));
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    const jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return [jy, jm, jd];
  }

  /* {jy, jm, jd, wd} — wd شاخص روز هفته شمسی (شنبه=۰ … جمعه=۶) */
  function toJalali(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const wd = (d.getDay() + 1) % 7; // یکشنبه(۱ میلادی)=یکشنبه شمسی؛ شنبه=۰
    return { jy, jm, jd, wd };
  }

  function faWeekday(date) {
    const j = toJalali(date);
    return j ? JALALI_WEEKDAYS[j.wd] : '';
  }

  /* «شنبه ۱۰ مرداد ۱۴۰۵» */
  function faFullDate(date) {
    const j = toJalali(date);
    if (!j) return '';
    return faWeekday(date) + ' ' + faDigits(j.jd) + ' ' + JALALI_MONTHS[j.jm - 1] + ' ' + faDigits(j.jy);
  }

  /* «مرداد ۱۴۰۵» */
  function faMonthYear(date) {
    const j = toJalali(date);
    return j ? JALALI_MONTHS[j.jm - 1] + ' ' + faDigits(j.jy) : '';
  }

  /* تبدیل شمسی به میلادی — معکوس gregorianToJalali، برای ذخیره‌سازی
     تاریخی که کاربر با تقویم شمسی انتخاب کرده (الگوریتم استاندارد جلالی) */
  function jalaliToGregorian(jy, jm, jd) {
    jy += 1595;
    let days = -355668 + (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    let gy = 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) {
      gy += 100 * Math.floor(--days / 36524);
      days %= 36524;
      if (days >= 365) days++;
    }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      gy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    let gd = days + 1;
    const isLeap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
    const sal_a = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm;
    for (gm = 1; gm <= 12; gm++) {
      if (gd <= sal_a[gm]) break;
      gd -= sal_a[gm];
    }
    return [gy, gm, gd];
  }

  function formatMoney(toman) {
    if (toman === null || toman === undefined || isNaN(toman)) return '—';
    return faNum(toman) + ' تومان';
  }

  /* تاریخ ISO تنها (YYYY-MM-DD) را به‌صورت محلی می‌خوانیم تا روز جابه‌جا نشود؛ تاریخ-زمان‌ها مثل قبل */
  function toDateObj(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date(iso);
  }

  /* «۲۰ آبان ۱۴۰۵» — همیشه شمسی، مستقل از تقویم مرورگر */
  function faDate(iso) {
    const j = toJalali(toDateObj(iso));
    return j ? faDigits(j.jd) + ' ' + JALALI_MONTHS[j.jm - 1] + ' ' + faDigits(j.jy) : '';
  }

  function faTime(iso) {
    try {
      return new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch (e) { return ''; }
  }

  /* «۱۴۰۵/۰۸/۲۰» — همیشه شمسی */
  function faDateShort(iso) {
    const j = toJalali(toDateObj(iso));
    if (!j) return '';
    const fa = (n) => String(n).padStart(2, '0').replace(/\d/g, (d) => FA_DIGITS[+d]);
    return fa(j.jy) + '/' + fa(j.jm) + '/' + fa(j.jd);
  }

  function fileSize(bytes) {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return bytes + ' بایت';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' کیلوبایت';
    return (bytes / (1024 * 1024)).toFixed(1) + ' مگابایت';
  }

  function esc(html) {
    return String(html == null ? '' : html)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- کادر مبلغ: ویرگول سه‌رقمی + واحد «میلیارد | تومان» ----------
     مقدار همیشه به «تومان» برمی‌گردد. واحد میلیارد اعشار دارد (۲٫۵)، واحد تومان فقط عدد صحیح. */
  const MONEY_MULT = { b: 1e9, t: 1 };

  /* رشته‌ی تایپ‌شده → فقط رقم لاتین و (در میلیارد) یک ممیز اعشار، با ویرگول سه‌رقمی روی بخش صحیح */
  function moneyFormat(raw, unit) {
    let s = toLatinDigits(String(raw == null ? '' : raw)).replace(/[\u066C,\s]/g, '').replace(/[\u066B\/]/g, '.');
    s = s.replace(/[^\d.]/g, '');
    let int = s, dec = null;
    if (unit === 'b') {
      const i = s.indexOf('.');
      if (i >= 0) { int = s.slice(0, i); dec = s.slice(i + 1).replace(/\./g, '').slice(0, 6); }
    } else { int = s.replace(/\./g, ''); }
    int = int.replace(/^0+(?=\d)/, '');
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (dec !== null) return (int || '0') + '.' + dec;
    return int;
  }

  /* مقدار تومان → { unit, text } برای پر کردن اولیه‌ی کادر. بالای یک میلیارد: میلیارد؛ وگرنه تومان با ویرگول */
  function moneyInit(toman, defUnit) {
    const n = Number(toman);
    const du = defUnit === 't' ? 't' : 'b';
    if (!n || !isFinite(n) || n <= 0) return { unit: du, text: '' };
    if (n >= 1e9) return { unit: 'b', text: moneyFormat(String(Math.round(n / 1e3) / 1e6), 'b') };
    return { unit: 't', text: moneyFormat(String(Math.round(n)), 't') };
  }

  /* HTML کادر مبلغ (برچسب را بیرون بگذار). id = شناسه‌ی کادر؛ انتخاب واحد با id + '-unit' */
  function moneyHtml(id, toman, defUnit) {
    const m = moneyInit(toman, defUnit);
    return '<div class="money-row"><input type="text" class="money-in" id="' + id + '" inputmode="decimal" autocomplete="off" value="' + esc(m.text) + '">'
      + '<select class="money-unit" id="' + id + '-unit"><option value="b"' + (m.unit === 'b' ? ' selected' : '') + '>میلیارد</option><option value="t"' + (m.unit === 't' ? ' selected' : '') + '>تومان</option></select></div>';
  }

  /* خواندن کادر مبلغ: '' (خالی) | عدد تومان | NaN (نامعتبر) */
  function moneyValue(text, unit) {
    const s = moneyFormat(text, unit).replace(/,/g, '');
    if (!s) return '';
    const n = Number(s);
    if (!isFinite(n)) return NaN;
    return Math.round(n * (MONEY_MULT[unit] || 1));
  }
  function moneyRead(root, id) {
    const el = root.querySelector('#' + id), u = root.querySelector('#' + id + '-unit');
    if (!el) return '';
    return moneyValue(el.value, u ? u.value : 'b');
  }

  /* اتصال قالب‌بندی زنده به همه‌ی کادرهای مبلغ داخل root (نشانگر متن حفظ می‌شود) */
  function moneyBind(root) {
    root.querySelectorAll('.money-in').forEach((el) => {
      const u = root.querySelector('#' + el.id + '-unit');
      const apply = () => {
        const unit = u ? u.value : 'b';
        const pos = el.selectionStart == null ? el.value.length : el.selectionStart;
        const digitsBefore = toLatinDigits(el.value.slice(0, pos)).replace(/[^\d.\u066B\/]/g, '').length;
        const out = moneyFormat(el.value, unit);
        if (out !== el.value) {
          el.value = out;
          let seen = 0, np = out.length;
          for (let i = 0; i < out.length; i++) { if (/[\d.]/.test(out[i])) seen++; if (seen >= digitsBefore) { np = i + 1; break; } }
          if (!digitsBefore) np = 0;
          try { el.setSelectionRange(np, np); } catch (e) { /* بی‌اثر */ }
        }
      };
      el.addEventListener('input', apply);
      if (u) u.addEventListener('change', apply);
      apply();
    });
  }

  return {
    faText, moneyFormat, moneyInit, moneyHtml, moneyValue, moneyRead, moneyBind,
    toLatinDigits, norm, parseNumber, faNum, faDigits, formatMoney,
    faDate, faTime, faDateShort, fileSize, esc, debounce, uid,
    gregorianToJalali, toJalali, jalaliToGregorian, faWeekday, faFullDate, faMonthYear,
    JALALI_MONTHS, JALALI_WEEKDAYS
  };
})();

if (typeof globalThis !== 'undefined') globalThis.Utils = Utils; // در دسترس همه ماژول‌ها در مرورگر

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils; // پشتیبانی از تست در Node
}
