# Support Centre: UI Reference

The Support Centre is a single page at `/Support` that consolidates the FAQ, How-To Guides, Terms of Service, and Privacy Policy under four tabs. This article describes each tab and how to navigate directly to any of them.

---

## Accessing the Support Centre

Select **Support** in the navigation bar, or go to `/Support` directly.

![The Support Centre page showing the "Support & Legal" heading, the four-tab selector (FAQ, How-To Guides, Terms of Service, Privacy Policy), and the FAQ tab active with the category sidebar and accordion.](/screenshots/gs-08-01_support-full.png)

---

## The four tabs

### FAQ tab (default)

The FAQ tab is active by default at `/Support`. It contains the same 7-category accordion as the standalone `/FAQ` page:

| Category | Questions |
|----------|----------|
| Getting Started | 5 |
| The Challenge | 6 |
| Trading Rules | 6 |
| Funded Account | 4 |
| Payouts & Withdrawals | 5 |
| LP Pool | 5 |
| Technical | 5 |

**Layout:** A sidebar on the left lists the categories. Selecting a category loads its questions into the accordion panel on the right. Selecting a question expands it inline. Only one question is open at a time.

A **Start Challenge** CTA appears at the bottom of the sidebar.

![The FAQ tab with "The Challenge" category selected in the sidebar. The accordion panel shows 6 questions, with one question expanded showing its answer.](/screenshots/gs-08-02_faq-tab.png)

---

### How-To Guides tab

Select **How-To Guides** in the tab bar, or navigate to `/Support?tab=guides`.

Displays a categorised index of 39 step-by-step guides covering every feature on the platform. Guides are grouped into eight categories:

| Category | Guides |
|----------|--------|
| Getting Started | 7 |
| Challenges | 7 |
| Trading | 6 |
| Payouts | 3 |
| LP Pool | 5 |
| Affiliate | 3 |
| Security | 3 |
| Common Questions | 5 |

Each card shows the guide title and a short description. Selecting a card opens the full guide.

![The How-To Guides tab active. Eight category sections visible, each showing a 2-column grid of guide cards. The "Challenges" category has seven cards visible.](/screenshots/gs-08-05_guides-tab.png)

---

### Terms of Service tab

Select **Terms of Service** in the tab bar, or navigate to `/Support?tab=tos`.

Displays the full Terms of Service document in a scrollable card. The document was last modified March 24, 2026.

![The Terms of Service tab active. Full-width card containing the TOS document with the "Terms of Service" heading and last-modified date visible.](/screenshots/gs-08-03_tos-tab.png)

---

### Privacy Policy tab

Select **Privacy Policy** in the tab bar, or navigate to `/Support?tab=privacy`.

Displays the full Privacy Policy document in a scrollable card. The document was last modified March 24, 2026.

![The Privacy Policy tab active. Full-width card containing the privacy document with heading and last-modified date.](/screenshots/gs-08-04_privacy-tab.png)

---

## Deep-linking to a specific tab

The active tab is controlled by the `tab` URL parameter:

| URL | Opens |
|-----|-------|
| `/Support` | FAQ tab (default) |
| `/Support?tab=faq` | FAQ tab |
| `/Support?tab=guides` | How-To Guides tab |
| `/Support?tab=tos` | Terms of Service tab |
| `/Support?tab=privacy` | Privacy Policy tab |

You can share or bookmark a direct link to any tab using these URLs.

---

## Related guides

- [Common Scams and How to Avoid Them →](../security/02-scams-and-safety.md)
- [Smart Contract Transparency →](../security/03-smart-contract-transparency.md)
