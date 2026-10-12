/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AdminDashboard from './pages/AdminDashboard';
import AffiliateDashboard from './pages/AffiliateDashboard';
import FAQ from './pages/FAQ';
import LPDashboard from './pages/LPDashboard';
import MyAccount from './pages/MyAccount';
import Onboarding from './pages/Onboarding';
import Claim from './pages/Claim';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Support from './pages/Support';
import TermsOfService from './pages/TermsOfService';
import TraderDashboard from './pages/TraderDashboard';
import TradingTerminal from './pages/TradingTerminal';
import Wallet from './pages/Wallet';
import Legal from './pages/Legal';
import CfgRewards from './pages/CfgRewards';
import AgreementSign from './pages/AgreementSign';
import Landing from './pages/Landing';
import Community from './pages/Community';
import Whitepaper from './pages/Whitepaper';
import Proof from './pages/Proof';
import ContractExplorer from './pages/ContractExplorer';
import ZoneTrades from './pages/ZoneTrades';
import Reviews from './pages/Reviews';
import Presale from './pages/Presale';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminDashboard": AdminDashboard,
    "AffiliateDashboard": AffiliateDashboard,
    "FAQ": FAQ,
    "LPDashboard": LPDashboard,
    "MyAccount": MyAccount,
    "Onboarding": Onboarding,
    "Claim": Claim,
    "PrivacyPolicy": PrivacyPolicy,
    "privacy-policy": PrivacyPolicy,
    "Support": Support,
    "TermsOfService": TermsOfService,
    "terms-of-service": TermsOfService,
    "TraderDashboard": TraderDashboard,
    "TradingTerminal": TradingTerminal,
    "Wallet": Wallet,
    "wallet": Wallet,
    "Legal": Legal,
    "legal": Legal,
    "CfgRewards": CfgRewards,
    "cfg-rewards": CfgRewards,
    "AgreementSign": AgreementSign,
    "agreement-sign": AgreementSign,
    "Landing": Landing,
    "Reviews": Reviews,
    "Community": Community,
    "community": Community,
    "Whitepaper": Whitepaper,
    "whitepaper": Whitepaper,
    "Proof": Proof,
    "proof": Proof,
    "ContractExplorer": ContractExplorer,
    "contract-explorer": ContractExplorer,
    "ZoneTrades": ZoneTrades,
    "zone-trades": ZoneTrades,
    "TurboTrades": ZoneTrades,    // legacy alias — old bookmarks + notification links
    "turbo-trades": ZoneTrades,   // legacy alias
    "Presale": Presale,
    "presale": Presale,
}

export const pagesConfig = {
    mainPage: "Landing",
    Pages: PAGES,
    Layout: __Layout,
};