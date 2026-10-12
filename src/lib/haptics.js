/**
 * haptic() — light tactile feedback for taps, cross-platform.
 *
 * Android / supporting browsers: the standard Vibration API.
 * iOS Safari: has no Vibration API, but iOS 17.4+ fires a *system* haptic
 *   whenever a native `<input type="checkbox" switch>` toggles. We keep one
 *   hidden switch in the DOM and click it to trigger that tap.
 * Anything older / unsupported is a silent no-op.
 */
let iosSwitch = null;

function getIosSwitch() {
  if (iosSwitch || typeof document === "undefined") return iosSwitch;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", ""); // iOS 17.4+ native switch control
  label.appendChild(input);
  document.body.appendChild(label);
  iosSwitch = input;
  return iosSwitch;
}

export function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      if (navigator.vibrate(ms)) return;
    } catch {}
  }
  try {
    getIosSwitch()?.click();
  } catch {}
}
