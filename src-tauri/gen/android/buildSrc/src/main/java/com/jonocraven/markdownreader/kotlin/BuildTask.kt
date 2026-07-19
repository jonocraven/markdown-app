import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        // Java's ProcessBuilder resolves a bare command name against the
        // *calling* JVM's own PATH, not the environment() set on the exec
        // spec below — so on a PATH lacking npm (Android Studio's launched
        // process doesn't inherit the login shell's PATH; see the PATH
        // augmentation below, which only affects what the child process
        // itself sees, e.g. for resolving cargo/rustc) we must pass an
        // absolute path to npm itself, not rely on lookup.
        val home = System.getenv("HOME")
        val npmCandidates = listOf(
            "/usr/local/bin/npm",
            "/opt/homebrew/bin/npm",
            "$home/.volta/bin/npm"
        )
        val executable = npmCandidates.firstOrNull { File(it).exists() } ?: "npm"
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )
                
                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e;
            }
        }
    }

    // Maps a Tauri `--target` short name to the NDK's per-target clang
    // binary name, which differs from the plain Cargo target triple only
    // for 32-bit ARM (`armv7a`, not `armv7`). `tauri android
    // android-studio-script`, unlike `tauri android dev`, does not reliably
    // set CARGO_TARGET_*_LINKER itself in this Gradle-invoked context, so
    // cargo falls back to the system `cc` (Apple's ld64/lld, which rejects
    // the NDK-oriented GNU-style linker flags rustc passes) — set it
    // explicitly here to the real NDK clang wrapper instead.
    private fun ndkLinkerEnv(target: String, ndkHome: String, minSdk: Int): Pair<String, String>? {
        val (triple, ndkPrefix) = when (target) {
            "aarch64" -> "aarch64-linux-android" to "aarch64-linux-android"
            "armv7" -> "armv7-linux-androideabi" to "armv7a-linux-androideabi"
            "i686" -> "i686-linux-android" to "i686-linux-android"
            "x86_64" -> "x86_64-linux-android" to "x86_64-linux-android"
            else -> return null
        }
        val envVar = "CARGO_TARGET_${triple.uppercase().replace('-', '_')}_LINKER"
        val clang = "$ndkHome/toolchains/llvm/prebuilt/darwin-x86_64/bin/$ndkPrefix$minSdk-clang"
        return envVar to clang
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("run", "--", "tauri", "android", "android-studio-script");

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            // Android Studio's own launched process doesn't inherit the login
            // shell's PATH, so npm/cargo/rustc aren't resolvable by default
            // when this task runs from a Studio-driven Gradle build (as
            // opposed to a CLI-driven `tauri android dev`, which does have a
            // correct PATH already). Prepend the usual toolchain locations.
            val home = System.getenv("HOME")
            val augmentedPath = listOf(
                "$home/.cargo/bin",
                "/usr/local/bin",
                "/opt/homebrew/bin",
                System.getenv("PATH") ?: ""
            ).joinToString(":")
            environment("PATH", augmentedPath)
            val ndkHome = System.getenv("NDK_HOME")
                ?: "${System.getenv("ANDROID_HOME")}/ndk/30.0.15729638"
            ndkLinkerEnv(target, ndkHome, 24)?.let { (envVar, clang) ->
                environment(envVar, clang)
            }
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}