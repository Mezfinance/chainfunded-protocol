import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const key = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

if (key) {
  posthog.init(key, {
    api_host: host,
    capture_pageview: false, // manual via PageviewTracker below
    capture_pageleave: true,
    person_profiles: 'identified_only',
  });
}

export function PageviewTracker() {
  const location = useLocation();
  const ph = usePostHog();
  useEffect(() => {
    if (ph) ph.capture('$pageview');
  }, [location.pathname, ph]);
  return null;
}

export function PostHogProvider({ children }) {
  if (!key) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
