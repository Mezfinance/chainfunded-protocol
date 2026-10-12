import React from 'react';

/**
 * Full-screen block shown when a connected wallet is flagged by OFAC screening.
 * Mirrors the Uniswap Labs approach — the frontend blocks access, the protocol
 * remains permissionless.
 */
export default function SanctionedAddressBlock() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-lg text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>

        <h1 className="font-grotesk font-bold text-2xl text-foreground">
          Access Restricted
        </h1>

        <p className="text-muted-foreground text-sm leading-relaxed">
          This wallet address has been identified as associated with a sanctioned
          entity on the OFAC Specially Designated Nationals (SDN) list. In
          compliance with applicable sanctions regulations, this interface cannot
          provide services to this address.
        </p>

        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            This restriction applies to the ChainFunded interface only. The
            ChainFunded Protocol is comprised of self-executing smart contracts
            deployed on public blockchains and operates independently of this
            interface. ChainFunded does not control the Protocol.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          If you believe this is an error, contact{' '}
          <a
            href="mailto:legal@chainfunded.io"
            className="text-primary hover:underline"
          >
            legal@chainfunded.io
          </a>
        </p>
      </div>
    </div>
  );
}
