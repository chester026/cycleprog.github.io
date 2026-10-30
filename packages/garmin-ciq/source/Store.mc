// Persistent state (Application.Storage): the device token from pairing and
// the last `home` payload, so the app opens instantly and works without the
// phone. Storage keeps Numbers/Floats/Strings/Booleans/Arrays/Dictionaries —
// `null`s inside the server JSON are dropped before saving (a missing key
// reads back as null anyway).
import Toybox.Application;
import Toybox.Lang;
import Toybox.Time;

module Store {
    const KEY_TOKEN = "token";
    const KEY_HOME = "home";
    const KEY_FETCHED_AT = "fetchedAt";

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

    function clear() as Void {
        Application.Storage.deleteValue(KEY_TOKEN);
        Application.Storage.deleteValue(KEY_HOME);
        Application.Storage.deleteValue(KEY_FETCHED_AT);
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
