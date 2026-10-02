/**
 * Email data. Personal-mailbox domains give a blank email_domain in the directory (the domain says
 * nothing about the organisation). Role mailboxes (info@, hello@ …) are shared, so they never
 * count as a certain identity match.
 */

export const PERSONAL_EMAIL_DOMAINS: readonly string[] = [
  "gmail.com", "googlemail.com",
  "outlook.com", "outlook.co.uk", "hotmail.com", "hotmail.co.uk", "hotmail.fr", "live.com", "live.co.uk", "live.fr", "msn.com",
  "icloud.com", "me.com", "mac.com", "privaterelay.appleid.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.fr", "ymail.com", "rocketmail.com", "aol.com", "aol.co.uk",
  "proton.me", "protonmail.com", "protonmail.ch", "pm.me", "passmail.net",
  "gmx.com", "gmx.co.uk", "gmx.de", "gmx.net", "web.de", "t-online.de", "mail.com", "email.com",
  "zohomail.com", "zohomail.eu", "yandex.com", "yandex.ru", "mail.ru", "qq.com", "163.com", "126.com", "naver.com",
  "btinternet.com", "sky.com", "virginmedia.com", "talktalk.net", "ntlworld.com", "blueyonder.co.uk", "tiscali.co.uk", "plus.net",
  "fastmail.com", "fastmail.fm", "hey.com", "tutanota.com", "tuta.io", "hushmail.com", "duck.com", "inbox.com",
  "orange.fr", "wanadoo.fr", "free.fr", "laposte.net", "libero.it", "rediffmail.com",
];

/** Domains whose local part ignores dots (Gmail). */
export const DOTLESS_DOMAINS: readonly string[] = ["gmail.com", "googlemail.com"];

/** Domain aliases folded together before comparing. */
export const DOMAIN_ALIASES: Readonly<Record<string, string>> = { "googlemail.com": "gmail.com" };

/** Local parts of shared mailboxes: never a certain identity match on their own. */
export const ROLE_LOCAL_PARTS: readonly string[] = [
  "info", "hello", "hi", "hey", "contact", "contactus", "team", "admin", "office", "enquiries", "inquiries", "support", "help",
  "sales", "events", "event", "membership", "members", "community", "noreply", "no-reply", "donotreply", "accounts", "finance",
  "hr", "jobs", "careers", "press", "media", "marketing", "mail", "general", "partners", "partnerships", "founders", "studio",
];
