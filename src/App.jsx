import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import SettlementField from "@/components/brand/SettlementField"
import IntroSequence from "@/components/brand/IntroSequence"
import ReviewPrompt from "@/components/reviews/ReviewPrompt"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Guide from './pages/Guide';
import Funded from './pages/Funded';
import { AuthProvider } from '@/lib/AuthContext';
import { PriceProvider } from '@/lib/PriceContext';
import { ThirdwebProvider, AutoConnect } from 'thirdweb/react';
import { thirdwebClient, wallets } from '@/lib/thirdwebClient';
import ErrorBoundary from '@/components/ErrorBoundary';
import AddToHomeScreen from '@/components/AddToHomeScreen';
import { ThemeProvider } from 'next-themes';
import { HelmetProvider } from 'react-helmet-async';
import { useEffect } from 'react';
import { PostHogProvider, PageviewTracker } from '@/lib/posthog';
import { XPixelTracker } from '@/lib/xpixel';
import { ConsentProvider } from '@/lib/consent';
import ConsentBanner from '@/components/ConsentBanner';
import PrivacyUpdateNotice from '@/components/PrivacyUpdateNotice';
import { Analytics } from '@vercel/analytics/react';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return null;
}


const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={
      <LayoutWrapper currentPageName={mainPageKey}>
        <ErrorBoundary>
          <MainPage />
        </ErrorBoundary>
      </LayoutWrapper>
    } />
    {/* Standalone campaign landing — rendered WITHOUT the site nav/footer for
        a focused, low-exit funnel. Excluded from the Layout-wrapped map below. */}
    <Route path="/Funded" element={
      <ErrorBoundary>
        <Funded />
      </ErrorBoundary>
    } />
    {Object.entries(Pages).filter(([path]) => path !== "Funded").map(([path, Page]) => (
      <Route
        key={path}
        path={`/${path}`}
        element={
          <LayoutWrapper currentPageName={path}>
            <ErrorBoundary>
              <Page />
            </ErrorBoundary>
          </LayoutWrapper>
        }
      />
    ))}
    <Route path="/guides/*" element={
      <LayoutWrapper currentPageName="Support">
        <ErrorBoundary>
          <Guide />
        </ErrorBoundary>
      </LayoutWrapper>
    } />
    <Route path="*" element={<PageNotFound />} />
  </Routes>
);

function App() {
  return (
    <HelmetProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" storageKey="chainfunded-theme">
        <PostHogProvider>
          <ThirdwebProvider>
            <AutoConnect client={thirdwebClient} wallets={wallets} />
            <AuthProvider>
              <PriceProvider>
                <QueryClientProvider client={queryClientInstance}>
                  <ConsentProvider>
                    <IntroSequence />
                    <SettlementField />
                    <Router>
                      <ScrollToTop />
                      <PageviewTracker />
                      <XPixelTracker />
                      <AppRoutes />
                    </Router>
                    <Toaster />
                    <SonnerToaster position="bottom-right" />
                    <AddToHomeScreen />
                    <ConsentBanner />
                    <PrivacyUpdateNotice />
                    <ReviewPrompt />
                    <Analytics />
                  </ConsentProvider>
                </QueryClientProvider>
              </PriceProvider>
            </AuthProvider>
          </ThirdwebProvider>
        </PostHogProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}

export default App;
