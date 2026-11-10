// Persistent state (Application.Storage): the device token from pairing,
// the last `home` and `week` payloads, so the app opens instantly and works
// without the phone, and which sessions' workout files are on the device. Storage keeps Numbers/Floats/Strings/Booleans/Arrays/Dictionaries —
// `null`s inside the server JSON are dropped before saving (a missing key
// reads back as null anyway).
import Toybox.Application;
import Toybox.Lang;
import Toybox.Time;

module Store {
    const KEY_TOKEN = "token";
    const KEY_HOME = "home";
    const KEY_FETCHED_AT = "fetchedAt";
    const KEY_WEEK = "week";
    // session id (as text) → [version, name of the downloaded workout]
    const KEY_FITS = "fits";

    function token() as String? {
        var t = Application.Storage.getValue(KEY_TOKEN);
        return t instanceof String ? t : null;
    }

    function setToken(t as String) as Void {
        Application.Storage.setValue(KEY_TOKEN, t);
    }

    function home() as Dictionary? {
        var h = Application.Storage.getValue(KEY_HOME);
        return h instanceof Dictionary ? h : null;
    }

    function setHome(h as Dictionary) as Void {
        Application.Storage.setValue(KEY_HOME, stripNulls(h) as Dictionary);
        Application.Storage.setValue(KEY_FETCHED_AT, Time.now().value());
    }

    function fetchedAt() as Number? {
        var v = Application.Storage.getValue(KEY_FETCHED_AT);
        return v instanceof Number ? v : null;
    }

    function week() as Dictionary? {
        var w = Application.Storage.getValue(KEY_WEEK);
        return w instanceof Dictionary ? w : null;
    }

    function setWeek(w as Dictionary) as Void {
        try {
            Application.Storage.setValue(KEY_WEEK, w);
        } catch (e) {
            // A week too large for one storage value is simply not cached:
            // the page still shows it until the app is closed.
        }
    }

    function fits() as Dictionary {
        var f = Application.Storage.getValue(KEY_FITS);
        return f instanceof Dictionary ? f : {};
    }

    function setFits(f as Dictionary) as Void {
        Application.Storage.setValue(KEY_FITS, f);
    }

    // The name of the workout downloaded for this session in this version,
    // or null when it has to be downloaded.
    function fitName(id, version) as String? {
        if (id == null || version == null) {
            return null;
        }
        var entry = fits()[id.toString()];
        if (entry instanceof Array && entry.size() == 2 && version.equals(entry[0])) {
            return entry[1] as String;
        }
        return null;
    }

    function rememberFit(id, version, name) as Void {
        if (id == null || version == null || name == null) {
            return;
        }
        var f = fits();
        f[id.toString()] = [version, name];
        setFits(f);
    }

    function clear() as Void {
        Application.Storage.deleteValue(KEY_TOKEN);
        Application.Storage.deleteValue(KEY_HOME);
        Application.Storage.deleteValue(KEY_FETCHED_AT);
        Application.Storage.deleteValue(KEY_WEEK);
        Application.Storage.deleteValue(KEY_FITS);
    }

    function stripNulls(v) {
        if (v instanceof Dictionary) {
            var out = {};
            var keys = v.keys();
            for (var i = 0; i < keys.size(); i++) {
                var val = v[keys[i]];
                if (val != null) {
                    out[keys[i]] = stripNulls(val);
                }
            }
            return out;
        }
        if (v instanceof Array) {
            var arr = [];
            for (var i = 0; i < v.size(); i++) {
                if (v[i] != null) {
                    arr.add(stripNulls(v[i]));
                }
            }
            return arr;
        }
        return v;
    }
}
