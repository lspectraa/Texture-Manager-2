package com.spectra.texturemanager2

import android.graphics.Color
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    // Match shell bg so any pre-paint flash isn't pure black.
    webView.setBackgroundColor(Color.parseColor("#070a17"))
  }
}
