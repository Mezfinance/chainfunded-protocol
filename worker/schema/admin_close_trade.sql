-- admin_close_trade: atomic admin override for a stuck-open trade.
--
-- Same business logic as worker/server.js handleTradeClose, but exposed
-- as an RPC so a one-shot script can run all three writes (trade row,
-- account balance, ledger entry) inside a single Postgres transaction.
-- If any step fails the others roll back automatically.
--
-- Run in the Supabase SQL editor once. After this lives in the DB,
-- scripts/admin-close-trade.js can call it via supabase.rpc().

CREATE OR REPLACE FUNCTION admin_close_trade(
  p_trade_id    text,
  p_account_id  text,
  p_exit_price  numeric,
  p_close_reason text DEFAULT 'manual_admin'
)
RETURNS TABLE (
  trade_id        text,
  symbol          text,
  direction       text,
  entry_price     numeric,
  exit_price      numeric,
  pnl             numeric,
  pnl_pct         numeric,
  close_time      timestamptz,
  balance_before  numeric,
  balance_after   numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trade        trades%ROWTYPE;
  v_acct         challenge_accounts%ROWTYPE;
  v_pnl          numeric;
  v_pnl_pct      numeric;
  v_margin       numeric;
  v_close_time   timestamptz := now();
  v_balance_before numeric;
  v_balance_after  numeric;
BEGIN
  -- Lock the trade row first to prevent a concurrent worker close
  -- from interleaving.
  SELECT * INTO v_trade FROM trades WHERE id = p_trade_id FOR UPDATE;
  IF v_trade IS NULL THEN
    RAISE EXCEPTION 'trade % not found', p_trade_id USING ERRCODE = 'P0002';
  END IF;
  IF v_trade.status <> 'open' THEN
    RAISE EXCEPTION 'trade % is not open (status=%)', p_trade_id, v_trade.status USING ERRCODE = 'P0001';
  END IF;
  IF v_trade.account_id <> p_account_id THEN
    RAISE EXCEPTION 'trade % does not belong to account %', p_trade_id, p_account_id USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_acct FROM challenge_accounts WHERE account_id = p_account_id FOR UPDATE;
  IF v_acct IS NULL THEN
    RAISE EXCEPTION 'account % not found', p_account_id USING ERRCODE = 'P0002';
  END IF;

  -- PnL math: identical to handleTradeClose.
  v_pnl := CASE WHEN v_trade.direction = 'long' THEN 1 ELSE -1 END
           * (p_exit_price - v_trade.entry_price) / v_trade.entry_price
           * v_trade.size;
  v_margin := CASE WHEN v_trade.leverage > 0 THEN v_trade.size / v_trade.leverage
                                              ELSE v_trade.size END;
  v_pnl_pct := CASE WHEN v_margin > 0 THEN (v_pnl / v_margin) * 100 ELSE 0 END;
  v_balance_before := COALESCE(v_acct.current_balance, 0);
  v_balance_after  := v_balance_before + v_pnl;

  UPDATE trades
  SET status = 'closed',
      exit_price = p_exit_price,
      close_time = v_close_time,
      pnl = v_pnl,
      pnl_pct = v_pnl_pct,
      updated_at = now()
  WHERE id = p_trade_id;

  UPDATE challenge_accounts
  SET current_balance  = v_balance_after,
      daily_loss_today = COALESCE(daily_loss_today, 0) + LEAST(v_pnl, 0)
  WHERE account_id = p_account_id;

  INSERT INTO account_ledger (
    event_type, account_id, trader_address, trade_id,
    symbol, direction, size_usdc, leverage,
    entry_price, exit_price, pnl_usdc, close_reason,
    opened_at, closed_at, balance_before, balance_after
  ) VALUES (
    'trade_close', p_account_id, COALESCE(v_acct.trader_address, ''), p_trade_id,
    v_trade.symbol, v_trade.direction, v_trade.size, v_trade.leverage,
    v_trade.entry_price, p_exit_price, v_pnl, p_close_reason,
    v_trade.open_time, v_close_time, v_balance_before, v_balance_after
  );

  RETURN QUERY SELECT
    p_trade_id, v_trade.symbol, v_trade.direction,
    v_trade.entry_price, p_exit_price,
    v_pnl, v_pnl_pct, v_close_time,
    v_balance_before, v_balance_after;
END;
$$;
