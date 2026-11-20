#!/bin/sh
# Run this once on the Raspberry Pi (or any Debian computer) after installing the Clock & Timer .deb.
# It makes Clock & Timer start by itself, full screen, every time this user logs in.
set -e

CMD="$(command -v clock-timer || true)"
if [ -z "$CMD" ]; then
  echo "Could not find clock-timer. Install the .deb first, then run this again."
  exit 1
fi

mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/clock-timer-kiosk.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Clock and Timer (kiosk)
Comment=Full-screen timer display, controlled from Companion
Exec=sh -c "xset s off; xset -dpms; xset s noblank; exec $CMD --kiosk"
X-GNOME-Autostart-enabled=true
DESK

echo "Done. Clock & Timer will start full screen the next time this user logs in."
echo "Restart the computer to try it:  sudo reboot"
