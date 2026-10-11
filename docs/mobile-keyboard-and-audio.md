# Chat keyboard and native reply playback

Candidate follows host commit 8522280 (Android push accepted).

The keyboard-avoiding container now includes the entire chat view rather than
only the composer. It uses Android height adjustment and iOS padding, with the
top safe-area inset as its coordinate offset. Android keyboard layout mode is
explicitly resize. The custom bottom navigation hides during native keyboard
visibility and returns after dismissal; desktop navigation remains available.

On native devices, search, attachment and camera actions occupy a separate row
with 44-point targets. The text row has room for the prompt and Send. Native
microphone recording remains pending, so its disabled button is omitted.
The native multiline field caps its height at 140 points and scrolls longer
text. Native message scrolling dismisses the keyboard on drag, while interactive
message actions retain taps. The decorative composer hint hides while typing.

Assistant messages offer Play reply on Android/iOS as well as web. Native
playback uses authenticated speech synthesis with the companion's saved voice,
500-character chunks, private temporary WAV files and expo-audio. Chunks play
in order and files/players are released as each finishes. Stop, conversation
change, tab departure, backgrounding and unmount cancel playback. Later-chunk
errors are surfaced. Audio is requested only after tapping Play; automatic
playback and native voice input remain pending.

No backend, database, notification or dependency changes. The Android build
must use updated app.json keyboard configuration while preserving the isolated
preview package, Firebase file and signing key. No phone acceptance is claimed
until Brett verifies this APK.

Validation: TypeScript, Node tests, chat cache/management component regressions,
and all-platform JS export. New audio tests exercise sequential chunks, saved
voice selection, stop/background cleanup, later failure, late cancellation and
player failure. Native keyboard positioning and audible playback require real
phone validation; JS export cannot verify those behaviors.
