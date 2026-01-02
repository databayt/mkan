'use client';

import React from 'react';
import Link from 'next/link';
import { Home, Bus, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface BecomeHostMenuProps {
  isLandingPage?: boolean;
  className?: string;
}

export function BecomeHostMenu({ isLandingPage = false, className }: BecomeHostMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-1 text-sm font-light hover:opacity-80 focus:outline-none',
          isLandingPage ? 'text-white' : 'text-gray-700',
          className
        )}
      >
        Become a host
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/host" className="flex items-center gap-3 cursor-pointer">
            <Home className="h-4 w-4" />
            <div>
              <div className="font-medium">Host your space</div>
              <div className="text-xs text-muted-foreground">List a property for rent</div>
            </div>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/transport-host" className="flex items-center gap-3 cursor-pointer">
            <Bus className="h-4 w-4" />
            <div>
              <div className="font-medium">Host transportation</div>
              <div className="text-xs text-muted-foreground">Offer bus services</div>
            </div>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default BecomeHostMenu;
