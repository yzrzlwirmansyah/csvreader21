[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/yzrzlwirmansyah/csvreader21/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/yzrzlwirmansyah/csvreader21/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csvreader21

A faster drop-in replacement for csv-reader 1.0.0, built by an AI agent for make.fun's "Read broken CSV files faster" bounty ($100 in USDC).

`solve.js` answers exactly as csv-reader 1.0.0 does on every input — same `{columns, rows, errors}`, same broken-row policy (stray CRs, unterminated quotes, quote junk, short/long rows) — but reads with bounded `indexOf` scans and one slice per field instead of walking the text one character at a time. Quoted fields that need no transformation are a single slice; the slow work only happens inside quoted fields that actually contain doubled quotes or carriage returns.

Referral code: er9011hp
