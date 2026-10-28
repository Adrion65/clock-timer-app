# Clock & Timer app

Module version 1.5.c

Controls the **Clock & Timer** desktop app. The app must be running, and it must be reachable
from the computer that runs Companion.

## Setup

1. Open the Clock & Timer app. The launcher window shows its remote-control address
   (by default `http://127.0.0.1:8787`).
2. Add this connection. Leave the address as `127.0.0.1` and the port as `8787` when the app and
   Companion run on the same computer. Otherwise enter the app computer's IP address
   (the app must be started with `CLOCK_TIMER_HOST=0.0.0.0`, see the app's COMPANION.md).
3. The connection turns green when it can see the app.

## Actions

- Start / resume, Pause, Start or pause (toggle), Reset
- Set duration (hours, minutes, seconds). It resets the timer first by default, because the
  duration can only change while the timer is not running.
- Time travel on / off / toggle, set the speed (0.5x to 3x), nudge the speed up or down
- Switch between speed mode and end-time mode, set the end time, clear the end time
- Show, hide or toggle the Timer display window
- Switch the Timer display between the timer and the clock

## Feedbacks

- Timer state is (running / paused / idle / done)
- Time travel is on
- Mode is (speed / end time)
- App connected
- Timer display is showing
- Timer display shows timer / clock
- Timer color: paints the button with the color from the app's color rules

## Variables

`remaining`, `remaining_seconds`, `progress_percent`, `state`, `time_travel`, `mode`, `speed`,
`effective_speed`, `speed_text`, `end_time_setting`, `ends_at`, `color`, `notice`, `connected`, `display`, `face`.

Use them on buttons as `$(connection-label:remaining)`.

## Presets

Ready-made buttons are under Presets: run controls, ten duration buttons, time travel and
speed buttons, and end-time buttons.
