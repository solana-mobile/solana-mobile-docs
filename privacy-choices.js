/**
 * CCPA "Your Privacy Choices" footer control.
 *
 * Mintlify footer links are plain anchors, so this script upgrades every
 * "Your Privacy Choices" link (docs.json footer and the homepage footer) in
 * place into the OneTrust settings control (`.ot-sdk-show-settings`) with the
 * CCPA opt-out icon beside it. The anchor is kept, not replaced, because React
 * owns the footer DOM and re-renders it on navigation. OneTrust itself is
 * loaded by the Google Tag Manager container.
 */
(function () {
  var LABEL = "Your Privacy Choices";
  var ICON_SRC = "/images/ccpa-opt-out-icon.svg";
  var ICON_ALT = "California Consumer Privacy Act (CCPA) Opt-Out Icon";

  function preferenceCenterOpen() {
    var pc = document.getElementById("onetrust-pc-sdk");
    return !!pc && window.getComputedStyle(pc).display !== "none";
  }

  function openPrivacyChoices(event) {
    if (
      !window.OneTrust ||
      typeof window.OneTrust.ToggleInfoDisplay !== "function"
    ) {
      return; // No OneTrust: let the link fall through to the Cookie Policy.
    }
    event.preventDefault();
    // OneTrust also binds a toggle to `.ot-sdk-show-settings` when it
    // initialises. Make sure the two handlers never cancel each other out.
    event.stopImmediatePropagation();
    if (!preferenceCenterOpen()) {
      window.OneTrust.ToggleInfoDisplay();
    }
  }

  function makeIcon() {
    var icon = document.createElement("img");
    icon.src = ICON_SRC;
    icon.alt = ICON_ALT;
    icon.width = 30;
    icon.height = 14;
    icon.className = "ccpa-opt-out-icon";
    return icon;
  }

  function upgrade(link) {
    if (!link.classList.contains("ot-sdk-show-settings")) {
      link.classList.add("ot-sdk-show-settings");
      link.removeAttribute("target");
      link.addEventListener("click", openPrivacyChoices);
    }
    if (!link.querySelector(".ccpa-opt-out-icon")) {
      link.insertBefore(makeIcon(), link.firstChild);
    }
  }

  function upgradeAll() {
    var anchors = document.querySelectorAll("a");
    for (var i = 0; i < anchors.length; i++) {
      if (anchors[i].textContent.trim() === LABEL) {
        upgrade(anchors[i]);
      }
    }
  }

  upgradeAll();

  // Mintlify re-renders the footer on client-side navigation.
  new MutationObserver(upgradeAll).observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
