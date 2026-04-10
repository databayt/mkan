// Alternative: Single array approach
export const ALL_NAVIGATION_ITEMS = [
  { type: "display", href: "/host", label: "Become a host", labelAr: "كن مضيفًا" },
  { type: "display", href: "/transport", label: "Create your experience", labelAr: "أنشئ تجربتك" },
  { type: "display", href: "/help", label: "Help", labelAr: "المساعدة" },
  { type: "display", href: "/login", label: "Login", labelAr: "تسجيل الدخول" },
  { type: "display", href: "/join", label: "Join", labelAr: "انضم" },
];

// Current approach: Separate arrays
export const NAVIGATION_LINKS = [
  { href: "/host", label: "Become a host", labelAr: "كن مضيفًا" },
  { href: "/transport", label: "Create your experience", labelAr: "أنشئ تجربتك" },
  { href: "/help", label: "Help", labelAr: "المساعدة" },
];

export const DISPLAY_ITEMS: { label: string; labelAr?: string }[] = [];

export const AUTH_LINKS = [
  { href: "/login", label: "Sign in", labelAr: "تسجيل الدخول" },
  { href: "/register", label: "Sign up", labelAr: "إنشاء حساب" },
];
