'use strict';
/* ============================================================
   صفحه‌ی عمومی «کارت ملک» (card.html) — بدون ورود، بدون کتابخانه
   فقط دو تابع امن سرور را با توکن صدا می‌زند: card_public و card_track.
   ============================================================ */
const CardPage = (() => {
  const K = CardsCore;
  const esc = (s) => Utils.esc(s);

  /* env: { doc, fetch, config, search, storage, random, now, setInterval, onVisibility } — برای تست قابل جایگزینی */
  function run(env) {
    const $ = (id) => env.doc.getElementById(id);
    const state = (msg) => { $('cp-state').textContent = msg; $('cp-state').style.display = msg ? '' : 'none'; };
    const token = K.parseToken(env.search);
    const base = String((env.config && env.config.supabaseUrl) || '').replace(/\/+$/, '');
    const key = env.config && env.config.supabaseAnonKey;
    if (!token) { state('این لینک معتبر نیست.'); return Promise.resolve(false); }
    if (!base || !key) { state('تنظیمات سرور کامل نیست.'); return Promise.resolve(false); }

    const rpc = (fn, body, keepalive) => env.fetch(base + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: !!keepalive
    });
    const session = (() => {
      try { const s = env.storage.getItem('cp-session'); if (s) return s; } catch (e) { /* بی‌اثر */ }
      const s = Array.from({ length: 24 }, () => '0123456789abcdef'[Math.floor(env.random() * 16)]).join('');
      try { env.storage.setItem('cp-session', s); } catch (e) { /* بی‌اثر */ }
      return s;
    })();
    const track = (kind, seconds, keepalive, extra) => rpc('card_track', Object.assign({ p_token: token, p_session: session, p_kind: kind, p_seconds: seconds || 0 }, extra || {}), keepalive).catch(() => null);
    let needVisitor = false, formOpen = false;   // «لینک عمومی»: قبل از ثبت درخواست، اسم و شماره از مشتری گرفته می‌شود

    state('در حال بارگذاری…');
    return rpc('card_public', { p_token: token }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((rows) => {
      const m = Array.isArray(rows) && rows.length ? K.publicModel(rows[0]) : null;
      if (!m) { state('این لینک معتبر نیست یا غیرفعال شده است.'); return false; }
      state('');
      paint(m);
      track('open', 0);
      /* مدت ماندن: فقط زمانی که صفحه دیده می‌شود؛ هر ۱۵ ثانیه و موقع بستن/رفتن به پس‌زمینه */
      let total = 0, since = env.now();
      const flush = () => { if (since != null) { const n = env.now(); total += (n - since) / 1000; since = n; } return Math.round(total); };
      env.setInterval(() => { if (!env.doc.hidden) track('ping', flush()); }, 15000);
      env.onVisibility((hidden) => {
        if (hidden) { const s = flush(); since = null; if (s > 0) track('ping', s, true); }
        else since = env.now();
      });
      $('cp-want').onclick = async () => {
        const btn = $('cp-want');
        let extra = null;
        if (needVisitor && $('cp-visitor')) {
          if (!formOpen) {
            formOpen = true; $('cp-visitor').style.display = 'flex'; btn.textContent = 'ثبت درخواست بازدید';
            try { $('cp-v-name').focus(); } catch (e) { /* بی‌اثر */ }
            return;
          }
          const v = K.validateVisitor($('cp-v-name').value, $('cp-v-phone').value);
          if (!v.ok) { $('cp-v-err').textContent = v.error; return; }
          $('cp-v-err').textContent = '';
          extra = { p_name: v.name, p_phone: v.phone };
        }
        btn.disabled = true;
        const res = await track('want', 0, false, extra);
        let ok = !!(res && res.ok);
        if (ok) { try { ok = (await res.json()) === true; } catch (e) { /* پاسخ بدون بدنه: همان موفقیت HTTP */ } }
        if (ok && $('cp-visitor')) $('cp-visitor').style.display = 'none';
        $('cp-after').style.display = '';
        $('cp-after').className = 'cp-box cp-after' + (ok ? ' ok' : '');
        $('cp-after-msg').textContent = ok ? 'درخواست بازدید شما ثبت شد. مشاور شما در اسرع وقت برای هماهنگی با شما تماس خواهد گرفت.' : 'ثبت درخواست انجام نشد؛ لطفاً مستقیم با مشاور تماس بگیرید.';
        if (typeof $('cp-after').scrollIntoView === 'function') $('cp-after').scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (ok) btn.style.display = 'none'; else btn.disabled = false;
      };
      return true;
    });

    function paint(m) {
      $('cp-card').style.display = '';
      const parts = m.title.split(' · ');
      const kind = parts.shift();
      $('cp-badge').textContent = kind;
      $('cp-title').textContent = parts.length ? parts.join(' · ') : m.title;
      $('cp-closed').style.display = m.closed ? '' : 'none';
      $('cp-facts').innerHTML = m.facts.map((f) => {
        /* «۷۶ متر» / «طبقه ۵» / «۲ ساله» → کاشی با عدد درشت و برچسب روشن */
        let v = f, l = '';
        if (/متر/.test(f)) { v = f.replace(/\s*متر.*/, ''); l = 'متر مربع'; }
        else if (/^طبقه/.test(f)) { v = f.replace(/^طبقه\s*/, ''); l = 'طبقه'; }
        else if (/ساله/.test(f)) { v = f.replace(/\s*ساله.*/, ''); l = 'سن بنا (سال)'; }
        return '<div class="cp-tile"><b>' + esc(v) + '</b>' + (l ? '<span>' + esc(l) + '</span>' : '') + '</div>';
      }).join('');
      $('cp-prices').innerHTML = m.prices.map((p) => '<div class="cp-price"><span class="cp-label">' + esc(p.label) + '</span><b>' + esc(p.value) + '</b></div>').join('');
      $('cp-avatar').textContent = (m.contactName || 'م').trim().charAt(0);
      $('cp-features').textContent = m.features; $('cp-features-box').style.display = m.features ? '' : 'none';
      $('cp-note').textContent = m.note; $('cp-note-box').style.display = m.note ? '' : 'none';
      $('cp-contact-name').textContent = m.contactName || 'مشاور املاک';
      /* نام املاک: بالای صفحه، روی کارت مشاور و عنوان تب؛ بدون آن، همان نوشته‌های قبلی */
      $('cp-agency').textContent = m.contactAgency || 'Yane';
      $('cp-adv-label').textContent = m.contactAgency || 'مشاور املاک';
      try { env.doc.title = m.contactAgency ? m.contactAgency + ' | کارت ملک' : 'کارت ملک'; } catch (e) { /* بی‌اثر */ }
      ['cp-tel', 'cp-tel2'].forEach((id) => { $(id).href = m.telHref || '#'; $(id).style.display = m.telHref ? '' : 'none'; });
      $('cp-wa').href = m.waHref || '#'; $('cp-wa').style.display = m.waHref ? '' : 'none';
      needVisitor = m.knownClient === false;
      $('cp-want').style.display = m.closed ? 'none' : '';
    }
  }

  return { run };
})();
