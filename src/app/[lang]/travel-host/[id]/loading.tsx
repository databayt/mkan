"use client";

import React from 'react';
import { useDictionary } from '@/components/internationalization/dictionary-context';

export default function TransportHostLoading() {
  const dict = useDictionary();
  const t = dict?.transportHost?.loading;
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      role="status"
      aria-label={t?.label ?? "Loading"}
    >
      <div className="text-center">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"
          aria-hidden="true"
        />
        <p className="text-muted-foreground">{t?.text ?? "Loading..."}</p>
      </div>
    </div>
  );
}
