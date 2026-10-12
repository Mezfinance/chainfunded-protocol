import { useState, useEffect } from 'react';

/**
 * Geo-blocking Hook — Sanctions Compliance
 *
 * Checks the user's country via IP geolocation and blocks access
 * from OFAC/EU/UN sanctioned jurisdictions. Mirrors the Uniswap Labs
 * approach: geo-blocking at the frontend/interface layer.
 *
 * Sanctioned countries list matches TOS Section 1 (Eligibility).
 *
 * Uses free IP geolocation APIs with fallback chain:
 *   1. ipapi.co (free, 1K req/day, no key)
 *   2. ip-api.com (free, 45 req/min, no key)
 */

// ISO 3166-1 alpha-2 country codes for sanctioned jurisdictions
// Source: TOS Section 1 — Cuba, Iran, North Korea, Syria, Russia, Belarus,
// Crimea/Donetsk/Luhansk (reported as UA or RU depending on provider)
const SANCTIONED_COUNTRIES = new Set([
  'AF', // Afghanistan
  'BY', // Belarus
  'CU', // Cuba
  'IR', // Iran
  'KP', // North Korea
  'RU', // Russia
  'SD', // Sudan
  'SS', // South Sudan
  'SY', // Syria
]);

// Some providers return region codes for disputed territories
const SANCTIONED_REGIONS = new Set([
  'crimea',
  'donetsk',
  'luhansk',
]);

const CACHE_KEY = 'cf_geo_check';
const CACHE_TTL = 86400000; // 24 hours — IP/country doesn't change often

function getCachedGeo() {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedGeo(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // fail silently
  }
}

async function fetchGeoFromIpapi() {
  const response = await fetch('https://ipapi.co/json/', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`ipapi returned ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.reason || 'ipapi error');
  return {
    country: data.country_code || '',
    region: (data.region || '').toLowerCase(),
    city: data.city || '',
  };
}

async function fetchGeoFromIpApi() {
  const response = await fetch('https://ip-api.com/json/?fields=countryCode,regionName,city', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`ip-api returned ${response.status}`);
  const data = await response.json();
  return {
    country: data.countryCode || '',
    region: (data.regionName || '').toLowerCase(),
    city: data.city || '',
  };
}

function isBlockedGeo(geo) {
  if (!geo || !geo.country) return false;

  // Check country
  if (SANCTIONED_COUNTRIES.has(geo.country.toUpperCase())) {
    return true;
  }

  // Check disputed regions (Crimea, Donetsk, Luhansk — may be reported as UA)
  if (geo.region) {
    for (const sanctionedRegion of SANCTIONED_REGIONS) {
      if (geo.region.includes(sanctionedRegion)) {
        return true;
      }
    }
  }

  return false;
}

export function useGeoBlocking() {
  const [isBlocked, setIsBlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [blockedCountry, setBlockedCountry] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function checkGeo() {
      // Check cache first
      const cached = getCachedGeo();
      if (cached) {
        const blocked = isBlockedGeo(cached);
        if (!cancelled) {
          setIsBlocked(blocked);
          setBlockedCountry(blocked ? cached.country : null);
          setIsChecking(false);
        }
        return;
      }

      // Try primary API, then fallback
      let geo = null;
      try {
        geo = await fetchGeoFromIpapi();
      } catch (err) {
        console.warn('[Geo] ipapi.co failed:', err.message);
        try {
          geo = await fetchGeoFromIpApi();
        } catch (err2) {
          console.warn('[Geo] ip-api.com also failed:', err2.message);
          if (!cancelled) {
            setError('Geo lookup unavailable');
            setIsChecking(false);
          }
          return;
        }
      }

      if (geo && !cancelled) {
        setCachedGeo(geo);
        const blocked = isBlockedGeo(geo);
        setIsBlocked(blocked);
        setBlockedCountry(blocked ? geo.country : null);
        setIsChecking(false);
      }
    }

    checkGeo();
    return () => { cancelled = true; };
  }, []);

  return { isBlocked, isChecking, blockedCountry, error };
}
