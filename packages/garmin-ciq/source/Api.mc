// Thin wrapper over Communications.makeWebRequest for /api/garmin/*
// (packages/shared/src/api/contract/garmin.ts is the wire format). Every
// request goes through the phone's Garmin Connect app; a negative
// responseCode means "no phone / no network", a positive one is the HTTP
// status and `data` is the parsed JSON (the server's `{error, code}`
// envelope on failures).
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;

module Api {
    function deviceId() as String {
        var id = System.getDeviceSettings().uniqueIdentifier;
        return id != null ? id : "unknown";
    }

    function deviceName() as String {
        var part = System.getDeviceSettings().partNumber;
        return part != null ? Config.DEVICE_LABEL + " " + part : Config.DEVICE_LABEL;
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
        Communications.makeWebRequest(Config.baseUrl() + path, null, {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :headers => headers(true),
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
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
