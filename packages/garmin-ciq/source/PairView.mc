// First-run screen: asks the server for a 6-digit code, shows it, and polls
// until the rider types it into the BikeLab app (Settings → Garmin). On
// success the device token is stored and HomeView takes over.
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Timer;
import Toybox.WatchUi;

class PairView extends WatchUi.View {
    // :starting | :waiting | :noPhone | :failed | :expired
    var status as Symbol = :starting;
    var code as String? = null;

    private var _pollKey as String? = null;
    private var _timer as Timer.Timer = new Timer.Timer();
    private var _polling as Boolean = false;
    private var _symbol as BitmapResource? = null;
    private var _tagline as BitmapResource? = null;

    function initialize() {
        View.initialize();
        _symbol = WatchUi.loadResource(Rez.Drawables.Symbol) as BitmapResource;
        _tagline = WatchUi.loadResource(Rez.Drawables.Tagline) as BitmapResource;
    }

    function onShow() as Void {
        if (_pollKey == null) {
            start();
        }
    }

    function onHide() as Void {
        _timer.stop();
    }

    function start() as Void {
        _timer.stop();
        status = :starting;
        code = null;
        _pollKey = null;
        WatchUi.requestUpdate();
        Api.post("/api/garmin/pair/start", {
            "device_id" => Api.deviceId(),
            "device_name" => Api.deviceName()
        }, false, method(:onStart));
    }

    function onStart(responseCode as Number, data as Dictionary or String or Null) as Void {
        if (responseCode == 200 && data instanceof Dictionary) {
            code = data["code"] as String;
            _pollKey = data["poll_key"] as String;
            status = :waiting;
            _timer.start(method(:poll), Config.POLL_INTERVAL_MS, true);
        } else {
            status = Api.isNetworkError(responseCode) ? :noPhone : :failed;
        }
        WatchUi.requestUpdate();
    }

    function poll() as Void {
        if (_pollKey == null || _polling) {
            return;
        }
        _polling = true;
        Api.post("/api/garmin/pair/poll", { "poll_key" => _pollKey }, false, method(:onPoll));
    }

    function onPoll(responseCode as Number, data as Dictionary or String or Null) as Void {
        _polling = false;
        if (responseCode == 200 && data instanceof Dictionary) {
            if ("ok".equals(data["status"])) {
                _timer.stop();
                Store.setToken(data["token"] as String);
                var home = new HomeView();
                WatchUi.switchToView(home, new HomeDelegate(home), WatchUi.SLIDE_LEFT);
            }
            // "pending": keep polling.
        } else if (responseCode == 410) {
            _timer.stop();
            status = :expired;
            WatchUi.requestUpdate();
        }
        // Negative codes (phone out of range): keep polling, the code is
        // still valid server-side for ten minutes.
    }

    // Tap / select: retry when something went wrong.
    function retry() as Void {
        if (status == :noPhone || status == :failed || status == :expired) {
            start();
        }
    }

    function onUpdate(dc as Dc) as Void {
        Ui.clear(dc);
        var h = dc.getHeight();
        var y = h / 10;

        var cx = dc.getWidth() / 2;
        var sym = _symbol;
        if (sym != null) {
            dc.drawBitmap(cx - sym.getWidth() / 2, y, sym);
            y += sym.getHeight() + 16;
        }
        Ui.center(dc, y, Graphics.FONT_SMALL, Ui.str(Rez.Strings.PairTitle), Ui.FG);
        y += dc.getFontHeight(Graphics.FONT_SMALL) + 6;
        Ui.center(dc, y, Graphics.FONT_XTINY, Ui.str(Rez.Strings.PairHint), Ui.DIM);

        var mid = h / 2;
        if (status == :waiting && code != null) {
            Ui.center(dc, mid - dc.getFontHeight(Graphics.FONT_NUMBER_HOT) / 2 - 24, Graphics.FONT_TINY, Ui.str(Rez.Strings.PairEnterCode), Ui.DIM);
            Ui.center(dc, mid - dc.getFontHeight(Graphics.FONT_NUMBER_HOT) / 2, Graphics.FONT_NUMBER_HOT, spaced(code), Ui.ACCENT);
            Ui.center(dc, mid + dc.getFontHeight(Graphics.FONT_NUMBER_HOT) / 2 + 8, Graphics.FONT_XTINY, Ui.str(Rez.Strings.PairWaiting), Ui.DIM);
        } else if (status == :starting) {
            Ui.center(dc, mid - dc.getFontHeight(Graphics.FONT_SMALL) / 2, Graphics.FONT_SMALL, Ui.str(Rez.Strings.Loading), Ui.DIM);
        } else {
            var id = status == :noPhone ? Rez.Strings.PairNoPhone : (status == :expired ? Rez.Strings.PairExpired : Rez.Strings.PairFailed);
            Ui.center(dc, mid - dc.getFontHeight(Graphics.FONT_SMALL) / 2, Graphics.FONT_SMALL, Ui.str(id), Ui.BAD);
        }
        var tag = _tagline;
        var footY = h - h / 8 - dc.getFontHeight(Graphics.FONT_XTINY);
        if (tag != null) {
            dc.drawBitmap(cx - tag.getWidth() / 2, footY - tag.getHeight() - 6, tag);
        }
        Ui.center(dc, footY, Graphics.FONT_XTINY, Config.baseUrl(), Ui.FAINT);
    }

    // "482913" → "482 913": easier to read across the room from the stem.
    private function spaced(c as String) as String {
        if (c.length() != 6) {
            return c;
        }
        return c.substring(0, 3) + " " + c.substring(3, 6);
    }
}

class PairDelegate extends WatchUi.BehaviorDelegate {
    private var _view as PairView;

    function initialize(view as PairView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onSelect() as Boolean {
        _view.retry();
        return true;
    }

    function onTap(evt as ClickEvent) as Boolean {
        _view.retry();
        return true;
    }
}
