"""Builds www/index.html for the Android app from the desktop app's index.html.
Usage: python3 make_www.py ../clock-timer-app/index.html
It adds the Android engine and a few touch-friendly style changes. The desktop file is not modified."""
import sys

src = sys.argv[1] if len(sys.argv) > 1 else '../clock-timer-app/index.html'
h = open(src, encoding='utf-8').read()

ANDROID_CSS = """
  /* ---- Android (touch, one screen at a time) ---- */
  .android #pin, .android #dispToggle, .android #newHelp, .android #apiNote { display: none !important; }
  .android button.chip { padding: 8px 12px; font-size: 14px; }
  .android #ctl button { padding: 6px 12px; font-size: 13px; }
  .android input[type=number] { width: 84px; padding: 8px 6px; font-size: 15px; }
  .android select { padding: 8px 10px; font-size: 15px; }
  .android button, .android input[type=time] { min-height: 40px; }
  .android .seg .sb button { min-height: 0; padding: 6px 9px; }
  .android .seg { grid-template-columns: 18px minmax(70px, 1fr) 66px auto; }
  .android .seg .se { display: none; }
  .android.v-controls, .android.v-audio, .android.v-show, .android.v-presets, .android.v-colors, .android.v-launcher { overflow-y: auto; }
  .android.v-controls body, .android.v-audio body, .android.v-show body, .android.v-presets body, .android.v-colors body, .android.v-launcher body {
    align-items: flex-start; height: auto; min-height: 100%; overflow-y: auto; }
  .android.v-launcher #launcher { margin: auto; }
  .android.v-launcher body { align-items: center; }
  .android #showWin, .android #presetsWin, .android #colors { max-height: none; overflow: visible; }
  .android body { padding-bottom: 24px; }
  .android.v-display body, .android.v-clock body { padding-bottom: 0; }
"""
assert h.count('</style>') == 1
h = h.replace('</style>', ANDROID_CSS + '</style>')

marker = '<script>\n(function () {'
assert h.count(marker) == 1, 'could not find the main script'
h = h.replace(marker, '<script src="engine.js"></script>\n' + marker)

if 'viewport-fit' not in h:
    h = h.replace('content="width=device-width, initial-scale=1"', 'content="width=device-width, initial-scale=1, viewport-fit=cover"')

open('www/index.html', 'w', encoding='utf-8').write(h)
print('wrote www/index.html', len(h), 'bytes')
