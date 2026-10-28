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
`color`, `display` (`shown`, `hidden` or `closed`), `face` (`timer` or `clock`) and `notice`.

## Changing the address

- Different port: start the app with `CLOCK_TIMER_PORT=9000` set (Mac/Linux:
  `CLOCK_TIMER_PORT=9000 npm start`, Windows: `set CLOCK_TIMER_PORT=9000 && npm start`).
- Companion on another computer: also set `CLOCK_TIMER_HOST=0.0.0.0` so the app accepts
  connections from your network, then use this computer's IP address in the URLs. Anyone on
  that network could then control the timer, so only do this on a network you trust.

## Safety

The address only answers requests from tools, not from web pages in a browser, so a website
cannot press your timer buttons.
