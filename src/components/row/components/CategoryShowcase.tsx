'use client';

import Image from "next/image";
import { cn } from "@/lib/utils";

const CATEGORY_ITEMS = [
  {
    name: "Beach",
    title: "Beach Houses",
    description: "Properties with direct beach access",
    imageUrl: "/airbnb/Beach.svg",
    bgColor: "bg-blue-50"
  },
  {
    name: "Modern",
    title: "Modern Homes",
    description: "Contemporary architectural designs",
    imageUrl: "/airbnb/Mension.svg",
    bgColor: "bg-gray-50"
  },
  {
    name: "Countryside",
    title: "Country Houses",
    description: "Peaceful retreats in nature",
    imageUrl: "/airbnb/Windmill.svg",
    bgColor: "bg-green-50"
  },
  {
    name: "Islands",
    title: "Island Getaways",
    description: "Exclusive island properties",
    imageUrl: "/airbnb/Islands.svg",
    bgColor: "bg-purple-50"
  }
];

interface CategoryShowcaseProps {
  categoryName: string;
  className?: string;
  onClick?: () => void;
}

const DEFAULT_CATEGORY = {
  name: "Beach",
  title: "Beach Houses",
  description: "Properties with direct beach access",
  imageUrl: "/airbnb/Beach.svg",
  bgColor: "bg-blue-50"
};

export function CategoryShowcase({ categoryName, className, onClick }: CategoryShowcaseProps) {
  const category = CATEGORY_ITEMS.find((item) => item.name === categoryName) ?? DEFAULT_CATEGORY;

  return (
    <div 
      onClick={onClick}
      className={cn(
        "flex items-center p-4 rounded-2xl transition-all duration-200",
        category.bgColor,
        onClick && "cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
        className
      )}
    >
      <div className="relative flex items-center justify-center w-12 h-12 overflow-hidden rounded-xl">
        <Image
          src={category.imageUrl}
          alt={`${category.name} category`}
          width={44}
          height={44}
          className="object-contain transition-transform duration-200 hover:scale-110"
        />
      </div>

      <div className="flex flex-col ml-4">
        <h3 className="font-medium text-gray-900">{category.title}</h3>
        <p className="text-sm text-gray-500">{category.description}</p>
      </div>
    </div>
  );
}
