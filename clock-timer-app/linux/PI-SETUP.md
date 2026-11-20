# Clock & Timer on a Raspberry Pi 5 (full screen, controlled from Companion)

One Raspberry Pi 5 shows the timer full screen on a TV or projector. Bitfocus Companion runs on another
computer on the same network and presses the buttons. Use this on a **private network** (the timer's
remote-control address has no password in this mode, so anyone on the network could control it).

This is the Debian version (file name `Clock-Timer-1.11.l-arm64.deb`). Raspberry Pi OS is Debian, so it installs
there like any other app.

## What you need

- Raspberry Pi 5 (4 GB is plenty), the official power supply and a case with a fan or heatsink
- Storage: a good microSD card, or better an **M.2 NVMe SSD** in a case that takes one (such as the DeskPi Lite for
  Raspberry Pi 5). An SSD survives power cuts much better. See section 1b below.
- A micro-HDMI to HDMI cable or adapter (the DeskPi Lite includes an adapter)
- A network cable is best (Wi-Fi works too)
- A keyboard and mouse for the first setup only

## 1. Put the operating system on it

1. On another computer, install **Raspberry Pi Imager** and choose **Raspberry Pi OS (64-bit)** with the desktop.
2. Click the cog / **Edit settings** before writing: set a host name (for example `timer-room1`), a user name and
   password, your network, and your time zone. Write the card and start the Pi.

## 1b. Using an NVMe SSD instead of an SD card (recommended for production)

This assumes a Pi 5 in a case with an M.2 board, such as the DeskPi Lite. Follow the case maker's instructions to fit
the board and the SSD, then use **one** of these two ways to put the operating system on the SSD.

**Way A: write the SSD from another computer (simplest)**

1. Put the SSD in a USB-to-NVMe enclosure or adapter and plug it into your other computer.
2. In Raspberry Pi Imager, choose **Raspberry Pi OS (64-bit)** and pick the SSD as the storage. Use **Edit settings** as in
   section 1. Write it.
3. Fit the SSD in the case and start the Pi. If it does not start from the SSD, do the **boot order** step below.

**Way B: start from an SD card and copy it to the SSD**

1. Set up the Pi on an SD card as in sections 1 and 2.
2. Open **Accessories > SD Card Copier**. Copy from the SD card to the SSD (it may be called `nvme0n1`). Tick the option
   to give the copy new IDs if it offers one.
3. Do the **boot order** step below, shut down, take the SD card out, and start again.

**Boot order (needed for Way B, and only if Way A does not start by itself)**

1. Open a terminal and run `sudo raspi-config`.
2. Go to **Advanced Options > Boot Order** and choose **NVMe/USB Boot**. Finish and restart.
3. Check that it started from the SSD: run `lsblk`. The line for `/` should be on `nvme0n1`, not `mmcblk0`.

**Notes**

- **Check the case maker's page for the operating system version to use.** DeskPi warned that the Raspberry Pi OS release
  dated 2025-05-13 did not work with the driver their case uses. That warning may be out of date, so look at their support
  page before you write the card. The timer app itself does not depend on the Pi OS release.
- **Fan and power button:** the case may need its own driver or script for the power button. The timer does not need it.
  Follow the case maker's steps, and keep using **Shut down** from the menu when you can.
- **Power supply:** use the official 27 W Raspberry Pi 5 supply. An SSD and a fan draw more power than an SD card.
- **Not tested on real hardware:** I wrote these steps without a Pi 5 in front of me. If the Pi does not see the SSD, check
  that the ribbon cable and the board are seated, and then check the case maker's guide.

## 2. First start: a few settings

Open **Preferences > Raspberry Pi Configuration** (or run `sudo raspi-config`):

- **Display / Screen Blanking: Off.** The screen must never sleep.
- **System / Boot / Auto Login: Desktop Autologin.** So it starts by itself after a power cut.
- **Advanced Options / Wayland: X11.** The older X11 desktop is safest for full-screen apps. Restart if asked.
- **Localisation:** make sure the time zone is right. "Count down to a time of day" and the "ends at" line use the
  Pi's clock, and the Pi sets its time from the network.

## 3. Install the app

1. Download **Clock-Timer-1.11.l-arm64.deb** from GitHub and copy it to the Pi (a USB stick, or download it on the Pi).
2. Double-click it and choose **Install**. (Or, in a terminal: `sudo apt install ./Clock-Timer-1.11.l-arm64.deb`.)

## 4. Make it start by itself, full screen

1. Copy `install-kiosk.sh` (it is in the `linux` folder of the `clock-timer-app` folder) to the Pi.
2. Open a terminal in that folder and run: `sh install-kiosk.sh`
3. Restart the Pi: `sudo reboot`.

After the restart the Timer display fills the screen. For the first two minutes it also shows the address
Companion should connect to, like `192.168.1.50:8787`. There is no launcher, no mouse pointer and no buttons.

## 5. Connect Companion

On the Companion computer: add a **Clock & Timer app** connection and put the Pi's address (the IP shown on the
screen, or `timer-room1.local`) in the **App address** box, with port **8787**. The connection turns green.

Use the module's actions to run the timer and change the look. You can keep one Pi per room, each with its own
Companion connection.

## Changing run of show, duration buttons or anything else the app's windows control

The run of show list and the editable duration buttons can only be edited in the app's own windows. To change
them, with a keyboard and mouse on the Pi:

1. Stop the kiosk: in a terminal run `pkill clock-timer` (it comes straight back after a moment, so run the next
   command quickly), or start a normal copy from a second login.
2. Easier: open a terminal and run `clock-timer` while the kiosk is stopped:
   `pkill -f "clock-timer --kiosk"; clock-timer`
3. Make your changes in the launcher windows, then close the app and restart the Pi. The app remembers the settings.

## If something goes wrong

- **Black screen, or the app closes right away:** the Pi's graphics can disagree with the app. Edit
  `~/.config/autostart/clock-timer-kiosk.desktop` and add ` --disable-gpu` after `--kiosk`, then restart.
- **Crashes at start on a Pi 5:** the Pi 5 uses a different memory page size that some apps do not like. Add the
  line `kernel=kernel8.img` to `/boot/firmware/config.txt`, then restart.
- **Companion will not connect:** check the address on the screen (it shows for two minutes after start), that both
  computers are on the same network, and that nothing else uses port 8787. The screen says "Remote control is not
  available" if the port is taken.
- **The sound:** it comes out of the HDMI cable. Pick HDMI in the speaker menu at the top right if it is silent.
- **Power cuts:** a good power supply and an NVMe or USB SSD (or a small UPS) protect the storage. Always use **Shut down**
  from the menu rather than pulling the plug when you can.

## Not tested yet

I wrote this guide without a Raspberry Pi here. The first run on real hardware may need one of the fixes above.
