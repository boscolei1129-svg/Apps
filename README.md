# Pocket Snake

Classic Snake on a retro phone LCD. It's a single static page with no build step and no dependencies.

## Play

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Controls

| Action | Keyboard | Keypad / touch |
| --- | --- | --- |
| Steer | Arrows, WASD, 2/4/6/8 | 2 4 6 8, or swipe on the screen |
| Start / pause | Space, Enter, 5, P | 5, or tap the screen |
| Level slower / faster | `-` / `+` | `*` / `#` |
| Toggle walls | 0 | 0 |

## Rules

- Each food is worth the current level (1–9) in points.
- After every 5th food a bonus critter appears for 20 moves. It's worth `5 × level` plus the moves left.
- With walls off the snake wraps around the edges. With walls on, hitting the border ends the game.
- Your best score, level, and walls setting are saved in the browser.

## Also in this repo

- [Plate Log](plate-log/): personal training log for a 5-day split. Data is saved in the browser on your phone; use Save backup on the Plan tab to keep a copy.
- [Lull](lull/): night-sky sleep journal with one-tap tracking, morning check-ins, dreams, trends and sleep sounds. Data is saved in the browser on your phone; use Export backup in Settings to keep a copy.
