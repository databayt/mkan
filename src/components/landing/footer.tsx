"use client";

import Link from "next/link";
import React from "react";
import {
  Facebook,
  Instagram,
  Twitter,
  LinkedIn,
  YouTube,
} from "@/components/atom/icons";
import { ReportIssue } from "@/components/report-issue";
import { usePathname } from "next/navigation";

const FooterSection = () => {
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");

  return (
    <footer className="border-t border-gray-200 py-20">
      <div className="max-w-4xl mx-auto px-6 sm:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4">
            <Link href="/" className="text-xl font-bold" scroll={false}>
              {isAr ? "مكان" : "Mkan"}
            </Link>
          </div>
          <nav className="mb-4">
            <ul className="flex space-x-6 rtl:space-x-reverse">
              <li>
                <Link href="/about">{isAr ? "من نحن" : "About Us"}</Link>
              </li>
              <li>
                <Link href="/contact">{isAr ? "اتصل بنا" : "Contact Us"}</Link>
              </li>
              <li>
                <Link href="/faq">{isAr ? "الأسئلة الشائعة" : "FAQ"}</Link>
              </li>
              <li>
                <Link href="/terms">{isAr ? "الشروط" : "Terms"}</Link>
              </li>
              <li>
                <Link href="/privacy">{isAr ? "الخصوصية" : "Privacy"}</Link>
              </li>
            </ul>
          </nav>
          <div className="flex space-x-4 rtl:space-x-reverse mb-4">
            <a
              href="#"
              aria-label="Facebook"
              className="hover:text-primary-600"
            >
              <Facebook className="h-6 w-6" />
            </a>
            <a
              href="#"
              aria-label="Instagram"
              className="hover:text-primary-600"
            >
              <Instagram className="h-6 w-6" />
            </a>
            <a href="#" aria-label="Twitter" className="hover:text-primary-600">
              <Twitter className="h-6 w-6" />
            </a>
            <a
              href="#"
              aria-label="Linkedin"
              className="hover:text-primary-600"
            >
              <LinkedIn className="h-6 w-6" />
            </a>
            <a href="#" aria-label="Youtube" className="hover:text-primary-600">
              <YouTube className="h-6 w-6" />
            </a>
          </div>
        </div>
        <div className="mt-8 text-center text-sm text-gray-500 flex justify-center space-x-4 rtl:space-x-reverse">
          <span>{isAr ? "\u00A9 2024 مكان. جميع الحقوق محفوظة." : "\u00A9 2024 Mkan. All rights reserved."}</span>
          <Link href="/privacy">{isAr ? "سياسة الخصوصية" : "Privacy Policy"}</Link>
          <Link href="/terms">{isAr ? "شروط الخدمة" : "Terms of Service"}</Link>
          <Link href="/cookies">{isAr ? "سياسة ملفات تعريف الارتباط" : "Cookie Policy"}</Link>
          <ReportIssue />
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
