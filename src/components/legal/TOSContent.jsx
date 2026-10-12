export default function TOSContent() {
  return (
    <div className="space-y-8 text-sm leading-relaxed">

      {/* Preamble */}
      <div className="space-y-4">
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">Last Updated:</span> April 6, 2026
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">Service Provider:</span> MZF Protocol Inc. (trading as "ChainFunded Labs"), a corporation organised under the laws of the Republic of Panama ("ChainFunded Labs", "we", "us", "our")
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">Governing Law:</span> Republic of Panama
        </p>
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-4">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">Notice</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            These Terms and Conditions contain important information, including a binding arbitration provision and a class action waiver, both of which impact your rights as to how disputes are resolved. By connecting your wallet to the Platform, you agree to the General Terms (Part A) and the Privacy Policy (C3). By purchasing an evaluation challenge, you additionally agree to the Evaluation Programme Terms (Part B). If you do not agree, do not access or use the Platform.
          </p>
        </div>
      </div>

      {/* PART A — GENERAL TERMS */}
      <div className="pt-4">
        <h2 className="text-lg font-bold text-foreground border-b-2 border-primary/50 pb-3">PART A — GENERAL TERMS</h2>
      </div>

      {/* 1. Introduction and Acceptance */}
      <section className="space-y-3">
        <h2 id="tos-section-1" className="text-base font-semibold text-foreground border-b border-border pb-2">1. Introduction and Acceptance</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">1.1</span> These Terms and Conditions (the "Terms") govern your access to and use of the ChainFunded platform at{" "}
          <a href="https://chainfunded.io" className="text-primary hover:underline">https://chainfunded.io</a>{" "}
          (the "Platform"), including the evaluation programme, trading terminal, funded accounts, and all related services.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">1.2</span> ChainFunded Labs is a software company that operates the Platform. We provide a software interface that enables access to the ChainFunded decentralised protocol (the "Protocol"), which is a set of autonomous smart contracts deployed on the Ethereum blockchain and governed by ChainFunded DAO (the "DAO").
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">1.3</span> By connecting your wallet to the Platform, you agree to the General Terms (Part A) and the Privacy Policy (C3). By purchasing an evaluation challenge, you additionally agree to the Evaluation Programme Terms (Part B).
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">1.4</span> These Terms constitute a legally binding agreement between you and ChainFunded Labs. If you do not agree, do not access or use the Platform.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">1.5</span> We may update these Terms from time to time. We will provide at least thirty (30) days' notice of material changes by posting the updated Terms on the Platform. Your continued use after the effective date constitutes acceptance.
        </p>
      </section>

      {/* 2. Important Structural Disclosures */}
      <section className="space-y-5">
        <h2 id="tos-section-2" className="text-base font-semibold text-foreground border-b border-border pb-2">2. Important Structural Disclosures</h2>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">2.1 What ChainFunded Labs Is</h3>
          <p className="text-muted-foreground">
            ChainFunded Labs is a software technology company incorporated in the Republic of Panama. We:
          </p>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li>Develop, operate, and maintain the Platform (a web-based software application);</li>
            <li>Provide a user interface for accessing the Protocol;</li>
            <li>Receive a software licensing fee as a percentage of gross protocol revenue for the software services we provide;</li>
            <li>Operate as an independent contractor to ChainFunded DAO under a Software License Agreement.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">2.2 What ChainFunded Labs Is Not</h3>
          <p className="text-muted-foreground">ChainFunded Labs:</p>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li><span className="font-semibold text-foreground">Does not operate, control, or manage the Protocol.</span> The Protocol is governed by ChainFunded DAO through on-chain governance. We have no authority to modify protocol parameters, challenge rules, fee structures, or payout logic;</li>
            <li><span className="font-semibold text-foreground">Does not custody, hold, transmit, or control any cryptocurrency or digital assets.</span> All USDC flows go directly from your wallet to the Protocol smart contracts and back. We never take possession of your funds at any point;</li>
            <li><span className="font-semibold text-foreground">Does not execute trades on your behalf.</span> You sign all transactions with your own wallet. We provide the interface; you authorise every action;</li>
            <li><span className="font-semibold text-foreground">Does not act as a broker, dealer, exchange, custodian, money transmitter, or financial intermediary</span> of any kind;</li>
            <li><span className="font-semibold text-foreground">Does not provide financial, investment, or trading advice.</span> Nothing on the Platform constitutes a recommendation to trade, invest, or take any financial action;</li>
            <li><span className="font-semibold text-foreground">Does not determine or process payouts.</span> Payouts are executed autonomously by the Protocol smart contracts based on ECDSA-signed performance proofs. We have no discretion over payout amounts, timing, or eligibility;</li>
            <li><span className="font-semibold text-foreground">Does not set or enforce challenge rules.</span> Challenge parameters (profit targets, drawdown limits, trading day requirements) are defined in the Protocol smart contracts and governed by the DAO;</li>
            <li><span className="font-semibold text-foreground">Is not affiliated with, controlled by, or a subsidiary of ChainFunded DAO.</span> We are an independent entity with a commercial software licensing relationship.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">2.3 The Protocol</h3>
          <p className="text-muted-foreground">
            The Protocol is a set of smart contracts deployed on the Ethereum blockchain at publicly verifiable addresses. It is governed by ChainFunded DAO under the Protocol Terms of Use (C2). By using the Platform to interact with the Protocol, you acknowledge that you are interacting with autonomous smart contract code, and that ChainFunded Labs has no ability to intervene in, modify, reverse, or override Protocol operations or transactions.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">2.4 Software Licensing Fee</h3>
          <p className="text-muted-foreground">
            ChainFunded Labs receives a software licensing fee equal to a percentage of gross protocol revenue (evaluation fees collected by the Protocol smart contracts). This fee is paid by ChainFunded DAO in fiat currency under the Software License Agreement between the entities. You do not pay any fee directly to ChainFunded Labs.
          </p>
        </div>
      </section>

      {/* 3. Eligibility */}
      <section className="space-y-3">
        <h2 id="tos-section-3" className="text-base font-semibold text-foreground border-b border-border pb-2">3. Eligibility</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">3.1</span> You must be at least eighteen (18) years of age (or the age of majority in your jurisdiction, whichever is higher) to use the Platform.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">3.2</span> You must not be:
        </p>
        <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
          <li>A resident or citizen of, or located in, any jurisdiction subject to comprehensive sanctions by the United States (OFAC), European Union, or United Nations, including but not limited to: Cuba, Iran, North Korea, Syria, Russia, and the Crimea, Donetsk, and Luhansk regions of Ukraine;</li>
          <li>Listed on the OFAC Specially Designated Nationals (SDN) list, the EU Consolidated Financial Sanctions list, the UN Security Council Consolidated list, or any equivalent sanctions list;</li>
          <li>Acting on behalf of, or for the benefit of, any person or entity described above;</li>
          <li>Located in a jurisdiction where accessing or using the Platform or Protocol would be unlawful.</li>
        </ul>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">3.3</span> You represent and warrant that you meet all eligibility requirements each time you access the Platform or interact with the Protocol.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">3.4</span> We reserve the right to restrict access from any jurisdiction at any time, with or without notice, if required by law or to comply with sanctions obligations.
        </p>
        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">3.5</span> The Protocol implements three layers of sanctions screening:
          </p>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li>Hardcoded OFAC SDN list in the smart contract;</li>
            <li>Chainalysis on-chain sanctions oracle;</li>
            <li>Chainalysis REST API verification.</li>
          </ul>
          <p className="text-muted-foreground">
            Wallet addresses that fail any layer of screening will be blocked from interacting with the Protocol.
          </p>
        </div>
      </section>

      {/* 4. Wallet Connection and Authentication */}
      <section className="space-y-3">
        <h2 id="tos-section-4" className="text-base font-semibold text-foreground border-b border-border pb-2">4. Wallet Connection and Authentication</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">4.1</span> Access to the Platform requires connecting a compatible Ethereum wallet (e.g., MetaMask, Coinbase Wallet, WalletConnect-compatible wallets).
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">4.2</span> You are solely responsible for:
        </p>
        <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
          <li>The security of your wallet, private keys, and seed phrases;</li>
          <li>All transactions signed and submitted from your connected wallet;</li>
          <li>Maintaining access to your wallet — we cannot recover lost private keys or seed phrases;</li>
          <li>Verifying that you are connected to the correct Platform URL and interacting with the correct smart contract addresses.</li>
        </ul>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">4.3</span> We do not collect or store your private keys or seed phrases at any time.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">4.4</span> Wallet connection constitutes authentication. We treat the connected wallet address as your identity on the Platform. One wallet address corresponds to one user account.
        </p>
      </section>

      {/* 5. Prohibited Conduct */}
      <section className="space-y-3">
        <h2 id="tos-section-5" className="text-base font-semibold text-foreground border-b border-border pb-2">5. Prohibited Conduct</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">5.1</span> You shall not:
        </p>
        <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
          <li>Use the Platform for any unlawful purpose or in violation of applicable law;</li>
          <li>Attempt to manipulate prices, markets, or challenge outcomes through any means;</li>
          <li>Exploit bugs, vulnerabilities, or errors in the Platform or Protocol for personal gain;</li>
          <li>Use automated scripts, bots, or tools to gain unfair advantage, unless expressly permitted by the challenge rules;</li>
          <li>Circumvent or attempt to circumvent sanctions screening, geographic restrictions, or access controls, including through the use of VPNs, proxies, or similar tools;</li>
          <li>Operate multiple wallet addresses to circumvent challenge limits, bans, or restrictions ("multi-accounting");</li>
          <li>Interfere with the Platform's operation, security, or availability, including through denial-of-service attacks, injection attacks, or unauthorised access attempts;</li>
          <li>Impersonate another person or misrepresent your identity, location, or affiliation;</li>
          <li>Use the Platform to launder money, finance terrorism, or facilitate any illegal activity;</li>
          <li>Reverse engineer, decompile, disassemble, or create derivative works from the Platform software;</li>
          <li>Copy, reproduce, or redistribute the Platform or any of its content without our prior written consent;</li>
          <li>Engage in coordinated trading strategies with other users designed to manipulate challenge outcomes (e.g., one user taking the opposite side of another's trades to guarantee one passes).</li>
        </ul>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">5.2</span> Violation of this Section may result in immediate and permanent suspension of your access to the Platform, termination of any active challenges without refund, and blocking of your wallet address from Protocol interaction.
        </p>
      </section>

      {/* 6. Intellectual Property */}
      <section className="space-y-3">
        <h2 id="tos-section-6" className="text-base font-semibold text-foreground border-b border-border pb-2">6. Intellectual Property</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">6.1</span> The Platform, including its software, source code, design, user interface, text, graphics, logos, icons, and trademarks, is the property of ChainFunded Labs or its licensors, and is protected by applicable intellectual property laws.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">6.2</span> We grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Platform for its intended purpose, subject to these Terms.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">6.3</span> You may not copy, modify, distribute, sell, lease, sublicense, or create derivative works based on the Platform without our prior written consent.
        </p>
      </section>

      {/* 7. Third-Party Services and Data */}
      <section className="space-y-3">
        <h2 id="tos-section-7" className="text-base font-semibold text-foreground border-b border-border pb-2">7. Third-Party Services and Data</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">7.1</span> The Platform integrates with third-party services including:
        </p>
        <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
          <li>Market data and price feed providers;</li>
          <li>Wallet providers (MetaMask, WalletConnect, Coinbase Wallet);</li>
          <li>Blockchain infrastructure (Ethereum RPC providers);</li>
          <li>Sanctions screening (Chainalysis).</li>
        </ul>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">7.2</span> We do not control these third-party services and are not responsible for their availability, accuracy, or performance. Your use of third-party services is subject to their own terms and conditions.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">7.3</span> Price data displayed on the Platform is sourced from third-party feeds and may be delayed, inaccurate, or unavailable. We do not guarantee the accuracy or timeliness of any price data.
        </p>
      </section>

      {/* 8. Disclaimers */}
      <section className="space-y-3">
        <h2 id="tos-section-8" className="text-base font-semibold text-foreground border-b border-border pb-2">8. Disclaimers</h2>
        <p className="text-muted-foreground text-xs leading-relaxed uppercase tracking-wide">
          8.1 The Platform is provided "as is" and "as available" without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, non-infringement, or uninterrupted availability.
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed uppercase tracking-wide">
          8.2 We do not warrant that:
        </p>
        <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground text-xs leading-relaxed uppercase tracking-wide">
          <li>The Platform will be available at all times or free from errors, bugs, or interruptions;</li>
          <li>Price data will be accurate, complete, or timely;</li>
          <li>The Protocol's smart contracts will function as intended or be free from vulnerabilities;</li>
          <li>Your use of the Platform will result in any particular trading outcome, profit, or return.</li>
        </ul>
        <p className="text-muted-foreground text-xs leading-relaxed uppercase tracking-wide">
          8.3 We are not responsible for any losses arising from:
        </p>
        <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground text-xs leading-relaxed uppercase tracking-wide">
          <li>Smart contract bugs, exploits, or vulnerabilities in the Protocol;</li>
          <li>Blockchain network congestion, failures, forks, or reorganisations;</li>
          <li>Third-party price feed errors, manipulation, or outages;</li>
          <li>Your failure to secure your wallet, private keys, or seed phrases;</li>
          <li>Regulatory actions in any jurisdiction affecting your ability to use the Platform or Protocol;</li>
          <li>Actions or decisions of ChainFunded DAO or its governance participants;</li>
          <li>USDC de-pegging, Circle blacklisting, or stablecoin-related events;</li>
          <li>Your own trading decisions and their outcomes.</li>
        </ul>
      </section>

      {/* 9. Limitation of Liability */}
      <section className="space-y-3">
        <h2 id="tos-section-9" className="text-base font-semibold text-foreground border-b border-border pb-2">9. Limitation of Liability</h2>
        <p className="text-muted-foreground text-xs leading-relaxed uppercase tracking-wide">
          9.1 To the maximum extent permitted by law, ChainFunded Labs's total aggregate liability to you for all claims arising out of or relating to these Terms or your use of the Platform shall not exceed the greater of: (a) the amount you paid directly to ChainFunded Labs (not to the Protocol smart contracts) in the twelve (12) months preceding the claim; or (b) one hundred United States dollars (USD $100).
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed uppercase tracking-wide">
          9.2 In no event shall ChainFunded Labs, its directors, officers, employees, or agents be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, loss of data, loss of goodwill, loss of cryptocurrency or digital assets, or business interruption.
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed uppercase tracking-wide">
          9.3 The limitations in this section apply regardless of the form of action, whether in contract, tort (including negligence), strict liability, or otherwise.
        </p>
      </section>

      {/* 10. Indemnification */}
      <section className="space-y-3">
        <h2 id="tos-section-10" className="text-base font-semibold text-foreground border-b border-border pb-2">10. Indemnification</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">10.1</span> You agree to indemnify, defend, and hold harmless ChainFunded Labs, its directors, officers, employees, agents, and affiliates from any claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising from:
        </p>
        <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
          <li>Your use of the Platform or interaction with the Protocol;</li>
          <li>Your violation of these Terms;</li>
          <li>Your violation of any applicable law, regulation, or third-party rights;</li>
          <li>Your trading activities and decisions;</li>
          <li>Your failure to comply with sanctions, tax, or regulatory obligations applicable to you;</li>
          <li>Any dispute between you and another user, the DAO, or any third party.</li>
        </ul>
      </section>

      {/* 11. Suspension and Termination */}
      <section className="space-y-3">
        <h2 id="tos-section-11" className="text-base font-semibold text-foreground border-b border-border pb-2">11. Suspension and Termination</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">11.1</span> We may suspend or terminate your access to the Platform immediately, without notice, if:
        </p>
        <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
          <li>You violate these Terms;</li>
          <li>We are required to do so by law, regulation, or court order;</li>
          <li>Your wallet address is flagged by sanctions screening;</li>
          <li>We reasonably believe your use of the Platform poses a security, legal, or reputational risk;</li>
          <li>We detect multi-accounting, manipulation, or other prohibited conduct.</li>
        </ul>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">11.2</span> You may cease using the Platform at any time by disconnecting your wallet.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">11.3</span> Termination of Platform access does not affect your ability to interact directly with the Protocol smart contracts (which operate independently of the Platform), but you may not use our software interface to do so.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">11.4</span> Termination does not entitle you to a refund of any evaluation fees paid to the Protocol.
        </p>
      </section>

      {/* 12. Risk Acknowledgement */}
      <section className="space-y-3">
        <h2 id="tos-section-12" className="text-base font-semibold text-foreground border-b border-border pb-2">12. Risk Acknowledgement</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">12.1</span> By using the Platform, you acknowledge that you have read and understood the Risk Disclosure Statement (C4), which is incorporated by reference into these Terms.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">12.2</span> You acknowledge and accept the risks of:
        </p>
        <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
          <li>Cryptocurrency trading, including the risk of total loss;</li>
          <li>Smart contract interaction, including the risk of code vulnerabilities;</li>
          <li>Blockchain technology, including network congestion and transaction irreversibility;</li>
          <li>Regulatory uncertainty regarding DeFi protocols and digital assets;</li>
          <li>Stablecoin risk (USDC de-pegging, issuer actions).</li>
        </ul>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">12.3</span> You confirm that you are not relying on ChainFunded Labs for financial, investment, or trading advice, and that all trading decisions are your own.
        </p>
      </section>

      {/* 13. Governing Law and Dispute Resolution */}
      <section className="space-y-5">
        <h2 id="tos-section-13" className="text-base font-semibold text-foreground border-b border-border pb-2">13. Governing Law and Dispute Resolution</h2>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">13.1 Governing Law</h3>
          <p className="text-muted-foreground">
            These Terms shall be governed by and construed in accordance with the laws of the Republic of Panama, without regard to its conflict of laws principles.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">13.2 Arbitration</h3>
          <p className="text-muted-foreground">
            Any dispute, controversy, or claim arising out of or relating to these Terms shall be resolved by binding arbitration administered by the Centro de Conciliación y Arbitraje de Panamá (CeCAP) under its applicable rules.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">13.3 Arbitration Proceedings</h3>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li>The seat of arbitration shall be Panama City, Republic of Panama;</li>
            <li>The arbitration shall be conducted in English;</li>
            <li>The tribunal shall consist of one (1) arbitrator;</li>
            <li>The award shall be final and binding and may be enforced in any court of competent jurisdiction.</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">13.4 Class Action Waiver</h3>
          <p className="text-muted-foreground text-xs leading-relaxed uppercase tracking-wide">
            You agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action. You waive any right to participate in a class action against ChainFunded Labs.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">13.5 Limitation Period</h3>
          <p className="text-muted-foreground">
            Any claim arising under these Terms must be brought within one (1) year of the event giving rise to the claim, or the claim is permanently barred.
          </p>
        </div>
      </section>

      {/* 14. Miscellaneous */}
      <section className="space-y-5">
        <h2 id="tos-section-14" className="text-base font-semibold text-foreground border-b border-border pb-2">14. Miscellaneous</h2>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">14.1 Entire Agreement</h3>
          <p className="text-muted-foreground">
            These Terms, together with the Privacy Policy (C3), Risk Disclosure Statement (C4), and Protocol Terms of Use (C2), constitute the entire agreement between you and ChainFunded Labs regarding the Platform.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">14.2 Severability</h3>
          <p className="text-muted-foreground">
            If any provision is held invalid or unenforceable, the remaining provisions continue in full effect.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">14.3 No Waiver</h3>
          <p className="text-muted-foreground">
            Our failure to enforce any provision does not waive our right to enforce it later.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">14.4 Assignment</h3>
          <p className="text-muted-foreground">
            We may assign these Terms in connection with a merger, acquisition, or corporate reorganisation. You may not assign your rights under these Terms.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">14.5 Force Majeure</h3>
          <p className="text-muted-foreground">
            We are not liable for failure to perform due to causes beyond our reasonable control, including natural disasters, war, government actions, network failures, blockchain congestion, or third-party service outages.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">14.6 Relationship</h3>
          <p className="text-muted-foreground">
            Nothing in these Terms creates a partnership, joint venture, employment, agency, or fiduciary relationship between you and ChainFunded Labs.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">14.7 Contact</h3>
          <p className="text-muted-foreground">For questions about these Terms, contact us at:</p>
          <div className="bg-secondary/30 border border-border rounded-lg p-4 space-y-1">
            <p className="text-foreground font-medium text-sm">MZF Protocol Inc. (ChainFunded Labs)</p>
            <p className="text-muted-foreground text-sm">
              Email:{" "}
              <a href="mailto:legal@chainfunded.io" className="text-primary hover:underline">legal@chainfunded.io</a>
            </p>
          </div>
        </div>
      </section>

      {/* PART B — EVALUATION PROGRAMME TERMS */}
      <div className="pt-4">
        <h2 className="text-lg font-bold text-foreground border-b-2 border-primary/50 pb-3">PART B — EVALUATION PROGRAMME TERMS</h2>
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-4">
          <p className="text-muted-foreground text-xs leading-relaxed">
            These terms apply when you purchase an evaluation challenge. By clicking "Accept Terms &amp; Purchase" (or equivalent) and submitting your challenge purchase transaction, you confirm that you have read, understood, and agree to these Evaluation Programme Terms in addition to the General Terms (Part A).
          </p>
        </div>
      </div>

      {/* 15. What You Are Purchasing */}
      <section className="space-y-3">
        <h2 id="tos-section-15" className="text-base font-semibold text-foreground border-b border-border pb-2">15. What You Are Purchasing</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">15.1 Evaluation Access.</span> When you purchase a challenge, you are purchasing access to a skills evaluation programme — the opportunity to demonstrate your trading ability against predefined performance criteria over two phases. You are paying a one-time evaluation fee for this access.
        </p>
        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">15.2 Not an Investment.</span> The evaluation fee is a fee-for-service. It is not:
          </p>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li>An investment in any fund, pool, protocol, or financial product;</li>
            <li>A deposit, margin payment, or collateral;</li>
            <li>A purchase of cryptocurrency, tokens, or any digital asset;</li>
            <li>Payment for financial advice, signals, or managed trading;</li>
            <li>A guarantee of any trading capital, funded account, or payout.</li>
          </ul>
        </div>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">15.3 No Guarantee.</span> Purchasing a challenge does not guarantee that you will pass the evaluation, receive a funded account, or earn any payout. The majority of traders do not pass evaluation challenges.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">15.4 Payment.</span> The evaluation fee is paid in USDC directly to the Protocol smart contract. ChainFunded Labs does not receive, process, hold, or transmit your payment. The transaction is between your wallet and the Protocol.
        </p>
      </section>

      {/* 16. Challenge Rules */}
      <section className="space-y-3">
        <h2 id="tos-section-16" className="text-base font-semibold text-foreground border-b border-border pb-2">16. Challenge Rules</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">16.1 Two-Phase Evaluation.</span> Each challenge consists of two sequential evaluation phases. You must meet the profit target for each phase while respecting all risk management rules to advance.
        </p>
        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">16.2 Challenge Parameters.</span> The following rules are enforced by the Protocol smart contracts. ChainFunded Labs does not set, modify, or have discretion over these rules:
          </p>
          <div className="bg-secondary/30 border border-border rounded-lg p-4 space-y-2">
            <ul className="space-y-1.5 text-muted-foreground text-sm">
              <li><span className="font-semibold text-foreground">Phase 1 profit target:</span> 10% of account size</li>
              <li><span className="font-semibold text-foreground">Phase 2 profit target:</span> 5% of account size</li>
              <li><span className="font-semibold text-foreground">Maximum daily loss:</span> 5% of account size</li>
              <li><span className="font-semibold text-foreground">Maximum total drawdown:</span> 10% of account size</li>
              <li><span className="font-semibold text-foreground">Minimum trading days per phase:</span> 4 days</li>
              <li><span className="font-semibold text-foreground">Best single day cap:</span> ≤50% of total profit</li>
              <li><span className="font-semibold text-foreground">Profit split (trader):</span> 80%</li>
              <li><span className="font-semibold text-foreground">Profit split (protocol):</span> 20%</li>
            </ul>
          </div>
        </div>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">16.3 Rule Lock.</span> Challenge rules are locked at the time of challenge creation. Rules cannot be changed retroactively for an active challenge by the DAO, ChainFunded Labs, or any other party.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">16.4 Automatic Enforcement.</span> Drawdown limits are monitored continuously. If your account breaches the maximum daily loss or maximum total drawdown limit, your challenge is automatically failed and your positions may be automatically closed by the monitoring system.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">16.5 Best Single Day Cap.</span> No single trading day's profit may constitute more than 50% of your total profit at the time of phase completion. This rule prevents pass-by-luck scenarios and ensures consistent performance.
        </p>
      </section>

      {/* 17. Challenge Tiers and Fees */}
      <section className="space-y-3">
        <h2 id="tos-section-17" className="text-base font-semibold text-foreground border-b border-border pb-2">17. Challenge Tiers and Fees</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">17.1</span> The following challenge tiers and fees are available at the time of these Terms. Tiers and fees are set by the Protocol and may be changed by DAO governance vote. Changes apply only to new challenges, not active ones.
        </p>
        <div className="bg-secondary/30 border border-border rounded-lg p-4 space-y-2">
          <ul className="space-y-1.5 text-muted-foreground text-sm">
            <li><span className="font-semibold text-foreground">$1,000 account:</span> $30 USDC</li>
            <li><span className="font-semibold text-foreground">$10,000 account:</span> $155 USDC</li>
            <li><span className="font-semibold text-foreground">$25,000 account:</span> $250 USDC</li>
            <li><span className="font-semibold text-foreground">$50,000 account:</span> $345 USDC</li>
            <li><span className="font-semibold text-foreground">$100,000 account:</span> $540 USDC</li>
            <li><span className="font-semibold text-foreground">$200,000 account:</span> $1,080 USDC</li>
          </ul>
        </div>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">17.2</span> You acknowledge that fees are paid in USDC to the Protocol smart contract and are allocated automatically per the smart contract logic.
        </p>
      </section>

      {/* 18. Fee Policy */}
      <section className="space-y-3">
        <h2 id="tos-section-18" className="text-base font-semibold text-foreground border-b border-border pb-2">18. Fee Policy</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">18.1 Non-Refundable.</span> Evaluation fees are non-refundable once the purchase transaction is confirmed on the Ethereum blockchain, except as provided in Section 18.2.
        </p>
        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">18.2 Fee Refund on First Payout.</span> If you pass both evaluation phases and claim your first funded payout, the Protocol smart contract will automatically refund your evaluation fee in full from the capital pool as part of the payout transaction. This refund is:
          </p>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li>Automatic — no request, form, or manual process required;</li>
            <li>Enforced by smart contract code — not a discretionary policy;</li>
            <li>One-time — applies only to your first payout on the challenge;</li>
            <li>Subject to capital pool liquidity.</li>
          </ul>
        </div>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">18.3 Failed Challenges.</span> If you fail a challenge (by breaching drawdown limits, failing to meet profit targets within the evaluation period, or through prohibited conduct), the evaluation fee is not refunded. The fee is retained by the Protocol and allocated per the smart contract fee structure.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">18.4 No Chargebacks.</span> Blockchain transactions are irreversible. You acknowledge that you cannot reverse, charge back, or dispute an on-chain USDC payment to the Protocol smart contract through ChainFunded Labs or any third party.
        </p>
      </section>

      {/* 19. Funded Accounts */}
      <section className="space-y-3">
        <h2 id="tos-section-19" className="text-base font-semibold text-foreground border-b border-border pb-2">19. Funded Accounts</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">19.1 Funded Account Access.</span> Upon passing both Phase 1 and Phase 2, you receive access to a funded trading account within the Protocol. "Funded" means you may trade with Protocol capital and receive a share of trading profits.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">19.2 Not Your Capital.</span> The funded account balance represents Protocol capital, not your personal funds. You do not own, deposit, or have a claim to the underlying capital. Your entitlement is limited to your profit split (80%) on net trading profits.
        </p>
        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">19.3 Ongoing Rules.</span> Funded accounts remain subject to:
          </p>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li>Maximum daily loss limit (5% of account size);</li>
            <li>Maximum total drawdown limit (10% of account size);</li>
            <li>All prohibited conduct rules in Section 5;</li>
            <li>Any additional funded account rules defined in the Protocol smart contracts.</li>
          </ul>
        </div>
        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">19.4 Funded Account Termination.</span> Your funded account is terminated automatically if:
          </p>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li>You breach the maximum daily loss or total drawdown limit;</li>
            <li>You engage in prohibited conduct (Section 5);</li>
            <li>Your wallet address is flagged by sanctions screening.</li>
          </ul>
        </div>
        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">19.5 Emergency Pause.</span> If the Protocol is paused by the DAO's Guardian multi-sig for emergency reasons, your funded account is suspended — not terminated. During an emergency pause:
          </p>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li>All open positions are frozen at their current state;</li>
            <li>No new trades can be placed;</li>
            <li>Drawdown monitoring is paused;</li>
            <li>Upon protocol resumption, your funded account resumes from its pre-pause state with all positions and progress intact.</li>
          </ul>
        </div>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">19.6 No Employment.</span> Having a funded account does not create an employment, contractor, agency, or partnership relationship between you and ChainFunded Labs or ChainFunded DAO. You are an independent participant in a decentralised protocol.
        </p>
      </section>

      {/* 20. Payouts */}
      <section className="space-y-3">
        <h2 id="tos-section-20" className="text-base font-semibold text-foreground border-b border-border pb-2">20. Payouts</h2>
        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">20.1 Payout Mechanism.</span> When you generate net trading profits on a funded account:
          </p>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li>The Protocol backend generates an ECDSA-signed proof of your performance;</li>
            <li>You submit this proof to the Protocol smart contract;</li>
            <li>The smart contract verifies the signature and executes the USDC payout directly to your wallet;</li>
            <li>The Protocol retains 20% of net profits; you receive 80%.</li>
          </ul>
        </div>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">20.2 Automatic and Non-Discretionary.</span> Payouts are executed by smart contract code. Neither ChainFunded Labs nor the DAO has discretion to approve, deny, delay, or modify payouts. If the ECDSA proof is valid and the smart contract conditions are met, the payout executes.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">20.3 Payout Availability.</span> Payouts are subject to available liquidity in the Protocol's capital pool. In rare circumstances, payouts may be delayed if the capital pool has insufficient idle USDC.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">20.4 Tax Responsibility.</span> You are solely responsible for all tax obligations arising from payouts received, including income tax, capital gains tax, VAT/GST, and any other applicable taxes in your jurisdiction. ChainFunded Labs does not provide tax advice, withhold taxes, or issue tax forms.
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">20.5 On-Chain Finality.</span> Payout transactions are final and irreversible once confirmed on the Ethereum blockchain.
        </p>
      </section>

      {/* 21. Acceptance Flow — Challenge Purchase */}
      <section className="space-y-3">
        <h2 id="tos-section-21" className="text-base font-semibold text-foreground border-b border-border pb-2">21. Acceptance Flow — Challenge Purchase</h2>
        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">21.1</span> Before completing an evaluation challenge purchase, you will be presented with these Terms (or a summary with a link to the full text) and must affirmatively accept by:
          </p>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li>Checking a box confirming: "I have read and agree to the ChainFunded Terms and Conditions, including the Evaluation Programme Terms, Privacy Policy, and Risk Disclosure Statement";</li>
            <li>Clicking the "Accept Terms &amp; Purchase" button (or equivalent);</li>
            <li>Signing and submitting the USDC payment transaction from your wallet.</li>
          </ul>
        </div>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">21.2</span> Your acceptance is recorded and linked to your wallet address and the challenge creation transaction hash.
        </p>
        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">21.3 User Attestation.</span> As part of the acceptance flow, you attest and confirm that:
          </p>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li>You are at least 18 years old (or the age of majority in your jurisdiction);</li>
            <li>You are not located in, a citizen of, or a resident of any sanctioned jurisdiction listed in Section 3.2;</li>
            <li>You are not on any sanctions list referenced in Section 3.2;</li>
            <li>You are not using a VPN, proxy, or other tool to circumvent geographic restrictions;</li>
            <li>You are the sole owner and controller of the connected wallet;</li>
            <li>You understand that the evaluation fee is non-refundable (except for the automatic fee refund on first funded payout);</li>
            <li>You understand the risks of cryptocurrency trading and smart contract interaction;</li>
            <li>You are not relying on ChainFunded Labs for financial or trading advice;</li>
            <li>All funds used to pay the evaluation fee are lawfully obtained and not the proceeds of criminal activity;</li>
            <li>You accept sole responsibility for your trading decisions and their outcomes.</li>
          </ul>
        </div>
      </section>

      {/* 22. CFG Governance Token and Reward Programme */}
      <section className="space-y-3">
        <h2 id="tos-section-22" className="text-base font-semibold text-foreground border-b border-border pb-2">22. CFG Governance Token and Reward Programme</h2>

        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">22.1 Nature of CFG Token.</span> The CFG token is a <strong>governance token</strong> that enables holders to participate in ChainFunded DAO governance (voting on proposals, protocol parameters, and treasury allocation). CFG is <strong>not</strong> a security, investment contract, share, equity, bond, derivative, or any form of financial instrument.
          </p>
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">22.2 No Financial Value Guarantee.</span> CFG tokens carry no guarantee of financial value, return, or appreciation. ChainFunded Labs does not operate any market, exchange, or liquidity pool for CFG tokens. There is no commitment to buy back, redeem, or repurchase CFG tokens at any price.
          </p>
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">22.3 Trading Rewards (CFGDistributor).</span> Challenge account purchasers may earn CFG tokens through a season-based reward programme:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
            <li>The programme distributes a fixed allocation of CFG tokens across ten sequential seasons, each lasting approximately six months;</li>
            <li>Points are earned proportionally to challenge account size. Phase 2 accounts earn a higher multiplier than Phase 1. Whitelisted (free) accounts earn a lower multiplier than paid accounts;</li>
            <li>After each season ends, participants may claim their pro-rata share of that season's CFG budget;</li>
            <li>All registrations are verified on-chain against the ChainFundedPool smart contract;</li>
            <li>Season budgets follow a front-loaded decay schedule and cannot be modified after creation;</li>
            <li>Earning CFG through trading rewards is not guaranteed. The amount received depends on total participation in each season.</li>
          </ul>
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">22.4 LP Staking Rewards (CFGLPRewards).</span> Liquidity providers may earn CFG tokens by actively staking CFND tokens:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
            <li>Staking is an <strong>active opt-in</strong>. Passive CFND holders do not earn CFG rewards;</li>
            <li>CFG is emitted continuously per second to stakers in proportion to their staked balance;</li>
            <li>Stakers continue to earn USDC pool profit on their staked CFND via a proxy harvest mechanism;</li>
            <li>There is no lock-up period. Stakers may unstake at any time;</li>
            <li>The programme distributes a fixed allocation across ten seasons with a front-loaded decay schedule;</li>
            <li>Earning CFG through staking is not guaranteed. The amount received depends on total staked participation.</li>
          </ul>
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">22.5 Governance Participation.</span> CFG token holders who have delegated their voting power (including self-delegation) may create governance proposals (subject to the proposal threshold), vote on governance proposals, and execute passed proposals through the TimelockController.
          </p>
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">22.6 No Advisory Relationship.</span> The distribution of CFG tokens does not constitute financial advice, an investment recommendation, or a solicitation. ChainFunded Labs does not advise on the acquisition, holding, or disposal of CFG tokens.
          </p>
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">22.7 Regulatory Risk.</span> The regulatory status of governance tokens varies by jurisdiction and may change. You are solely responsible for determining whether acquiring, holding, or using CFG tokens is lawful in your jurisdiction.
          </p>
        </div>
      </section>

      {/* PART C — ACCEPTANCE RECORD AND CONSENT MANAGEMENT */}
      <div className="pt-4">
        <h2 className="text-lg font-bold text-foreground border-b-2 border-primary/50 pb-3">PART C — ACCEPTANCE RECORD AND CONSENT MANAGEMENT</h2>
      </div>

      {/* 23. Consent Architecture */}
      <section className="space-y-5">
        <h2 id="tos-section-23" className="text-base font-semibold text-foreground border-b border-border pb-2">23. Consent Architecture</h2>

        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">23.1</span> The Platform implements a layered consent flow:
          </p>
          <div className="space-y-3">
            <div className="bg-secondary/30 border border-border rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">First Wallet Connection</p>
              <p className="text-muted-foreground text-xs"><span className="font-semibold text-foreground">Terms Presented:</span> Part A (General Terms) + Privacy Policy (C3) + Risk Disclosure (C4)</p>
              <p className="text-muted-foreground text-xs"><span className="font-semibold text-foreground">Acceptance Method:</span> Checkbox + "Accept &amp; Connect" button</p>
            </div>
            <div className="bg-secondary/30 border border-border rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">Challenge Purchase</p>
              <p className="text-muted-foreground text-xs"><span className="font-semibold text-foreground">Terms Presented:</span> Part B (Evaluation Programme Terms) — full text or summary</p>
              <p className="text-muted-foreground text-xs"><span className="font-semibold text-foreground">Acceptance Method:</span> Checkbox + "Accept Terms &amp; Purchase" button + wallet transaction signature</p>
            </div>
            <div className="bg-secondary/30 border border-border rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">Terms Update (Material Change)</p>
              <p className="text-muted-foreground text-xs"><span className="font-semibold text-foreground">Terms Presented:</span> Updated sections highlighted</p>
              <p className="text-muted-foreground text-xs"><span className="font-semibold text-foreground">Acceptance Method:</span> Re-acceptance required before next Platform use</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">23.2 Record Keeping.</span> For each acceptance event, the Platform records:
          </p>
          <ul className="space-y-1.5 pl-5 list-disc text-muted-foreground">
            <li>The wallet address;</li>
            <li>The version of the Terms accepted;</li>
            <li>The timestamp of acceptance;</li>
            <li>The IP address at the time of acceptance (for compliance purposes);</li>
            <li>The relevant transaction hash (for challenge purchases).</li>
          </ul>
        </div>

        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">23.3 Re-Acceptance.</span> If we materially update these Terms, users who previously accepted an earlier version will be required to review and accept the updated Terms before continuing to use the Platform. Active challenges and funded accounts are not interrupted, but the user must accept the updated Terms before taking any new action (purchasing a new challenge, placing a new trade, or claiming a payout).
        </p>
      </section>

      {/* Footer */}
      <div className="pt-4 border-t border-border">
        <p className="text-muted-foreground text-xs italic">
          ChainFunded Labs — Republic of Panama
        </p>
        <p className="text-muted-foreground text-xs italic">
          Last Updated: April 6, 2026
        </p>
      </div>

    </div>
  );
}
