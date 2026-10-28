package com.clocktimer.app;

import android.app.Presentation;
import android.content.Context;
import android.graphics.Color;
import android.hardware.display.DisplayManager;
import android.os.Bundle;
import android.view.Display;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Shows display.html on a second screen (HDMI / USB-C) when one is connected and the switch is on. */
@CapacitorPlugin(name = "ExtDisplay")
public class ExtDisplayPlugin extends Plugin {
  private boolean enabled = false;
  private String lastJson = null;
  private ExtPresentation pres = null;
  private DisplayManager dm = null;

  private final DisplayManager.DisplayListener listener = new DisplayManager.DisplayListener() {
    @Override public void onDisplayAdded(int id) { sync(); }
    @Override public void onDisplayRemoved(int id) { sync(); }
    @Override public void onDisplayChanged(int id) { }
  };

  @Override
  public void load() {
    dm = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
    if (dm != null) dm.registerDisplayListener(listener, null);
  }

  @Override
  protected void handleOnResume() { sync(); }

  @Override
  protected void handleOnDestroy() {
    if (dm != null) dm.unregisterDisplayListener(listener);
    getActivity().runOnUiThread(() -> hide());
  }

  private Display findDisplay() {
    if (dm == null) return null;
    Display[] list = dm.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
    return (list != null && list.length > 0) ? list[0] : null;
  }

  private void hide() {
    if (pres != null) {
      try { pres.dismiss(); } catch (Exception e) { /* already gone */ }
      pres = null;
    }
  }

  /** Make what is on the second screen match the switch and the connected screens. Runs on the UI thread. */
  private void sync() {
    if (getActivity() == null) return;
    getActivity().runOnUiThread(() -> {
      Display d = findDisplay();
      if (!enabled || d == null) { hide(); return; }
      if (pres != null && pres.getDisplay().getDisplayId() == d.getDisplayId() && pres.isShowing()) return;
      hide();
      try {
        pres = new ExtPresentation(getActivity(), d);
        pres.show();
      } catch (Exception e) {
        pres = null;
      }
    });
  }

  @PluginMethod
  public void setEnabled(PluginCall call) {
    enabled = Boolean.TRUE.equals(call.getBoolean("on", false));
    sync();
    call.resolve();
  }

  @PluginMethod
  public void status(PluginCall call) {
    JSObject r = new JSObject();
    r.put("connected", findDisplay() != null);
    r.put("showing", pres != null && pres.isShowing());
    call.resolve(r);
  }

  @PluginMethod
  public void push(PluginCall call) {
    lastJson = call.getString("json");
    final String js = lastJson;
    if (js != null && pres != null) {
      getActivity().runOnUiThread(() -> { if (pres != null) pres.send(js); });
    }
    call.resolve();
  }

  private class ExtPresentation extends Presentation {
    private WebView web;

    ExtPresentation(Context ctx, Display display) { super(ctx, display); }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
      super.onCreate(savedInstanceState);
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      web = new WebView(getContext());
      web.setBackgroundColor(Color.parseColor("#12161c"));
      WebSettings s = web.getSettings();
      s.setJavaScriptEnabled(true);
      web.setWebViewClient(new WebViewClient() {
        @Override public void onPageFinished(WebView v, String url) { if (lastJson != null) send(lastJson); }
      });
      web.loadUrl("file:///android_asset/public/display.html");
      setContentView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    void send(String json) {
      if (web != null) web.evaluateJavascript("window.update&&window.update(" + json + ")", null);
    }

    @Override
    public void onDetachedFromWindow() {
      super.onDetachedFromWindow();
      if (web != null) { web.destroy(); web = null; }
    }
  }
}
