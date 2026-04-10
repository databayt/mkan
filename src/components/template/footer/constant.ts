export interface FooterSection {
  title: string;
  links: {
    label: string;
    href: string;
  }[];
}

export interface SocialLink {
  name: string;
  icon: string;
  href: string;
}

export const FOOTER_SECTIONS: FooterSection[] = [
  {
    title: "Support",
    links: [
      { label: "Help Center", href: "/help" },
      { label: "Safety Information", href: "/safety" },
      { label: "Cancellation options", href: "/cancellation" },
      { label: "Our COVID-19 Response", href: "/covid19" },
      { label: "Supporting people with disabilities", href: "/accessibility" },
      { label: "Report a neighborhood concern", href: "/report" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Mkan.org: disaster relief housing", href: "/mkan-org" },
      { label: "Support: Afghan refugees", href: "/afghan-refugees" },
      { label: "Celebrating diversity & belonging", href: "/diversity" },
      { label: "Combating discrimination", href: "/anti-discrimination" },
    ],
  },
  {
    title: "Hosting",
    links: [
      { label: "Try hosting", href: "/host" },
      { label: "AirCover: protection for Hosts", href: "/aircover-hosts" },
      { label: "Explore hosting resources", href: "/host/resources" },
      { label: "Visit our community forum", href: "/community-forum" },
      { label: "How to host responsibly", href: "/responsible-hosting" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "Newsroom", href: "/newsroom" },
      { label: "Learn about new features", href: "/features" },
      { label: "Letter from our founders", href: "/founders" },
      { label: "Careers", href: "/careers" },
      { label: "Investors", href: "/investors" },
      { label: "Mkan Luxe", href: "/luxe" },
    ],
  },
];

export const SOCIAL_LINKS: SocialLink[] = [
  {
    name: "Facebook",
    icon: "facebook",
    href: "https://facebook.com/mkan",
  },
  {
    name: "Twitter",
    icon: "twitter",
    href: "https://twitter.com/mkan",
  },
  {
    name: "Instagram",
    icon: "instagram",
    href: "https://instagram.com/mkan",
  },
];

export const FOOTER_LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Sitemap", href: "/sitemap" },
  { label: "Company details", href: "/company" },
];

export const FOOTER_LANGUAGE_CURRENCY = {
  language: {
    code: "en",
    label: "English (US)",
    icon: "🌐",
  },
  currency: {
    code: "USD",
    label: "$ USD",
    symbol: "$",
  },
};

export const FOOTER_COPYRIGHT = {
  year: new Date().getFullYear(),
  company: "Mkan, Inc.",
  text: "All rights reserved",
};
