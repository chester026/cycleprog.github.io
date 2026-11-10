// Thin wrapper over Communications.makeWebRequest for /api/garmin/*
// (packages/shared/src/api/contract/garmin.ts is the wire format). Every
// request goes through the phone's Garmin Connect app; a negative
// responseCode means "no phone / no network", a positive one is the HTTP
// status and `data` is the parsed JSON (the server's `{error, code}`
// envelope on failures).
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

module Api {
    function deviceId() as String {
        var id = System.getDeviceSettings().uniqueIdentifier;
        return id != null ? id : "unknown";
    }

    // "Edge 1040" / "Edge 1050" from the product-specific resources
    // (resources-edge1040/, resources-edge1050/); the generic fallback is
    // "Garmin Edge". partNumber alone ("006-B3843-00") meant nothing to the
    // rider in the phone's device list.
    function deviceName() as String {
        return WatchUi.loadResource(Rez.Strings.DeviceName) as String;
    }

    function headers(withToken as Boolean) as Dictionary {
        var h = { "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON };
        if (withToken) {
            var t = Store.token();
            if (t != null) {
                h["Authorization"] = "Bearer " + t;
            }
        }
        return h;
    }

    function post(path as String, body as Dictionary?, withToken as Boolean, cb as Method) as Void {
        Communications.makeWebRequest(Config.baseUrl() + path, body, {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => headers(withToken),
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, cb);
    }

    function get(path as String, cb as Method) as Void {
        getWith(path, null, cb);
    }

    // GET with query parameters: the device appends `params` to the URL.
    function getWith(path as String, params as Dictionary?, cb as Method) as Void {
        Communications.makeWebRequest(Config.baseUrl() + path, params, {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :headers => headers(true),
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, cb);
    }

    // A session's FIT workout file. The device saves the file itself and
    // the callback gets an iterator over what it saved (Workouts.asIterator)
    // — not JSON. Only the Authorization header: a JSON Content-Type on a
    // FIT request is known to break on real devices while working in the
    // simulator.
    function getFit(path as String, cb as Method) as Void {
        var h = {};
        var t = Store.token();
        if (t != null) {
            h["Authorization"] = "Bearer " + t;
        }
        Communications.makeWebRequest(Config.baseUrl() + path, null, {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :headers => h,
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_FIT
        }, cb);
    }

    function del(path as String, cb as Method) as Void {
        Communications.makeWebRequest(Config.baseUrl() + path, null, {
            :method => Communications.HTTP_REQUEST_METHOD_DELETE,
            :headers => headers(true),
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, cb);
    }

    function isNetworkError(responseCode as Number) as Boolean {
        return responseCode < 0;
    }
}
