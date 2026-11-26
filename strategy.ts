// Strategy for make.fun competition u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1
// ("Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana", harness bars-replay/v1).
//
// A causal mean-reversion ladder on hourly bars, tuned on the kit's dev window
// (see NOTES.md in the entry folder for the tuning record):
//
//   - Indicator: Wilder RSI with period 7 per symbol, updated on every bar the
//     symbol prints (warm-up bars included; no orders are sent while warming up).
//   - Entry: when a symbol's RSI falls to 25 or below and the symbol is not
//     held, buy a first tranche of 1/12 of equity (about 8.3%), never more
//     than the harness weight room (caps.max_weight_bps of equity) or the cash
//     left in this reply, and never below fees.min_notional_quote_units.
//   - Ladder: while holding, each time the RSI falls to 17 or below (8 points
//     under the entry trigger), buy one more tranche of the same size, up to
//     3 tranches in all; the weight room caps the position at 25% of equity.
//   - Exit (the whole position, re-sent every bar while its reason holds):
//     the RSI recovers to 55 or above, the position is 28 bars old, or its
//     value at the latest close falls to 95% of its cost (a disaster stop).
//   - Orders: sells first, then buys, in universe order, at most
//     caps.max_orders_per_bar per reply; every order caps its slippage at
//     100 bps past the close it was decided on.
//
// Everything is a pure function of the bars seen so far: float64 + - * / only,
// no clock, no randomness, no I/O — two runs over the same bars answer the
// same orders byte for byte.

import { type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

export const PARAMS = {
  rsiPeriod: 7,
  entryRsi: 25,
  addRsi: 17,
  exitRsi: 55,
  maxHoldBars: 28,
  stopFrac: 0.95,
  trancheDivisor: 12n,
  maxTranches: 3,
  maxSlippageBps: 100,
} as const;

/** Streaming Wilder RSI: seeded as the mean of its first `period` changes. */
interface Rsi {
  prev: number | null;
  seedGains: number[];
  seedLosses: number[];
  avgGain: number;
  avgLoss: number;
  value: number | null;
}

interface Track {
  rsi: Rsi;
  /** Batch seq of the fill that opened the position (first observed). */
  entrySeq: number | null;
  tranches: number;
}

function newRsi(): Rsi {
  return { prev: null, seedGains: [], seedLosses: [], avgGain: 0, avgLoss: 0, value: null };
}

function stepRsi(r: Rsi, close: number): void {
  if (r.prev === null) {
    r.prev = close;
    return;
  }
  const d = close - r.prev;
  r.prev = close;
  const gain = d > 0 ? d : 0;
  const loss = d < 0 ? -d : 0;
  const n = PARAMS.rsiPeriod;
  if (r.value === null) {
    r.seedGains.push(gain);
    r.seedLosses.push(loss);
    if (r.seedGains.length === n) {
      r.avgGain = r.seedGains.reduce((a, x) => a + x, 0) / n;
      r.avgLoss = r.seedLosses.reduce((a, x) => a + x, 0) / n;
      r.value = r.avgLoss === 0 ? 100 : 100 - 100 / (1 + r.avgGain / r.avgLoss);
    }
    return;
  }
  r.avgGain = (r.avgGain * (n - 1) + gain) / n;
  r.avgLoss = (r.avgLoss * (n - 1) + loss) / n;
  r.value = r.avgLoss === 0 ? 100 : 100 - 100 / (1 + r.avgGain / r.avgLoss);
}

export function createStrategy() {
  const tracks = new Map<string, Track>();

  function track(symbol: string): Track {
    let t = tracks.get(symbol);
    if (t === undefined) {
      t = { rsi: newRsi(), entrySeq: null, tranches: 0 };
      tracks.set(symbol, t);
    }
    return t;
  }

  return {
    onBatch(state: BarsState, batch: { bars: Bar[] }) {
      const fresh = new Set<string>();
      for (const bar of batch.bars) {
        fresh.add(bar.symbol);
        stepRsi(track(bar.symbol).rsi, Number(bar.c));
      }
      // Reconcile position tracking with the account the harness reports:
      // a symbol no longer held forgets its entry; a held symbol with no
      // record (its opening fill landed this batch) starts counting here.
      for (const [symbol, t] of tracks) {
        if (!state.positions.has(symbol)) {
          t.entrySeq = null;
          t.tranches = 0;
        } else if (t.entrySeq === null) {
          t.entrySeq = state.seq;
          t.tranches = 1;
        }
      }
      if (state.warmingUp) return [];

      const { caps, fees } = state.hello;
      const minNotional = BigInt(fees.min_notional_quote_units);
      const sells: SellInput[] = [];
      const buys: BuyInput[] = [];
      const exiting = new Set<string>();
      let cash = state.cash;

      const tranche = (): bigint => {
        const t = state.equity / PARAMS.trancheDivisor;
        return t < minNotional ? 0n : t;
      };

      // Exits first: RSI recovered, time stop, or disaster stop.
      for (const { symbol } of state.hello.symbols) {
        const held = state.positions.get(symbol);
        if (held === undefined || !fresh.has(symbol)) continue;
        const t = track(symbol);
        const rsi = t.rsi.value;
        const heldBars = t.entrySeq === null ? 0 : state.seq - t.entrySeq;
        const value = state.value(symbol, held.qty);
        const stopped = value * 20n <= held.cost * 19n; // value <= 95% of cost
        if ((rsi !== null && rsi >= PARAMS.exitRsi) || heldBars >= PARAMS.maxHoldBars || stopped) {
          sells.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: PARAMS.maxSlippageBps });
          exiting.add(symbol);
        }
      }

      // Ladder adds, then fresh entries, in universe order.
      for (const { symbol } of state.hello.symbols) {
        if (!fresh.has(symbol) || exiting.has(symbol)) continue;
        const t = track(symbol);
        const rsi = t.rsi.value;
        if (rsi === null) continue;
        const held = state.positions.get(symbol);
        if (held !== undefined) {
          if (t.tranches >= 1 && t.tranches < PARAMS.maxTranches && rsi <= PARAMS.addRsi) {
            let size = tranche();
            const room = state.weightRoom(symbol);
            if (room < size) size = room;
            if (cash < size) size = cash;
            if (size >= minNotional && size > 0n) {
              buys.push({ side: 'buy', symbol, notional_quote_units: size, max_slippage_bps: PARAMS.maxSlippageBps });
              cash -= size;
              t.tranches += 1;
            }
          }
        } else if (rsi <= PARAMS.entryRsi) {
          let size = tranche();
          const room = state.weightRoom(symbol);
          if (room < size) size = room;
          if (cash < size) size = cash;
          if (size >= minNotional && size > 0n) {
            buys.push({ side: 'buy', symbol, notional_quote_units: size, max_slippage_bps: PARAMS.maxSlippageBps });
            cash -= size;
            t.entrySeq = state.seq + 1; // fills at the next bar's open
            t.tranches = 1;
          }
        }
      }

      const orders: (SellInput | BuyInput)[] = [...sells, ...buys];
      return orders.slice(0, caps.max_orders_per_bar);
    },
  };
}
