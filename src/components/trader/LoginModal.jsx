import { useConnectModal } from "thirdweb/react";
import { thirdwebClient, chain, wallets, appMetadata } from "@/lib/thirdwebClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, Wallet } from "lucide-react";

export default function LoginModal() {
  const { connect } = useConnectModal();

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="border-border w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center mx-auto mb-3">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <CardTitle className="text-lg">Connect Wallet</CardTitle>
          <p className="text-sm text-muted-foreground">Access your ChainFunded dashboard</p>
        </CardHeader>
        <CardContent className="flex justify-center pt-4">
          <Button
            className="w-full border-primary/40 text-primary hover:bg-primary/10 gap-1.5"
            variant="outline"
            onClick={() => connect({ client: thirdwebClient, chain, wallets, appMetadata })}
          >
            <Wallet className="w-3.5 h-3.5" /> Connect Wallet
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
