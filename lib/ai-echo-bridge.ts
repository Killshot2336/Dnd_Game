/**
 * AI diagnostic echo bridge — dumps live compiled DOM for automated context capture.
 * Core engine boot hook; console-wrapped JSON for webhook scrapers.
 */

export function initializeAIEchoBridge() {
  // Read our live, compiled single-file document data string directly from the DOM window
  const activeCodePayload = document.documentElement.outerHTML;

  // Format a clean, structured JSON object tracking current file version metadata
  const telemetryData = {
    projectId: 'VoidlineTabletop_V3',
    timestamp: Date.now(),
    liveSource: activeCodePayload,
  };

  // Silently print the raw data stream block wrapper cleanly into the developer console
  console.log('=== AI_BRIDGE_RAW_START ===');
  console.log(JSON.stringify(telemetryData));
  console.log('=== AI_BRIDGE_RAW_END ===');
}

/** Wire the bridge to boot once the main hub panel is on the device window. */
export function bindAIEchoBridge() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initializeAIEchoBridge);
  } else {
    // Hub already painted — echo immediately
    initializeAIEchoBridge();
  }
}
