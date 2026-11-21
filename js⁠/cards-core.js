'use strict';
/* ============================================================
   کارت ملک — منطق خالص (بدون DOM/دیتابیس؛ قابل تست در Node)
   مشترک بین برنامه‌ی مشاور و صفحه‌ی عمومی card.html
   ============================================================ */
const CardsCore = (() => {
  const U = (typeof Utils !== 'undefined') ? Utils : require('./utils.js');
  const CC = (typeof ClientsCore !== 'undefined') ? ClientsCore : require('./clients-core.js');
  const L = (typeof ListingsCore !== 'undefined') ? ListingsCore : require('./listings-core.js');
  const bad = (m) => Object.assign(new Error(m), { userFacing: true });
  const TOKEN_RE = /^[a-f0-9]{32}$/;

  /* ?c=TOKEN → توکن معتبر یا null */
  function parseToken(search) {
    const m = /[?&]c=([^&#]*)/.exec(String(search || ''));
    const t = m ? decodeURIComponent(m[1]).trim().toLowerCase() : '';
    return TOKEN_RE.test(t) ? t : null;
  }

  function cardUrl(baseHref, token) {
    const u = new URL('card.html', String(baseHref).split('#')[0]);
    u.search = '?c=' + token;
    return u.href;
  }

  /* شماره‌ی ایران → بین‌المللی برای wa.me */
  function intlPhone(p) {
    let d = CC.normalizePhone(p || '').replace(/\D/g, '');
    if (/^09\d{9}$/.test(d)) d = '98' + d.slice(1);
    return d;
  }

  /* ردیف دیتابیس (card_public) → مدل نمایش صفحه‌ی عمومی */
  function publicModel(row) {
    if (!row) return null;
    const t = L.TYPES[row.type] || L.TYPES.sale;
    const l = { type: row.type, size: row.size, floor: row.floor, age: row.age, price: row.price, deposit: row.deposit, rentMonthly: row.rent_monthly };
    const prices = L.priceText(l).split(' | ').filter(Boolean).map((s) => { const i = s.indexOf(': '); return { label: s.slice(0, i), value: s.slice(i + 2) }; });
    const phone = CC.normalizePhone(row.contact_phone || '');
    const title = t.label + ' · ' + row.area;
    const wa = intlPhone(phone);
    return {
      icon: t.icon, title, facts: L.specText(l).split(' | ').filter(Boolean), prices,
      features: row.features || '', note: row.note || '',
      closed: !!row.listing_status && row.listing_status !== 'active',
      knownClient: row.known_client,   // false = «لینک عمومی» (مشتری باید اسم و شماره بدهد)؛ undefined = دیتابیس هنوز به‌روز نشده
      contactName: row.contact_name || '', contactAgency: row.contact_agency || '', phone,
      telHref: phone ? 'tel:' + phone : '',
      waHref: wa ? 'https://wa.me/' + wa + '?text=' + encodeURIComponent('سلام، کارت ملک «' + title + '» را دیدم.') : ''
    };
  }

  /* اسم و شماره‌ی مشتری در «لینک عمومی»؛ هر دو اجباری */
  function validateVisitor(name, phone) {
    const n = String(name == null ? '' : name).trim();
    if (n.length < 2) return { ok: false, error: 'نام خود را وارد کن.' };
    if (n.length > 60) return { ok: false, error: 'نام حداکثر ۶۰ حرف باشد.' };
    const p = CC.normalizePhone(phone);
    if (!CC.isMobile(p) && p.length < 7) return { ok: false, error: 'شماره‌ی تماس معتبر نیست.' };
    return { ok: true, name: n, phone: p };
  }

  function validateCard(f) {
    f = f || {};
    if (f.listingId === null || f.listingId === undefined || f.listingId === '') throw bad('فایل انتخاب نشده است.');
    const text = (v, max, label) => { const s = String(v == null ? '' : v).trim(); if (s.length > max) throw bad(label + ' حداکثر ' + U.faDigits(max) + ' حرف باشد.'); return s || null; };
    const rawPhone = String(f.contactPhone == null ? '' : f.contactPhone).trim();
    if (!rawPhone) throw bad('شماره‌ی تماس خودت را وارد کن تا مشتری بتواند زنگ بزند.');
    const contactPhone = CC.normalizePhone(rawPhone);
    if (!CC.isMobile(contactPhone) && contactPhone.length < 7) throw bad('شماره‌ی تماس معتبر نیست.');
    return {
      listingId: f.listingId,
      clientId: f.clientId === undefined || f.clientId === '' ? null : f.clientId,
      note: text(f.note, 300, 'پیام'), contactName: text(f.contactName, 100, 'نام'), contactAgency: text(f.contactAgency, 100, 'نام املاک'), contactPhone
    };
  }

  const fmtDuration = (sec) => {
    const s = Number(sec) || 0;
    if (s <= 0) return '—';
    return s < 60 ? 'کمتر از ۱ دقیقه' : U.faDigits(Math.round(s / 60)) + ' دقیقه';
  };

  /* خلاصه‌ی کارت‌ها برای صفحه‌ی «بازدیدها» — جدیدترین فعالیت اول */
  function summarize(cards, events, clients, listings) {
    const byCard = {};
    (events || []).forEach((e) => { (byCard[e.cardId] = byCard[e.cardId] || []).push(e); });
    const cl = {}; (clients || []).forEach((c) => { cl[c.id] = c; });
    const ls = {}; (listings || []).forEach((l) => { ls[l.id] = l; });
    return (cards || []).map((c) => {
      const evs = byCard[c.id] || [];
      const opens = evs.filter((e) => e.kind === 'open');
      const last = evs.reduce((m, e) => { const t = String(e.updatedAt || e.createdAt || ''); return t > m ? t : m; }, '');
      const l = ls[c.listingId];
      return {
        card: c, revoked: !!c.revokedAt,
        clientName: c.clientId && cl[c.clientId] ? cl[c.clientId].name : '',
        listingTitle: l ? (L.TYPES[l.type] ? L.TYPES[l.type].label : '') + ' · ' + l.area : 'فایل حذف‌شده', listing: l || null,
        opens: opens.length, seconds: opens.reduce((s, e) => s + (e.seconds || 0), 0),
        want: evs.some((e) => e.kind === 'want'), unseen: evs.filter((e) => !e.seen).length,
        wants: evs.filter((e) => e.kind === 'want').map((e) => ({ name: e.visitorName || '', phone: CC.normalizePhone(e.visitorPhone || ''), at: e.createdAt || '', seen: !!e.seen })).sort((a, b) => String(b.at).localeCompare(String(a.at))),
        lastAt: last || null
      };
    }).sort((a, b) => String(b.lastAt || b.card.createdAt || '').localeCompare(String(a.lastAt || a.card.createdAt || '')));
  }

  /* درخواست‌های «می‌خواهم ببینم»ِ دیده‌نشده → فهرست هشدار (جدیدترین اول) */
  function wantAlerts(cards, events, clients, listings) {
    const cd = {}; (cards || []).forEach((c) => { cd[c.id] = c; });
    const cl = {}; (clients || []).forEach((c) => { cl[c.id] = c; });
    const ls = {}; (listings || []).forEach((l) => { ls[l.id] = l; });
    return (events || []).filter((e) => e.kind === 'want' && !e.seen && cd[e.cardId]).map((e) => {
      const c = cd[e.cardId], l = ls[c.listingId], client = c.clientId ? cl[c.clientId] : null;
      /* مشتری ثبت‌شده → از پرونده؛ «لینک عمومی» → اسم و شماره‌ای که خودِ مشتری هنگام تأیید وارد کرده */
      const phone = client && client.phone ? CC.normalizePhone(client.phone) : CC.normalizePhone(e.visitorPhone || '');
      return {
        eventId: e.id, cardId: c.id, clientId: client ? client.id : null,
        clientName: client ? client.name : String(e.visitorName || '').trim(),
        registered: !!client,
        listingTitle: l ? (L.TYPES[l.type] ? L.TYPES[l.type].label : '') + ' · ' + l.area : 'ملک حذف‌شده',
        phone, telHref: phone ? 'tel:' + phone : '', at: e.createdAt || '', timeText: e.createdAt ? U.faTime(e.createdAt) : ''
      };
    }).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  const alertText = (a) => '🙋 ' + (a.clientName || 'یک مشتری (نام ثبت نشده)') + ' می‌خواهد ' + a.listingTitle + ' را ببیند';

  const unseenCount = (events) => (events || []).filter((e) => !e.seen).length;

  /* متن اولِ آگهی (سطح ۱) بدون جمله‌ی پایانی «پیام بدهید»؛ جایش درخواست باز کردن لینک می‌آید */
  function bodyLines(listing) {
    return L.buildMessage(1, listing).split('\n').filter((x) => x && !/^برای اطلاعات بیشتر/.test(x));
  }

  /* پیام آماده برای فرستادن لینک به مشتری:
     سلام، متن اول ملک، درخواست باز کردن لینک برای تأیید و جزئیات، لینک، نام مشاور.
     info.body = خطوط متن ملک (bodyLines)، info.advisor = نام مشاور (اختیاری) */
  function shareText(info) {
    const head = info.clientName ? 'سلام و وقت بخیر، ' + info.clientName + ' عزیز 🌿' : 'سلام و وقت بخیر 🌿';
    const body = info.body && info.body.length ? info.body : [info.listingTitle ? '🏠 ' + info.listingTitle : ''].concat(info.details || []);
    const lines = [head, ''].concat(body.filter(Boolean));
    if (info.url) lines.push('', 'خواهشمندیم برای تأیید و مشاهده‌ی جزئیات بیشتر، لینک زیر را باز فرمایید 👇', info.url);
    if (info.advisor) lines.push('', info.advisor);
    return lines.join('\n').trim();
  }

  /* لینک ارسال در واتساپ و تلگرام (بله لینک اشتراک رسمی ندارد؛ برنامه خودش کپی/اشتراک سیستمی می‌کند) */
  function shareLinks(info, phone) {
    const full = shareText(info);
    const noUrl = shareText(Object.assign({}, info, { url: '' }));
    return {
      text: full,
      wa: 'https://wa.me/' + intlPhone(phone || '') + '?text=' + encodeURIComponent(full),
      tg: 'https://t.me/share/url?url=' + encodeURIComponent(info.url || ' ') + '&text=' + encodeURIComponent(noUrl)
    };
  }

  /* نمایش کوتاه‌شده‌ی لینک در برنامه (لینک اصلی دست‌نخورده می‌ماند) */
  function shortLabel(url) {
    const m = /^https?:\/\/([^/]+)\/.*[?&]c=([a-f0-9]{32})/i.exec(String(url || ''));
    return m ? m[1] + '/card · ' + m[2].slice(0, 6) + '…' + m[2].slice(-4) : String(url || '');
  }

  return { TOKEN_RE, parseToken, cardUrl, intlPhone, publicModel, validateVisitor, validateCard, fmtDuration, summarize, unseenCount, bodyLines, shareText, shareLinks, shortLabel, wantAlerts, alertText };
})();

if (typeof globalThis !== 'undefined') globalThis.CardsCore = CardsCore;
if (typeof module !== 'undefined' && module.exports) module.exports = CardsCore;
