"use client";

import { motion } from "framer-motion";
import React from "react";

interface FooterColumnProps {
  data: string[];
  index: number;
}

function FooterColumn({ data, index }: FooterColumnProps) {
  const [title, ...links] = data;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="flex flex-col gap-2"
    >
      <h5 className="font-bold uppercase">{title}</h5>
      {links.map((link, i) => (
        <button key={i} className="text-sm hover:underline">
          {link}
        </button>
      ))}
    </motion.div>
  );
}

const itemData = [
  ["ABOUT", "Newsroom", "Learn about new features", "Letter from our founders", "Careers", "Investors"],
  ["Support", "Help Center", "AirCover", "Cancellation options", "Safety information", "Report a neighborhood concern"],
  ["Community", "Newsroom", "Learn about new features", "Letter from our founders", "Careers", "Investors"],
  ["Hosting", "Try hosting", "AirCover for Hosts", "Explore hosting resources", "Safety information", "How to host responsibly"],
];

export default function Footer() {
  return (
    <div className="py-14 bg-gray-100 text-gray-600">
      <div className="layout-container">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-y-10">
          {itemData.map((item, index) => (
            <FooterColumn key={index} index={index} data={item} />
          ))}
          <p className="text-sm">United States</p>
        </div>
      </div>
    </div>
  );
}
