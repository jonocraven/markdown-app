package com.jonocraven.markdownreader

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.OpenableColumns
import android.provider.Settings
import android.util.Log
import androidx.activity.enableEdgeToEdge
import java.io.File
import java.util.UUID

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Drive and other document providers hand us a temporary content:// URI.
    // Tauri's Rust event loop can safely open only a real local path, so copy
    // the shared Markdown file into this app's private inbox before Tauri
    // receives the launch intent. The provider's temporary read grant is
    // still valid here, including on a cold start from Drive's Open With.
    setIntent(stageSharedFiles(intent))
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    val stagedIntent = stageSharedFiles(intent)
    setIntent(stagedIntent)
    super.onNewIntent(stagedIntent)
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

  /** Replace provider-backed content URIs in every Android sharing shape
   * (VIEW, SEND and SEND_MULTIPLE) with private file:// inbox copies before
   * the Tauri/Wry activity forwards the intent to Rust. */
  private fun stageSharedFiles(original: Intent): Intent {
    val incoming = linkedSetOf<Uri>()
    original.data?.let(incoming::add)
    original.clipData?.let { clip ->
      for (index in 0 until clip.itemCount) clip.getItemAt(index).uri?.let(incoming::add)
    }

    @Suppress("DEPRECATION")
    (original.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri)?.let(incoming::add)
    @Suppress("DEPRECATION")
    original.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.forEach(incoming::add)

    val staged = incoming.map { uri ->
      if (uri.scheme == "content") stageContentUri(uri) ?: uri else uri
    }
    if (staged.isEmpty() || staged == incoming.toList()) return original

    return Intent(original).also { intent ->
      val first = staged.first()
      if (intent.action == Intent.ACTION_VIEW) intent.data = first

      intent.clipData = ClipData.newRawUri("Markdown file", first).also { clip ->
        staged.drop(1).forEach { clip.addItem(ClipData.Item(it)) }
      }

      if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
        intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(staged))
      } else {
        intent.putExtra(Intent.EXTRA_STREAM, first)
      }
    }
  }

  /** Copy an Android document-provider stream to an app-private inbox. This
   * preserves a human-readable filename where the provider exposes one, and
   * means the reader can continue using its normal real-file safety checks. */
  private fun stageContentUri(uri: Uri): Uri? {
    return try {
      val inbox = File(cacheDir, "shared-markdown").apply { mkdirs() }
      val displayName = displayName(uri)
        .replace(Regex("[^\\p{L}\\p{N}._ -]"), "_")
        .take(120)
        .ifBlank { "shared-note.md" }
      val destination = File(inbox, "${UUID.randomUUID()}-$displayName")
      contentResolver.openInputStream(uri)?.use { input ->
        destination.outputStream().use(input::copyTo)
      } ?: return null
      Uri.fromFile(destination)
    } catch (error: Exception) {
      Log.e("MarkdownReader", "Could not import shared Markdown file", error)
      null
    }
  }

  private fun displayName(uri: Uri): String {
    val cursor = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
    try {
      if (cursor?.moveToFirst() == true) {
        cursor.getString(cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME))?.let { return it }
      }
    } finally {
      cursor?.close()
    }
    return uri.lastPathSegment?.substringAfterLast('/') ?: "shared-note.md"
  }
}
