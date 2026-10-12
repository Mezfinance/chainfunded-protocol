import React from 'react';

const COUNTRY_NAMES = {
  CU: 'Cuba',
  IR: 'Iran',
  KP: 'North Korea',
  SY: 'Syria',
  RU: 'Russia',
  BY: 'Belarus',
};

/**
 * Full-screen block shown when a user accesses the interface from
 * a sanctioned jurisdiction. Shows clear reasoning and legal basis.
 */
export default function GeoBlockedScreen({ countryCode }) {
  const countryName = COUNTRY_NAMES[countryCode] || countryCode || 'a restricted jurisdiction';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-lg text-center space-y-6">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="font-grotesk font-bold text-2xl text-foreground">
          Service Unavailable in Your Region
        </h1>

        {/* Primary explanation */}
        <p className="text-muted-foreground text-sm leading-relaxed">
          The ChainFunded interface is not available in{' '}
          <span className="text-foreground font-semibold">{countryName}</span>.
        </p>

        {/* Reason box */}
        <div className="bg-secondary/50 border border-border rounded-lg p-5 text-left space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Why am I seeing this?</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            ChainFunded complies with international sanctions programmes administered by
            the United States Office of Foreign Assets Control (OFAC), the United Nations
            Security Council, and the European Union. Access to this interface is restricted
            for users in jurisdictions subject to comprehensive economic or trade sanctions.
          </p>

          <h2 className="text-sm font-semibold text-foreground">Restricted jurisdictions</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Cuba, Iran, North Korea, Syria, Russia, Belarus, and the Crimea, Donetsk,
            and Luhansk regions — as specified in our{' '}
            <span className="text-primary">Terms of Service, Section 1 (Eligibility)</span>.
          </p>
        </div>

        {/* Protocol disclaimer */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            This restriction applies to the ChainFunded interface only. The ChainFunded
            Protocol consists of self-executing smart contracts deployed on public blockchains
            and operates independently of this interface. ChainFunded does not control the Protocol.
          </p>
        </div>

        {/* Contact */}
        <p className="text-xs text-muted-foreground">
          If you believe this is an error, contact{' '}
          <a href="mailto:legal@chainfunded.io" className="text-primary hover:underline">
            legal@chainfunded.io
          </a>
        </p>
      </div>
    </div>
  );
}
