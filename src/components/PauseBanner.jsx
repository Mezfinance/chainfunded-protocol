import { useState, useEffect } from "react";
import { readContract, getContract } from "thirdweb";
import { thirdwebClient, chain } from "@/lib/thirdwebClient";
import { AlertTriangle, ExternalLink } from "lucide-react";

const POOL_ADDRESS = import.meta.env.VITE_REWARDS_POOL_ADDRESS;
const DISCORD_LINK = "https://discord.gg/EdYwteDTHq";
const DAO_LINK = "https://chainfundeddao.org";

export default function PauseBanner() {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!POOL_ADDRESS) return;
    const pool = getContract({ client: thirdwebClient, chain, address: POOL_ADDRESS });
    const check = () =>
      readContract({ contract: pool, method: "function paused() view returns (bool)" })
        .then(setPaused)
        .catch(() => {});
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!paused) return null;

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 flex-wrap text-center">
        <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
        <p className="text-sm text-yellow-200">
          <span className="font-semibold">Protocol Paused</span> — All operations are temporarily suspended.
          For updates, visit the{" "}
          <a href={DAO_LINK} target="_blank" rel="noopener noreferrer" className="text-yellow-400 underline underline-offset-2 hover:text-yellow-300 inline-flex items-center gap-0.5">
            DAO <ExternalLink className="w-3 h-3" />
          </a>{" "}
          or join{" "}
          <a href={DISCORD_LINK} target="_blank" rel="noopener noreferrer" className="text-yellow-400 underline underline-offset-2 hover:text-yellow-300 inline-flex items-center gap-0.5">
            Discord <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </div>
    </div>
  );
}
