import { ethers } from 'ethers';
import { createClient } from '@base44/sdk';

const REWARDS_POOL_ABI = [
  {
    name: "distributePayout",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "trader",       type: "address" },
      { name: "grossProfit",  type: "uint256" },
      { name: "traderShare",  type: "uint256" },
      { name: "payoutId",     type: "string"  },
      { name: "signature",    type: "bytes"   }
    ],
    outputs: []
  }
];

const ADMIN_ADDRESSES = (process.env.VITE_ADMIN_ADDRESSES || '')
  .split(',')
  .map(a => a.trim().toLowerCase())
  .filter(Boolean);

function checkEliteStatus(payouts) {
  if (payouts.length < 3) return false;
  const dates = payouts
    .filter(p => p.settled_date)
    .map(p => new Date(p.settled_date))
    .sort((a, b) => a - b);
  if (dates.length < 3) return false;
  let consecutive = 1;
  for (let i = 1; i < dates.length; i++) {
    const monthDiff =
      (dates[i].getFullYear() - dates[i - 1].getFullYear()) * 12 +
      (dates[i].getMonth() - dates[i - 1].getMonth());
    if (monthDiff === 1) {
      consecutive++;
      if (consecutive >= 3) return true;
    } else if (monthDiff > 1) {
      consecutive = 1;
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { trader, grossProfit, payoutId, callerAddress } = req.body;

  // Verify caller is an admin wallet
  if (!callerAddress || !ADMIN_ADDRESSES.includes(callerAddress.toLowerCase())) {
    return res.status(403).json({ error: 'Admin only' });
  }

  if (!trader || !grossProfit || !payoutId) {
    return res.status(400).json({ error: 'Missing required fields: trader, grossProfit, payoutId' });
  }

  const REWARDS_POOL_ADDRESS = process.env.REWARDS_POOL_ADDRESS;
  const PRIVATE_KEY          = process.env.PAYOUT_SIGNER_KEY;
  const RPC_URL              = process.env.RPC_URL;
  const CHAIN_ID             = parseInt(process.env.CHAIN_ID || '11155111'); // default Sepolia

  if (!REWARDS_POOL_ADDRESS || !PRIVATE_KEY || !RPC_URL) {
    return res.status(500).json({ error: 'Contract not configured' });
  }

  try {
    const base44 = createClient({
      appId: process.env.BASE44_APP_ID,
      requiresAuth: false,
    });

    // Check elite status (3+ consecutive months of settled payouts)
    const settledPayouts = await base44.entities.Payout.filter({
      trader_address: trader,
      status: 'settled',
    });
    const isElite = checkEliteStatus(settledPayouts);

    // Calculate trader's share
    const shareRate   = isElite ? 0.9 : 0.8;
    const traderShare = grossProfit * shareRate;
    const firmShare   = grossProfit - traderShare;

    // Build signature matching RewardsPool.sol's verification
    // NOTE: This file targets the legacy RewardsPool contract (no longer in repo).
    // The current contract is ChainFundedPool.sol which uses a different signature
    // scheme (9 params via abi.encode). See base44/functions/generatePayoutProof/.
    //
    // Uses abi.encode (not encodePacked) to match updated contract pattern.
    // See audit finding M-03.
    const grossProfitUnits = ethers.parseUnits(grossProfit.toString(), 6);
    const traderShareUnits = ethers.parseUnits(traderShare.toString(), 6);

    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encoded = abiCoder.encode(
      ['address', 'uint256', 'uint256', 'string', 'uint256'],
      [trader, grossProfitUnits, traderShareUnits, payoutId, CHAIN_ID]
    );
    const messageHash = ethers.keccak256(encoded);

    const signerWallet = new ethers.Wallet(PRIVATE_KEY);
    const signature    = await signerWallet.signMessage(ethers.getBytes(messageHash));

    // Call the RewardsPool contract
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(
      REWARDS_POOL_ADDRESS,
      REWARDS_POOL_ABI,
      new ethers.Wallet(PRIVATE_KEY, provider)
    );

    const tx      = await contract.distributePayout(trader, grossProfitUnits, traderShareUnits, payoutId, signature);
    const receipt = await tx.wait();

    // Update the payout record in Base44
    await base44.entities.Payout.update(payoutId, {
      status:           'settled',
      tx_hash:          receipt.hash,
      settled_date:     new Date().toISOString().split('T')[0],
      trader_share_usdc: traderShare,
      firm_share_usdc:   firmShare,
    });

    return res.status(200).json({
      success:      true,
      tx_hash:      receipt.hash,
      trader_share: traderShare,
      firm_share:   firmShare,
      is_elite:     isElite,
    });
  } catch (error) {
    console.error('Payout distribution error:', error);
    return res.status(500).json({ error: error.message || 'Payout distribution failed' });
  }
}
