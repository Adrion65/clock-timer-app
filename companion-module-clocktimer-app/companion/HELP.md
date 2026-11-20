# Clock & Timer app

Module version 1.12.c

Controls the **Clock & Timer** desktop app. The app must be running, and it must be reachable
from the computer that runs Companion.

## Setup

1. Open the Clock & Timer app. The launcher window shows its remote-control address
   (by default `http://127.0.0.1:8787`).
2. Add this connection. Leave the address as `127.0.0.1` and the port as `8787` when the app and
   Companion run on the same computer. Otherwise enter the app computer's IP address
   (in the app, open **Network** from the first window and choose which network connection it listens
   on; the Network window shows the address and port to use here).
3. The connection turns green when it can see the app.

## Actions

- Start / resume, Pause, Start or pause (toggle), Reset
- Set duration (hours, minutes, seconds). It resets the timer first by default, because the
  duration can only change while the timer is not running.
- Time travel on / off / toggle, set the speed (0.5x to 3x), nudge the speed up or down
- Switch between speed mode and end-time mode, set the end time, clear the end time
- Show, hide or toggle the Timer display window
- Switch the Timer display between the timer and the clock
- Add or take away time (minutes and seconds). Works while idle, running or paused. Reset always
  goes back to the original duration.
- Count down to a time of day (for example 14:45 or 2:45pm)
- Sound: mute / unmute / toggle, volume (set or change), sound choice, repeats, play the end sound
- Count up after zero on the display, the countdown bar, the "ends at" line on the display, and keeping the Timer
  display on top: each on / off / toggle
- Run of show: next segment, previous segment, go to a segment number, automatic next segment
- Timer display look: font, weight, background (normal or any color), opacity (0 = see-through),
  text color, text shadow. Leave a setting on "No change" to keep it. Also change the opacity
  by a step, and put the look back to normal.

Not included on purpose: quitting the app. A stray button press should not close it in the middle
of a session.

## Feedbacks

- Timer state is (running / paused / idle / done)
- Time travel is on
- Mode is (speed / end time)
- App connected
- Timer display is showing
- Timer display shows timer / clock
- Count up after zero is on, countdown bar is on, "ends at" line is on, Timer display stays on top is on
- Sound is muted
- Run of show: automatic next is on, and current segment is (a chosen number)
- Timer display background is see-through
- Timer color: paints the button with the color from the app's color rules

## Variables

`remaining`, `remaining_seconds`, `progress_percent`, `state`, `time_travel`, `mode`, `speed`,
`effective_speed`, `speed_text`, `end_time_setting`, `ends_at`, `color`, `notice`, `connected`, `display`, `face`,
`duration` (what Reset goes back to), `overtime`, `ends_at_display`, `countdown_bar`, `muted`, `volume`, `sound`, `repeats`,
`segment_number`, `segment_count`, `segment_name`, `segment_next`, `segment_auto`, `segment_text` (like "2 of 4"),
`font`, `weight`, `background`, `opacity`, `text_color`, `text_shadow`, `display_on_top`.

Use them on buttons as `$(connection-label:remaining)`.

## Presets

Ready-made buttons are under Presets: run controls, ten duration buttons, time travel and
speed buttons, end-time buttons, add or take away time, run of show, sound, display options,
display look, and one button per display font.

The new actions and variables need Clock & Timer app version 1.8 or newer. An older app still works
for everything it supported before; the new variables stay empty.
