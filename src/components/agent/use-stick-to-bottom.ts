"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Within this many pixels of the end counts as "at the bottom". */
const NEAR_PX = 96;

/**
 * Chat scrolling as ChatGPT does it: new content keeps the view at the bottom
 * only while the reader is already there; scrolled up, they stay put and a
 * ↓ button appears. `trigger` is anything that grows the conversation.
 */
export function useStickToBottom(trigger: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [away, setAway] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_PX;
    atBottom.current = near;
    setAway(!near);
    setScrolled(el.scrollTop > 4);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    atBottom.current = true;
    setAway(false);
  }, []);

  useEffect(() => {
    if (atBottom.current) scrollToBottom();
  }, [trigger, scrollToBottom]);

  return { ref, onScroll, away, scrolled, scrollToBottom };
}
