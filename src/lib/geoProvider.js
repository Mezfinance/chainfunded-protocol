// Detects the user's country via a lightweight IP geolocation call and maps
// it to the best starting index in the provider chain:
//
//   0 = Binance.com   (most of world)
//   1 = Binance.US    (United States)
//   2 = Tokocrypto    (Indonesia)
//   3 = OKX           (India, UK, broader Asia)
//   4 = Bybit         (catch-all)
//
// The result is cached in memory after the first call so every hook/component
// shares the same detected country without extra network requests.

const COUNTRY_START_IDX = {
  US: 1,
  ID: 2,  // Indonesia — Tokocrypto first
  IN: 3,
  GB: 3,
  SG: 3,
  MY: 3,

  // Africa — Bybit has broadest coverage; Binance & OKX restricted in many
  DZ: 4, // Algeria
  AO: 4, // Angola
  BJ: 4, // Benin
  BW: 4, // Botswana
  BF: 4, // Burkina Faso
  BI: 4, // Burundi
  CV: 4, // Cabo Verde
  CM: 4, // Cameroon
  CF: 4, // Central African Republic
  TD: 4, // Chad
  KM: 4, // Comoros
  CG: 4, // Congo (Republic)
  CD: 4, // Congo (DR)
  CI: 4, // Cote d'Ivoire
  DJ: 4, // Djibouti
  EG: 4, // Egypt
  GQ: 4, // Equatorial Guinea
  ER: 4, // Eritrea
  SZ: 4, // Eswatini
  ET: 4, // Ethiopia
  GA: 4, // Gabon
  GM: 4, // Gambia
  GH: 4, // Ghana
  GN: 4, // Guinea
  GW: 4, // Guinea-Bissau
  KE: 4, // Kenya
  LS: 4, // Lesotho
  LR: 4, // Liberia
  LY: 4, // Libya
  MG: 4, // Madagascar
  MW: 4, // Malawi
  ML: 4, // Mali
  MR: 4, // Mauritania
  MU: 4, // Mauritius
  MA: 4, // Morocco
  MZ: 4, // Mozambique
  NA: 4, // Namibia
  NE: 4, // Niger
  NG: 0, // Nigeria — Bybit too slow on local networks; Binance.com connects
  RW: 4, // Rwanda
  ST: 4, // Sao Tome and Principe
  SN: 4, // Senegal
  SC: 4, // Seychelles
  SL: 4, // Sierra Leone
  SO: 4, // Somalia
  ZA: 4, // South Africa
  SS: 4, // South Sudan
  SD: 4, // Sudan
  TZ: 4, // Tanzania
  TG: 4, // Togo
  TN: 4, // Tunisia
  UG: 4, // Uganda
  ZM: 4, // Zambia
  ZW: 4, // Zimbabwe

  // Asia — Bybit for most; OKX for China/HK/Macau/Uzbekistan where Bybit is restricted
  // (Already mapped: ID → 2 Tokocrypto, IN/SG/MY → 3 OKX)
  // East Asia
  CN: 3, // China — Bybit restricted; OKX public API accessible
  HK: 3, // Hong Kong — Bybit restricted
  MO: 3, // Macau — follows China policy
  JP: 4, // Japan
  KR: 4, // South Korea
  KP: 4, // North Korea (sanctioned — geo-blocked before this runs)
  MN: 4, // Mongolia
  TW: 4, // Taiwan
  // Southeast Asia
  BN: 4, // Brunei
  KH: 4, // Cambodia
  LA: 4, // Laos
  MM: 4, // Myanmar
  PH: 4, // Philippines
  TH: 4, // Thailand
  TL: 4, // Timor-Leste
  VN: 4, // Vietnam
  // South Asia
  AF: 4, // Afghanistan (sanctioned — geo-blocked before this runs)
  BD: 4, // Bangladesh
  BT: 4, // Bhutan
  LK: 4, // Sri Lanka
  MV: 4, // Maldives
  NP: 4, // Nepal
  PK: 4, // Pakistan
  // Central Asia
  KG: 4, // Kyrgyzstan
  KZ: 4, // Kazakhstan
  TJ: 4, // Tajikistan
  TM: 4, // Turkmenistan
  UZ: 3, // Uzbekistan — Bybit restricted; use OKX
  // West Asia / Middle East
  AE: 4, // UAE
  AM: 4, // Armenia
  AZ: 4, // Azerbaijan
  BH: 4, // Bahrain
  CY: 4, // Cyprus
  GE: 4, // Georgia
  IL: 4, // Israel
  IQ: 4, // Iraq
  IR: 4, // Iran (sanctioned — geo-blocked before this runs)
  JO: 4, // Jordan
  KW: 4, // Kuwait
  LB: 4, // Lebanon
  OM: 4, // Oman
  PS: 4, // Palestine
  QA: 4, // Qatar
  SA: 4, // Saudi Arabia
  SY: 4, // Syria (sanctioned — geo-blocked before this runs)
  TR: 4, // Turkey
  YE: 4, // Yemen

  // Europe — Bybit EU MiCA-licensed across EEA; public WS works continent-wide
  // (Already mapped: GB → 3 OKX; RU/BY sanctioned)
  // Western Europe
  AT: 4, // Austria
  BE: 4, // Belgium
  CH: 4, // Switzerland
  DE: 4, // Germany
  FR: 4, // France
  LI: 4, // Liechtenstein
  LU: 4, // Luxembourg
  MC: 4, // Monaco
  NL: 4, // Netherlands
  // Northern Europe
  DK: 4, // Denmark
  EE: 4, // Estonia
  FI: 4, // Finland
  IE: 4, // Ireland
  IS: 4, // Iceland
  LT: 4, // Lithuania
  LV: 4, // Latvia
  NO: 4, // Norway
  SE: 4, // Sweden
  // Southern Europe
  AD: 4, // Andorra
  AL: 4, // Albania
  BA: 4, // Bosnia and Herzegovina
  ES: 4, // Spain
  GR: 4, // Greece
  HR: 4, // Croatia
  IT: 4, // Italy
  ME: 4, // Montenegro
  MK: 4, // North Macedonia
  MT: 4, // Malta
  PT: 4, // Portugal
  RS: 4, // Serbia
  SI: 4, // Slovenia
  SM: 4, // San Marino
  XK: 4, // Kosovo
  // Eastern Europe
  BG: 4, // Bulgaria
  BY: 4, // Belarus (sanctioned — geo-blocked before this runs)
  CZ: 4, // Czech Republic
  HU: 4, // Hungary
  MD: 4, // Moldova
  PL: 4, // Poland
  RO: 4, // Romania
  RU: 4, // Russia (sanctioned — geo-blocked before this runs)
  SK: 4, // Slovakia
  UA: 4, // Ukraine

  // Americas — Bybit for most; OKX for Canada where Bybit + Binance restricted
  // (Already mapped: US → 1 Binance.US; CU sanctioned)
  // North America
  CA: 3, // Canada — Bybit + Binance both exited; OKX best option
  MX: 4, // Mexico
  // Central America
  BZ: 4, // Belize
  CR: 4, // Costa Rica
  GT: 4, // Guatemala
  HN: 4, // Honduras
  NI: 4, // Nicaragua
  PA: 4, // Panama
  SV: 4, // El Salvador
  // Caribbean
  AG: 4, // Antigua and Barbuda
  BB: 4, // Barbados
  BS: 4, // Bahamas
  CU: 4, // Cuba (sanctioned — geo-blocked before this runs)
  DM: 4, // Dominica
  DO: 4, // Dominican Republic
  GD: 4, // Grenada
  HT: 4, // Haiti
  JM: 4, // Jamaica
  KN: 4, // Saint Kitts and Nevis
  LC: 4, // Saint Lucia
  TT: 4, // Trinidad and Tobago
  VC: 4, // Saint Vincent and the Grenadines
  // South America
  AR: 4, // Argentina
  BO: 4, // Bolivia
  BR: 4, // Brazil
  CL: 4, // Chile
  CO: 4, // Colombia
  EC: 4, // Ecuador
  GY: 4, // Guyana
  PE: 4, // Peru
  PY: 4, // Paraguay
  SR: 4, // Suriname
  UY: 4, // Uruguay
  VE: 4, // Venezuela

  // Oceania — Binance.com optimal for AU/NZ/PNG (AUSTRAC registered, APAC infra)
  // Bybit for smaller Pacific Islands as reliable global fallback
  AU: 0, // Australia
  NZ: 0, // New Zealand
  PG: 0, // Papua New Guinea
  FJ: 4, // Fiji
  FM: 4, // Micronesia
  KI: 4, // Kiribati
  MH: 4, // Marshall Islands
  NR: 4, // Nauru
  PW: 4, // Palau
  SB: 4, // Solomon Islands
  TO: 4, // Tonga
  TV: 4, // Tuvalu
  VU: 4, // Vanuatu
  WS: 4, // Samoa
};

let cached = null;
let pending = null;

async function detectCountry() {
  // Try ipapi.co first (returns plain 2-letter country code)
  try {
    const r = await fetch("https://ipapi.co/country/", {
      signal: AbortSignal.timeout(1500),
    });
    const text = (await r.text()).trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(text)) return text;
  } catch { /* try fallback */ }

  // Fallback: ip-api.com (returns JSON with countryCode field)
  try {
    const r = await fetch("https://ip-api.com/json/?fields=countryCode", {
      signal: AbortSignal.timeout(1500),
    });
    const json = await r.json();
    const code = (json.countryCode || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) return code;
  } catch { /* give up */ }

  return null;
}

export function getStartProviderIdx() {
  if (cached !== null) return Promise.resolve(cached);

  if (!pending) {
    pending = detectCountry()
      .then((country) => {
        cached = country ? (COUNTRY_START_IDX[country] ?? 0) : 0;
        return cached;
      })
      .catch(() => {
        cached = 0;
        return 0;
      });
  }

  return pending;
}
