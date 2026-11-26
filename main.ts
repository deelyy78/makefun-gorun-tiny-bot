// Entry for make.fun competition u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1
// ("Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana") — an hourly-bars replay
// (harness bars-replay/v1) over seven Solana assets, ranked by net PnL in
// USDC against a buy-and-hold bar. The grader runs `node /bot/main.ts`
// (Node 22); the strategy lives in strategy.ts and the SDK is the kit's
// sdk/makefun-bars.ts, vendored byte for byte under vendor/.

import { runBars } from './vendor/makefun-bars.ts';
import { createStrategy } from './strategy.ts';

await runBars(createStrategy());
