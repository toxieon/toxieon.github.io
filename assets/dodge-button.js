/* =========================================================================
 *  dodge-button.js — the runaway "are you sure?" button  (reusable asset)
 *
 *  Turns a button into a cheeky one that cycles messages, shrinks, and finally
 *  dodges the cursor so it can't be clicked — great for a playful "cancel",
 *  a "no thanks", or an Easter egg. Optionally grows a partner button.
 *
 *  No dependencies. Global `NDDodge`:
 *    NDDodge.make(btn, {
 *      messages: [...],        // cycled on each interaction
 *      grow: otherBtnEl,       // optional: this button grows as `btn` shrinks
 *      onGiveUp: fn            // fires once it starts dodging
 *    }) -> { reset }
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDDodge) return;

  function make(btn, opts) {
    if (!btn) return { reset: function () {} };
    opts = opts || {};
    var messages = opts.messages || ["No", "are you sure?", "really sure??", "think again!", "last chance!", "nope!"];
    var grow = opts.grow || null;
    var base = { fontSize: parseFloat(getComputedStyle(btn).fontSize) || 14 };
    var i = 0, dodging = false;

    function dodge() {
      if (!dodging && opts.onGiveUp) opts.onGiveUp();
      dodging = true;
      btn.style.position = "fixed";
      btn.style.left = Math.random() * (root.innerWidth - btn.offsetWidth - 20) + "px";
      btn.style.top = Math.random() * (root.innerHeight - btn.offsetHeight - 20) + "px";
    }
    function bump() {
      i++;
      btn.textContent = messages[Math.min(i, messages.length - 1)];
      var sz = Math.max(6, base.fontSize - i * 0.9);
      btn.style.fontSize = sz + "px";
      var pad = Math.max(4, 14 - i);
      btn.style.padding = pad + "px " + (pad + 4) + "px";
      if (grow) {
        var g = Math.min(3.4, 1 + i * 0.28);
        grow.style.fontSize = (base.fontSize * g) + "px";
        grow.style.padding = (14 * Math.min(2, g)) + "px " + (20 * Math.min(2, g)) + "px";
      }
      if (i >= messages.length - 1) dodge();
    }
    function onEnter() { if (i >= messages.length - 1) dodge(); }
    btn.addEventListener("click", bump);
    btn.addEventListener("mouseenter", onEnter);

    return {
      reset: function () {
        i = 0; dodging = false;
        btn.style.position = ""; btn.style.left = ""; btn.style.top = "";
        btn.style.fontSize = ""; btn.style.padding = "";
        if (grow) { grow.style.fontSize = ""; grow.style.padding = ""; }
        btn.textContent = messages[0];
      }
    };
  }

  var API = { make: make };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDDodge = API;
})(typeof window !== "undefined" ? window : globalThis);
