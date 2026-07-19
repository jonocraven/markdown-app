package com.jonocraven.markdownreader

import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // Rust's std::fs core needs real filesystem paths (PLAN-ANDROID.md §2),
  // which requires the "All files access" grant on API 30+. Checking in
  // onResume (not just onCreate) means returning from the Settings screen
  // re-checks automatically instead of re-launching it once granted.
  override fun onResume() {
    super.onResume()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
      val intent = android.content.Intent(
        Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
        Uri.parse("package:$packageName"),
      )
      startActivity(intent)
    }
  }
}
