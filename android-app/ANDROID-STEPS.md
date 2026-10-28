# Build the Android app (APK) on GitHub

This works the same way as the Mac and Windows builds: GitHub builds the app on its own computers
and you download the finished file. Nothing to install on your computer.

You can use the same repository you already made for the desktop apps.

## 1. Upload the Android folder

1. Open your repository on github.com.
2. Click **Add file**, then **Upload files**.
3. From this download, drag the whole **android-app** folder onto the page (the folder itself, so it
   keeps its `www` folder inside). Wait for the file list to finish.
4. Click **Commit changes**.

If the folder will not drag in, tell me and I will give you a different way.

## 2. Add the build instructions

1. On the repository's main page, click **Add file**, then **Create new file**.
2. In the name box, type exactly: `.github/workflows/android.yml`
3. Open `android.yml` (in this `github-build` folder) in a text editor, copy everything, and paste it into
   the big text box on GitHub.
4. Click **Commit changes**, then **Commit changes** again.

## 3. Wait for the build

1. Click the **Actions** tab. A run called **Build Android app** starts by itself. If it does not,
   click **Build Android app** on the left, then **Run workflow**.
2. Wait for the green check (about 5 to 10 minutes). If it turns red, click it, copy the error text
   from the step marked with a red X, and send it to me.

## 4. Download the app

1. Click the finished run. At the bottom, under **Artifacts**, download **Clock-Timer-1.4.a-Android**.
2. Unzip it. Inside is **Clock-Timer-1.4.a.apk**.

## 5. Put it on the Galaxy S22 Ultra

1. Get the file to the phone: email it to yourself, put it in Google Drive, or copy it with a USB cable.
2. On the phone, open the file (in Files, Drive or your email) and tap it.
3. Android asks permission to install apps from that source. Tap **Settings**, switch on **Allow from this
   source**, go back, and tap **Install**.
4. If Google Play Protect says it blocked the app, tap **More details**, then **Install anyway**. This
   happens because the app is not in the Play Store.

## Using it

- The app opens on one screen: a big countdown, four big buttons (1 min less, Start/Pause, 1 min more,
  Reset) and, before you start, a row of duration buttons. The room name shows at the top left.
- **More** (top right) opens a drawer with Run of show, Time travel and count down to a time, Sound, Colors,
  Duration buttons, the room name, and the switches for the "ends at" line and count up after zero.
- **Reset** always asks "Reset the timer?" first.
- **Lock** (under More) hides everything except Start/Pause, Reset and Next segment. To unlock, press and hold
  the Unlock button for about a second. The lock stays on if the tablet restarts.
- The screen is locked to landscape and stays on while the app is open.
- The timer keeps running while you open other screens from More. The Android back button goes back, and
  the X in the corner of those screens returns to the main screen.

## Updating the app later

Upload the new `android-app` folder over the old one (Add file, Upload files; GitHub replaces files with the
same name), commit, and wait for the new build under Actions. If you already added `android.yml` earlier,
replace its contents with the new `android.yml` too, because it now also locks the screen to landscape and adds the second-screen output.
Then install the new APK on top of the old one. Your settings are kept.

## Second screen (TV or monitor over USB-C / HDMI)

1. Plug the USB-C to HDMI adapter into the tablet or phone and the other end into the TV.
2. In the app, tap **More**, then switch on **Second screen (HDMI)**.
3. The TV shows a big, clean countdown with the progress bar, the "ends at" line, the room name and the
   current segment. It has no buttons. The tablet keeps the controls.
4. The switch is remembered. Unplug and replug the cable and the TV picks the display back up by itself.
5. If the switch is not in the list, the app was built without the new `native` folder. Upload the whole
   `android-app` folder again (it now contains `native` and `www/display.html`) and replace `android.yml`.

If the TV only mirrors the tablet instead of showing the clean display, tell me which device and TV you
used. Some phones switch to mirroring or Samsung DeX when a cable is plugged in.

## What is different from the computer app

- Remote control from Companion is not in this version.
- The timer only counts while the app is open. If you leave the app or lock the tablet, it catches up when
  you come back, but it cannot play the finish sound while the app is closed. Pin the app on the tablet
  (Android's screen pinning) so it stays in front.
- To show the timer on a TV or monitor: connect the HDMI adapter and either mirror the screen, or use
  Samsung DeX and open the app there.
