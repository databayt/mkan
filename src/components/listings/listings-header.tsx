"use client";

import React, { useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BigSearch from "@/components/template/search/big-search";
import SmallSearch from "@/components/template/search/small-search";
import useSearchHeaderStore from "@/hooks/useSearchHeaderStore";

// Spring configurations for natural, Airbnb-like feel
const SPRING_CONFIG = {
  expandCollapse: { type: "spring" as const, stiffness: 400, damping: 30 },
  overlay: { type: "spring" as const, stiffness: 500, damping: 40 },
};

// Animation variants
const bigSearchVariants = {
  collapsed: {
    opacity: 0,
    y: -20,
    scale: 0.95,
  },
  expanded: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
};

const smallSearchVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
};

const navLinksVariants = {
  hidden: { opacity: 0, y: -10 },
  visible: { opacity: 1, y: 0 },
};

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const ListingsHeader = () => {
  const pathname = usePathname();
  const {
    isExpanded,
    isOverlayActive,
    setScrollExpanded,
    expandFromSmallSearch,
    collapse,
  } = useSearchHeaderStore();

  const navigationItems = [
    { name: "Homes", href: "#" },
    { name: "Experiences", href: "#" },
    { name: "Services", href: "#" },
  ];

  // Scroll handler
  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > 50; // Small threshold for better UX
      setScrollExpanded(!scrolled);
    };

    // Initial check
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [setScrollExpanded]);

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOverlayActive) {
        collapse();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOverlayActive, collapse]);

  // Body scroll lock when overlay is active
  useEffect(() => {
    if (isOverlayActive) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOverlayActive]);

  const handleSmallSearchClick = useCallback(() => {
    expandFromSmallSearch();
  }, [expandFromSmallSearch]);

  const handleOverlayClick = useCallback(() => {
    collapse();
  }, [collapse]);

  const isActiveRoute = (href: string) => {
    return pathname === href;
  };

  return (
    <>
      {/* Overlay - positioned fixed, behind header content */}
      <AnimatePresence>
        {isOverlayActive && (
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={SPRING_CONFIG.overlay}
            onClick={handleOverlayClick}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <header
        className={`bg-white sticky top-0 z-50 transition-shadow duration-300 ${
          isOverlayActive ? "shadow-xl" : "border-b"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top row - Logo, Nav/SmallSearch, User */}
          <div className="relative flex items-center h-14 pt-4 min-h-[56px]">
            {/* Left side - Logo - Fixed Position */}
            <div className="flex items-center w-1/3">
              {/* Mkan Logo */}
              <Link
                href="/"
                className="cursor-pointer hover:text-gray-700"
                scroll={false}
              >
                <div className="flex items-center gap-2">
                  <Image
                    src="/tent.png"
                    alt="Mkan Logo"
                    width={20}
                    height={20}
                    className="w-5 h-5"
                  />
                  <div className="text-xl font-bold text-gray-900">
                    Mk
                    <span className="font-light hover:text-gray-700 text-gray-600">
                      an
                    </span>
                  </div>
                </div>
              </Link>
            </div>

            {/* Center - Navigation Links OR Small Search */}
            <div className="flex-1 flex justify-center items-center relative h-12">
              {/* Navigation Links */}
              <AnimatePresence mode="wait">
                {isExpanded && (
                  <motion.nav
                    className="flex space-x-8 absolute"
                    variants={navLinksVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    transition={SPRING_CONFIG.expandCollapse}
                    key="nav-links"
                  >
                    {navigationItems.map((item) => (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`relative text-sm font-medium transition-colors ${
                          isActiveRoute(item.href)
                            ? "text-gray-900 border-b-2 border-gray-900 pb-0.5"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        {item.name}
                      </Link>
                    ))}
                  </motion.nav>
                )}
              </AnimatePresence>

              {/* Small Search */}
              <AnimatePresence mode="wait">
                {!isExpanded && (
                  <motion.div
                    className="absolute"
                    variants={smallSearchVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    transition={SPRING_CONFIG.expandCollapse}
                    key="small-search"
                  >
                    <SmallSearch onExpand={handleSmallSearchClick} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right side - User Controls - Fixed Position */}
            <div className="flex items-center justify-end space-x-2 w-1/3">
              <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center">
                <span className="text-white font-medium text-sm">A</span>
              </div>

              <button className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors">
                <Menu size={16} className="text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Second Row - Big Search Component */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              className="w-full px-4 sm:px-6 lg:px-32 pt-3 pb-4 overflow-hidden"
              variants={bigSearchVariants}
              initial="collapsed"
              animate="expanded"
              exit="collapsed"
              transition={SPRING_CONFIG.expandCollapse}
              key="big-search"
            >
              <BigSearch onClose={handleOverlayClick} />
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
};

export default ListingsHeader;
