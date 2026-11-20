# Controlling Clock & Timer from Bitfocus Companion

While the app is running, it listens for simple web requests on **your computer only**
(`http://127.0.0.1:8787`). No internet is needed. The launcher window shows the address it is using.

Companion can send these with its built-in generic HTTP module (look under "Generic" when you
add a connection; the exact names can differ a little between Companion versions). Add a
**GET** action to a button and paste in one of the URLs below. Every command replies with the
timer's full status as JSON, so you can also test any URL in a terminal:

    curl http://127.0.0.1:8787/status

## Commands

| Button does                    | URL                                                    |
|--------------------------------|--------------------------------------------------------|
| Start / resume                 | `/start`                                               |
| Pause                          | `/pause`                                               |
| Start or pause (one button)    | `/toggle`                                              |
| Reset                          | `/reset`                                               |
| Set duration (timer idle)      | `/set?minutes=10`  (also `hours=` and `seconds=`)      |
| Time travel on / off / toggle  | `/travel/on`  `/travel/off`  `/travel/toggle`          |
| Time travel speed (0.5 to 3)   | `/speed?value=1.25`                                    |
| Use speed mode / end-time mode | `/mode/speed`  `/mode/end`                             |
| Set the end time               | `/endtime?time=12:00`  (also `12:00:30`, `12pm`, `1:05pm`) |
| Clear the end time             | `/endtime/clear`                                       |
| Show / hide / toggle the Timer display window | `/display/show`  `/display/hide`  `/display/toggle` |
| Timer display shows the timer or the clock | `/face/timer`  `/face/clock`  `/face/toggle` |
| Add / take away time (any state except done) | `/adjust?minutes=1`  `/adjust?minutes=-1`  `/adjust?seconds=30` |
| Count down to a time of day (timer idle) | `/until?time=14:45`  (also `2:45pm`) |
| Sound mute / unmute / toggle    | `/audio/mute`  `/audio/unmute`  `/audio/toggle`        |
| Sound volume, sound, repeats    | `/audio/volume?value=60`  `/audio/sound?name=bell` (beep, chime, bell, alarm)  `/audio/repeats?value=3` |
| Play the end sound              | `/audio/test`                                          |
| Count up after zero on the display | `/overtime/on`  `/overtime/off`  `/overtime/toggle` |
| Countdown bar on the display    | `/bar/on`  `/bar/off`  `/bar/toggle`                   |
| "Ends at" line on the display   | `/endshow/on`  `/endshow/off`  `/endshow/toggle`       |
| Timer display stays on top      | `/displaytop/on`  `/displaytop/off`  `/displaytop/toggle` |
| Run of show                     | `/show/next`  `/show/prev`  `/show/go?segment=2`  `/show/auto/on`  `/show/auto/off`  `/show/auto/toggle` |
| Timer display look              | `/look?font=orbitron&weight=bold&bg=336699&opacity=40&text=light&shadow=on` (any of these; `bg=theme` for the normal background) |
| Look back to normal             | `/look/reset`                                          |

Fonts: `default`, `inter`, `oswald`, `barlow`, `bebas`, `orbitron`, `sharetech`, `jetbrains`,
`robotomono`, `spacemono`. Weights: `light`, `regular`, `bold`. Text: `auto`, `light`, `dark`.
Opacity: 0 is see-through, 100 is solid. There is no remote quit on purpose.

Put `http://127.0.0.1:8787` in front of each one, for example
`http://127.0.0.1:8787/set?minutes=10`.

Notes:
- `/set` only works while the timer is not running. To change the duration on a running timer,
  use a button with two actions in order: `/reset`, then `/set?minutes=10`.
- Turning time travel on in end-time mode needs an end time first. If the end time is not
  possible (already passed, or it would need less than 0.1x or more than 100x speed), the
  timer stays at normal speed and the reply's `notice` field says why.

## Reading the timer

These return plain text, which is handy for tools that just want a value:

| URL          | Returns                                  |
|--------------|------------------------------------------|
| `/remaining` | time left, like `12:34`                  |
| `/state`     | `idle`, `running`, `paused` or `done`    |
| `/endsat`    | the real clock time it will finish       |
| `/color`     | the current color rule, like `#ffb84d`   |

`/status` returns everything as JSON: `state`, `remaining`, `remainingMs`, `progress`,
`timeTravel`, `mode`, `speed`, `effectiveSpeed`, `endTimeSetting`, `endsAt`, `endsAtText`,
`color`, `display` (`shown`, `hidden` or `closed`), `face` (`timer` or `clock`), `notice`, `baseMs` (what Reset
goes back to), `overtime`, `endsAtOnDisplay`, `countdownBar`, `audio` (`muted`, `volume`, `sound`, `repeats`), `show` (`count`,
`index` starting at 1 with 0 meaning none yet, `name`, `next`, `auto`, `secs`), `look` and `displayTop`.

## Changing the address

- In the app, open **Network** from the first window. Choose **This computer only**, **Every network
  connection**, or one specific connection (for example Ethernet), and set the port. The window shows the
  host and port to enter in Companion. The choice is remembered. A chosen connection is followed if its
  address changes, and the app starts listening again when the connection comes back.
- Kiosk mode (Raspberry Pi) listens on every connection until you choose otherwise.
- For scripts: start the app with `CLOCK_TIMER_PORT=9000` and/or `CLOCK_TIMER_HOST=0.0.0.0` set
  (Mac/Linux: `CLOCK_TIMER_PORT=9000 npm start`, Windows: `set CLOCK_TIMER_PORT=9000 && npm start`). While
  these are set they override the Network window.
- Anyone on a network the app listens on could control the timer (there is no password), so only do this on a
  network you trust.

## Safety

The address only answers requests from tools, not from web pages in a browser, so a website
cannot press your timer buttons.
