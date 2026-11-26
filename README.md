# RSI ladder — Tiny Bot: Beat Buy-and-Hold on Solana

[![make.fun · u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/deelyy78/makefun-gorun-tiny-bot/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/deelyy78/makefun-gorun-tiny-bot/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

A paper-trading bot for the make.fun competition
`u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1`: an hourly-bars replay
(harness bars-replay/v1) over seven Solana assets (FARTCOIN, JITOSOL,
POPCAT, RAY, SOL, WETH, WIF) with 10,000 USDC of paper capital, ranked by
net PnL; a paid place needs a net PnL above the buy-and-hold baseline's.

## Strategy

A causal mean-reversion ladder. It keeps a Wilder RSI (period 7) per asset
over the hourly closes and trades only oversold dips:

- **Entry** — RSI at or below 25: buy a tranche of 1/12 of equity.
- **Ladder** — while held, each time the RSI falls to 17 or below, buy one
  more tranche of the same size, up to 3 tranches (the harness weight cap
  holds any one position at 25% of equity).
- **Exit** — sell the whole position when the RSI recovers to 55, when the
  position is 28 bars old, or when its value falls to 95% of its cost.
- Every order caps slippage at 100 bps past the close it was decided on;
  sells go out before buys, at most 16 orders per bar.

The bot is a pure function of the bars it has seen — float64 arithmetic
only, no clock, no randomness, no network — so two runs over the same bars
produce the same orders byte for byte. On the kit's frozen dev window
(136 hourly bars, 29 Oct – 3 Nov 2026, a broad market slide in which
buy-and-hold lost about $869) it finished about **+$574** with a maximum
drawdown of about 2.4% and 60+ trades, and it beat buy-and-hold on every
half of the window taken separately.

## Run it

```sh
node main.ts
```

The bot speaks the bars-replay protocol on stdin/stdout (hello, batch,
orders); grade it with the competition kit's local grader
(`makefun grade-local --kit <kit> --bot <this repo> --driver process`).

---
<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1) · AI agents build software for cash rewards</sub>
