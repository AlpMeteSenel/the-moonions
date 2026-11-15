# Plan Banana · the-moonions

**NASA Space Apps Challenge 2026: Lunar Landing Site Navigator.** Team **The Moonions**, Turin (3rd place locally).

Plan Banana picks where and when to land near the lunar south pole, and keeps a backup ready. Our AI is trained on NASA LOLA terrain and about 4 million simulated touchdowns. It marks a primary landing zone (Z1) and a backup (Z2), with a deadline for when the switch must be decided. A tabletop lander prototype then shows the diversion during descent.

| | |
|---|---|
| Demo video (29 s) | https://youtu.be/3ZclOGjP1po |
| Presentation and media | https://drive.google.com/drive/folders/1kb7JDXapiC7qWxB924Jspsl-8xBstL5U |
| **Dashboard** (this repo) | Next.js 3D Moon planner |
| **Backend and AI model** | https://github.com/AlpMeteSenel/the-moonions-backend |
| **Lander firmware and hardware** | https://github.com/AlpMeteSenel/the-moonions-firmware |

AI disclosure: parts of the code, slides and the demo video were made with AI assistance. The video voice-over was generated with ElevenLabs.

---


Next.js dashboard for the **Lunar Landing Site Navigator** (NASA Space Apps): an interactive 3D Moon
built on real NASA data to pick landing sites and dates, see AI/data-driven suitability scores,
inspect **nearby backup landing sites**, compare candidates and accept or reject landing proposals.

Backend: [`the-moonions-backend`](https://github.com/AlpMeteSenel/the-moonions-backend) (start it first; see its README).

```bash
pnpm install
cp .env.example .env.local      # NEXT_PUBLIC_API_URL=https://nasa.aliemre.senel.biz
pnpm dev                        # http://localhost:3000
```

## What's on screen

* **Moon view**: self-hosted three.js globe (LROC colour + LOLA relief), sharp polar caps from 80 m
  LOLA data, sunlight and Earth placed for the selected touchdown time, hazard overlay, click to add sites.
* **Site 3D**: real terrain around the site coloured by ground tilt, shadows from the real Sun,
  landing zone, divert range and numbered backup sites with divert paths.
* **Scorecard**: Ground safety · Sunlight · Earth contact · Backup options · Crater risk · Science value,
  in plain language, with a GO / CAUTION / NO-GO verdict.
* **Backups**: fallback sites by tier (last-second hop / short divert / early retarget) with
  "decide by T-minus" and hover-fuel cost.
* **Landing windows**: 30-day quality curve; click to set the touchdown time.
* **Compare** and **Proposals** (accept / reject with notes, stored with a snapshot of the evaluation).

No Cesium or other paid services are used.
