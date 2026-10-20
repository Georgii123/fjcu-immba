/**
 * Supabase project settings. Both values are PUBLIC by design:
 * the key is the "publishable" key, and what it can do is limited by the
 * row-level security rules in supabase/schema.sql (visitors can only read
 * published announcements; only the admin account can change anything).
 * Never put the "secret" key in this file.
 */
window.SUPABASE_CONFIG = {
  url: 'https://htgopftaykbwpgahkyfl.supabase.co',
  key: 'sb_publishable_Qxej6TdS-XKCGuIfGJBzng_8YSlY2_q'
};
