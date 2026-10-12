import SEO from "@/components/SEO";
import HeroSection    from "@/components/landing/HeroSection";
import ReviewTicker   from "@/components/landing/ReviewTicker";
import WhatIsFundedTrading from "@/components/landing/WhatIsFundedTrading";
import WhyOnChain     from "@/components/landing/WhyOnChain";
import HowItWorks     from "@/components/landing/HowItWorks";
import PricingSection from "@/components/landing/PricingSection";
import LPSection      from "@/components/landing/LPSection";
import RewardsSeasons from "@/components/landing/RewardsSeasons";
import DaoSection     from "@/components/landing/DaoSection";
import LandingFAQ     from "@/components/landing/LandingFAQ";
import LandingFooter  from "@/components/landing/LandingFooter";
import FomoNotifier   from "@/components/marketing/FomoNotifier";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <SEO canonical="/" />
      <HeroSection />
      <ReviewTicker />
      <WhatIsFundedTrading />
      <WhyOnChain />
      <HowItWorks />
      <PricingSection />
      <LPSection />
      <RewardsSeasons />
      <DaoSection />
      <LandingFAQ />
      <LandingFooter />
      <FomoNotifier />
    </div>
  );
}
