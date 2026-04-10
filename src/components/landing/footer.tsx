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
import { useDictionary } from "@/components/internationalization/dictionary-context";

const FooterSection = () => {
  const dict = useDictionary();

  return (
    <footer className="border-t border-gray-200 py-20">
      <div className="max-w-4xl mx-auto px-6 sm:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4">
            <Link href="/" className="text-xl font-bold" scroll={false}>
              {dict.landing?.footer?.brandName ?? "Mkan"}
            </Link>
          </div>
          <nav className="mb-4">
            <ul className="flex space-x-6 rtl:space-x-reverse">
              <li>
                <Link href="/about">{dict.landing?.footer?.aboutUs ?? "About Us"}</Link>
              </li>
              <li>
                <Link href="/contact">{dict.landing?.footer?.contactUs ?? "Contact Us"}</Link>
              </li>
              <li>
                <Link href="/faq">{dict.landing?.footer?.faq ?? "FAQ"}</Link>
              </li>
              <li>
                <Link href="/terms">{dict.landing?.footer?.terms ?? "Terms"}</Link>
              </li>
              <li>
                <Link href="/privacy">{dict.landing?.footer?.privacy ?? "Privacy"}</Link>
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
          <span>{dict.landing?.footer?.copyright ?? "\u00A9 2024 Mkan. All rights reserved."}</span>
          <Link href="/privacy">{dict.landing?.footer?.privacyPolicy ?? "Privacy Policy"}</Link>
          <Link href="/terms">{dict.landing?.footer?.termsOfService ?? "Terms of Service"}</Link>
          <Link href="/cookies">{dict.landing?.footer?.cookiePolicy ?? "Cookie Policy"}</Link>
          <ReportIssue />
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
