"use client";

import { Globe } from "lucide-react";
import Link from "next/link";

const footerSections = [
  {
    title: "Support",
    links: [
      { label: "Help Center", href: "/help" },
      { label: "AirCover", href: "/aircover" },
      { label: "Cancellation options", href: "/help/cancellation" },
    ],
  },
  {
    title: "Hosting",
    links: [
      { label: "Mkan your home", href: "/host/homes" },
      { label: "Hosting resources", href: "/resources" },
      { label: "Community forum", href: "/community" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Newsroom", href: "/press/news" },
      { label: "Careers", href: "/careers" },
      { label: "Investors", href: "/investors" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Gift cards", href: "/giftcards" },
      { label: "New features", href: "/release" },
      { label: "Emergency stays", href: "/emergency" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-gray-100 border-t border-gray-200">
      {/* Main Footer Content */}
      <div className="layout-container py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                {section.title}
              </h3>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-200">
        <div className="layout-container py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Left side - Copyright and links */}
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-sm text-gray-600">
              <span>© 2024 Mkan, Inc.</span>
              <span className="hidden md:inline">·</span>
              <Link href="/terms" className="hover:underline">Terms</Link>
              <span className="hidden md:inline">·</span>
              <Link href="/sitemap" className="hover:underline">Sitemap</Link>
              <span className="hidden md:inline">·</span>
              <Link href="/privacy" className="hover:underline">Privacy</Link>
              <span className="hidden md:inline">·</span>
              <Link href="/sitemaps/v2" className="hover:underline flex items-center gap-1">
                Your Privacy Choices
              </Link>
            </div>

            {/* Right side - Language and currency */}
            <div className="flex items-center gap-4 text-sm text-gray-900">
              <button className="flex items-center gap-2 hover:underline">
                <Globe className="w-4 h-4" />
                <span>English (US)</span>
              </button>
              <button className="hover:underline">
                $ USD
              </button>
              {/* Social Links */}
              <div className="flex items-center gap-3">
                <Link href="https://facebook.com" className="hover:opacity-70" aria-label="Facebook">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                  </svg>
                </Link>
                <Link href="https://twitter.com" className="hover:opacity-70" aria-label="Twitter">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </Link>
                <Link href="https://instagram.com" className="hover:opacity-70" aria-label="Instagram">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
