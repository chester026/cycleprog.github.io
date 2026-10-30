// Build-time configuration. `monkey.jungle` excludes the :dev functions
// (production build), `monkey.dev.jungle` excludes :prod — so exactly one
// baseUrl() survives in any build and the URL never lives in device settings.
import Toybox.Lang;

module Config {
    (:prod)
    function baseUrl() as String {
        return "https://bikelab.app";
    }

    (:dev)
    function baseUrl() as String {
        // The simulator routes web requests through the host machine, so a
        // locally running `server` is reachable here.
        return "http://localhost:8080";
    }

    // How often PairView asks the server whether the phone confirmed the code.
    const POLL_INTERVAL_MS = 3000;

    // Cached home payload older than this is re-fetched on launch.
    const STALE_AFTER_SEC = 15 * 60;

    const DEVICE_LABEL = "Edge";
}
