'use strict';
/* ============================================================
   پیکربندی Backend (سیستم حساب کاربری) — نسخه Deploy
   ------------------------------------------------------------
   ورود الزامی است؛ هیچ حالت «بدون حساب / مهمان / محلی» وجود ندارد.
   کاربر فقط از طریق «ثبت‌نام / ورود» وارد برنامه می‌شود.

   دو راه برای پیکربندی (به ترتیب اولویت):
   1) مقداردهی در همین فایل قبل از Deploy (توصیه‌شده):
        window.APP_CONFIG.supabaseUrl = 'https://XXXX.supabase.co';
        window.APP_CONFIG.supabaseAnonKey = 'eyJhbGciOi...';
      سپس روی Netlify آپلود کنید.
   2) از داخل خود برنامه: اگر پیکربندی خالی باشد، صفحه «راه‌اندازی
      سیستم ورود» نمایش داده می‌شود و مدیر URL و کلید را در همان‌جا
      وارد می‌کند (در حافظه دستگاه ذخیره می‌شود).
   ------------------------------------------------------------
   نکته: کلید anon عمومی است؛ امنیت و جداسازی اطلاعات هر کاربر
   توسط Row Level Security در سرور Supabase تضمین می‌شود، نه با
   ذخیره‌سازی محلی.
   ============================================================ */
window.APP_CONFIG = (function () {
  const defaults = {
    // دو حالت استقرار:
    //  true  → نسخه دارای حساب کاربری (ورود الزامی + جداسازی با user_id) — حالت پیش‌فرض
    //  false → نسخه اصلی برنامه (بدون ورود، ذخیره محلی در گوشی) — مثل نسخه قبل از Login
    backendEnabled: true,
    // نسخه‌ی «پرونده‌ی مشتری»: بدون کد شرکت و بدون بخش‌های انبار/سفارش
    crmOnly: true,
    // آدرس عمومی سایت (برای ساخت لینک کارت؛ داخل APK آدرس صفحه «localhost» است و برای مشتری باز نمی‌شود)
    publicUrl: 'https://yaneamlak.github.io/yane-card/',
    // ⬇️ آدرس و کلید پروژه‌ی جدید Supabase را اینجا بگذارید (Project Settings → API)
    supabaseUrl: 'https://okwgmfiqbydosocvvoxy.supabase.co',
    supabaseAnonKey: 'sb_publishable_CcZ35jxPoWzMbGfkYFrC2g_gX0ycxbw'
  };
  // پیکربندی ذخیره‌شده از داخل برنامه (صفحه راه‌اندازی)
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('anbar-supabase-config') || 'null'); } catch (e) { saved = null; }
  const cfg = Object.assign({}, defaults, saved || {}, window.APP_CONFIG || {});
  // این نسخه همیشه «پرونده‌ی مشتری» است؛ تنظیم قدیمیِ ذخیره‌شده نباید آن را خاموش کند
  cfg.crmOnly = true;
  return cfg;
})();
