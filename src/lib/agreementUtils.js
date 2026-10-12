import affiliateAgreementMd from "../../docs/legal-agreements/C7-affiliate-commission-agreement.md?raw";
import sideLetterMd         from "../../docs/legal-agreements/C7-SL1-token-allocation-side-letter.md?raw";

// Keep AGREEMENT_TEMPLATES for any code that still uses it directly
export const AGREEMENT_TEMPLATES = {
  "C7":     affiliateAgreementMd,
  "C7-1":   affiliateAgreementMd,
  "C7-SL1": sideLetterMd,
};

// Bundles define which documents render together for a given ref
export const AGREEMENT_BUNDLES = {
  "C7":     [{ label: "Affiliate Commission Agreement",       template: affiliateAgreementMd }],
  "C7-1":   [
    { label: "Affiliate Commission Agreement (C7-1)",         template: affiliateAgreementMd },
    { label: "Token Allocation Side Letter (C7-SL1)",         template: sideLetterMd },
  ],
  "C7-SL1": [{ label: "Token Allocation Side Letter (C7-SL1)", template: sideLetterMd }],
};

export function bpsToPercent(bps) {
  return (Number(bps) / 100).toFixed(2);
}

export function substituteTemplate(text, vars) {
  return Object.entries(vars).reduce(
    (str, [key, val]) => str.replaceAll(`{{${key}}}`, val ?? ""),
    text
  );
}

export function renderBundle(params) {
  const docs = AGREEMENT_BUNDLES[params.agreementRef] || [];
  return docs.map(({ label, template }) => ({
    label,
    rendered: renderAgreement({ ...params, template }),
  }));
}

export function renderAgreement({ template, affiliate, affiliateName, affiliateAddr, rateBps, agreementRef }) {
  return substituteTemplate(template, {
    AFFILIATE_NAME:       affiliateName || affiliate,
    AFFILIATE_NAME_UPPER: (affiliateName || affiliate).toUpperCase(),
    AFFILIATE_ADDRESS:    affiliateAddr  || "",
    AFFILIATE_WALLET:     affiliate,
    RATE_PCT:             bpsToPercent(rateBps),
    RATE_BPS:             rateBps.toString(),
    AGREEMENT_REF:        agreementRef,
    DATE:                 new Date().toISOString().split("T")[0],
  });
}

export function buildAffiliateSigningMessage({ affiliate, rateBps, agreementRef, routerAddress, chainId }) {
  const pct  = bpsToPercent(rateBps);
  const date = new Date().toISOString().split("T")[0];
  return [
    "ChainFunded Revenue Share Agreement",
    `Reference: ${agreementRef}`,
    `Affiliate Wallet: ${affiliate}`,
    `Revenue Share Rate: ${rateBps} BPS (${pct}%)`,
    `Router Contract: ${routerAddress}`,
    `Chain ID: ${chainId}`,
    `Date: ${date}`,
    "",
    "By signing this message I confirm that I have read and agree to the terms",
    "of the ChainFunded Affiliate Commission Agreement and associated Revenue",
    "Share Side Letter referenced above. This signature constitutes my",
    "cryptographic consent to those terms.",
  ].join("\n");
}

export function buildSignedDocument(renderedMarkdown, { affiliateSig, safeTx }) {
  const lines = [renderedMarkdown.trimEnd(), "", "---", "", "## CRYPTOGRAPHIC SIGNATURES", ""];

  if (safeTx) {
    const etherscanBase = safeTx.chainId === "1"
      ? "https://etherscan.io"
      : "https://sepolia.etherscan.io";
    lines.push(
      "### Company Execution (MZF-Protocol Inc.)",
      "",
      "**Method:** Gnosis Safe on-chain transaction (`setRevenueShare`)  ",
      `**Transaction hash:** \`${safeTx.txHash}\`  `,
      `**Router contract:** \`${safeTx.routerAddress}\`  `,
      `**Network:** Chain ID ${safeTx.chainId}  `,
      `**Verify:** ${etherscanBase}/tx/${safeTx.txHash}`,
      "",
      "The execution of `setRevenueShare()` via the MZF-Protocol Inc. Gnosis Safe",
      "constitutes cryptographic proof of the Company's consent to the terms of",
      "this agreement. The rate and agreement reference are publicly verifiable",
      "on-chain at the router contract address above.",
      "",
    );
  }

  if (affiliateSig) {
    const date = new Date(affiliateSig.ts).toUTCString();
    lines.push(
      "### Affiliate Signature",
      "",
      `**Signer wallet:** \`${affiliateSig.signer}\`  `,
      `**Signed at:** ${date}  `,
      "",
      "**Signing message:**",
      "```",
      affiliateSig.message,
      "```",
      "",
      "**Signature (EIP-191 personal\\_sign):**",
      "```",
      affiliateSig.signature,
      "```",
      "",
    );
  }

  lines.push("*The on-chain transaction and EIP-191 signature above constitute cryptographic consent to this agreement.*");
  return lines.join("\n");
}
