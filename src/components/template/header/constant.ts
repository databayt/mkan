// Header navigation items.
//
// `dictKey` names the `navigation.*` dictionary entry the header renders; the
// `label` / `labelAr` pair stays as the literal fallback so a missing key
// degrades to readable text instead of an empty nav slot (and so the i18n
// hardcoded-string scanner sees a dict chain, not a bare literal, at the
// render site).

export type NavItem = {
  type?: string;
  href: string;
  /** Key under `navigation.*` in en.json / ar.json. */
  dictKey: string;
  label: string;
  labelAr: string;
};

// Alternative: Single array approach
export const ALL_NAVIGATION_ITEMS: NavItem[] = [
  { type: "display", href: "/host", dictKey: "becomeHost", label: "Become a host", labelAr: "كن مضيفًا" },
  // Travel = the intercity bus vertical (/travel). This row used to read
  // "Create your experience" — an Airbnb Experiences label pointing at the bus
  // marketplace, so the only guest-facing entry to Travel was one no traveller
  // would ever click.
  { type: "display", href: "/travel", dictKey: "travel", label: "Travel", labelAr: "السفر" },
  { type: "display", href: "/help", dictKey: "help", label: "Help", labelAr: "المساعدة" },
  { type: "display", href: "/login", dictKey: "signIn", label: "Login", labelAr: "تسجيل الدخول" },
  { type: "display", href: "/join", dictKey: "signUp", label: "Join", labelAr: "انضم" },
];

// Current approach: Separate arrays
export const NAVIGATION_LINKS: NavItem[] = [
  { href: "/host", dictKey: "becomeHost", label: "Become a host", labelAr: "كن مضيفًا" },
  { href: "/travel", dictKey: "travel", label: "Travel", labelAr: "السفر" },
  { href: "/help", dictKey: "help", label: "Help", labelAr: "المساعدة" },
];

export const DISPLAY_ITEMS: { label: string; labelAr?: string }[] = [];

export const AUTH_LINKS = [
  { href: "/login", dictKey: "signIn", label: "Sign in", labelAr: "تسجيل الدخول" },
  { href: "/register", dictKey: "signUp", label: "Sign up", labelAr: "إنشاء حساب" },
];
