// A light tick on Android through the Vibration API. It has no strength
// setting, only length, so the pulse is kept short to feel light.
// iPhone has no such API: it ticks only when a finger toggles a native switch,
// so controls that tick there carry a HapticTouch layer (haptic-touch.tsx).
export function haptic(){
  try{if(typeof navigator.vibrate==='function')navigator.vibrate(5);}catch{/* Haptics are a nicety only. */}
}
