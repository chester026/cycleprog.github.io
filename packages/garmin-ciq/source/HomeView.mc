// Paged home screen. First the primary bike's garage (mileage, next
// service, most worn parts). Then the week's planned sessions with their
// block profiles — as many pages as the week needs; tap a session to open
// it (SessionView) and start it on the Edge. Then the last ride + its impact
// on goals, and one page per active meta-goal with its sub-goals (the order
// is the owner's, 10.11.2026). Swipe /
// Up-Down to page, tap / Select to refresh (on a week page: to open a
// session), hold / Menu for Refresh + Unpair.
//
// Data is two payloads cached in Store, re-fetched on launch when stale and
// on demand, one after the other: `GET /api/garmin/home` and
// `GET /api/garmin/week` (contract/garmin.ts — short keys by design). A 401
// means the device was unpaired from the phone: the token is dropped and
// PairView comes back.
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Time;
import Toybox.WatchUi;

class HomeView extends WatchUi.View {
    var page as Number = 0;
    var loading as Boolean = false;
    var error as String? = null;

    private var _home as Dictionary? = null;
    private var _week as Dictionary? = null;
    // The week page's rows as last drawn: [top, bottom, day, session].
    private var _weekRows as Array = [];
    // Sessions that fit on one week page — measured when the page is drawn,
    // a guess until then.
    private var _weekPerPage as Number = 3;
    // Whether the week has been asked for since launch — a server that does
    // not have the route yet is not asked again on every return to this view.
    private var _weekAsked as Boolean = false;
    private var _symbol as BitmapResource? = null;

    function initialize() {
        View.initialize();
        _home = Store.home();
        _week = Store.week();
        _symbol = WatchUi.loadResource(Rez.Drawables.SymbolSmall) as BitmapResource;
    }

    function onShow() as Void {
        var at = Store.fetchedAt();
        if (_home == null || weekIsStale() || at == null || Time.now().value() - at > Config.STALE_AFTER_SEC) {
            refresh();
        }
    }

    // No week yet (and not asked for), or one fetched on an earlier day.
    private function weekIsStale() as Boolean {
        var week = _week;
        if (week == null) {
            return !_weekAsked;
        }
        return !Workouts.today().equals(week["from"]);
    }

    // --- data ---------------------------------------------------------------

    function goals() as Array {
        var home = _home;
        if (home == null) {
            return [];
        }
        var g = home["goals"];
        return g instanceof Array ? g : [];
    }

    function lastRide() as Dictionary? {
        var home = _home;
        if (home == null) {
            return null;
        }
        var l = home["last"];
        return l instanceof Dictionary ? l : null;
    }

    function bike() as Dictionary? {
        var home = _home;
        if (home == null) {
            return null;
        }
        var b = home["bike"];
        return b instanceof Dictionary ? b : null;
    }

    // The sessions from today on, in order: [[day, session], …]. A cached
    // week opened on a later day simply starts later.
    function sessions() as Array {
        var out = [];
        var week = _week;
        if (week == null) {
            return out;
        }
        var days = week["days"];
        if (!(days instanceof Array)) {
            return out;
        }
        var today = Workouts.dayNumber(Workouts.today());
        for (var i = 0; i < days.size(); i++) {
            var day = days[i] as Dictionary;
            var date = day["d"];
            var list = day["ev"];
            if (!(date instanceof String) || !(list instanceof Array) || Workouts.dayNumber(date) < today) {
                continue;
            }
            for (var j = 0; j < list.size(); j++) {
                out.add([date, list[j]]);
            }
        }
        return out;
    }

    // The week is one page, or more when it has more sessions than fit.
    function weekPages() as Number {
        var per = _weekPerPage > 0 ? _weekPerPage : 1;
        var pages = (sessions().size() + per - 1) / per;
        return pages < 1 ? 1 : pages;
    }

    // Pages: garage | week × weekPages() | last ride | one per goal.
    const WEEK_FIRST_PAGE = 1;
    const FIXED_PAGES = 2; // garage, last ride

    function onWeekPage() as Boolean {
        return page >= WEEK_FIRST_PAGE && page < WEEK_FIRST_PAGE + weekPages();
    }

    function pageCount() as Number {
        return weekPages() + FIXED_PAGES + goals().size();
    }

    function nextPage() as Void {
        page = (page + 1) % pageCount();
        WatchUi.requestUpdate();
    }

    function prevPage() as Void {
        page = (page + pageCount() - 1) % pageCount();
        WatchUi.requestUpdate();
    }

    function refresh() as Void {
        if (loading) {
            return;
        }
        loading = true;
        error = null;
        WatchUi.requestUpdate();
        Api.get("/api/garmin/home", method(:onHome));
    }

    function onHome(responseCode as Number, data as Dictionary or String or Null) as Void {
        loading = false;
        if (responseCode == 200 && data instanceof Dictionary) {
            _home = data;
            Store.setHome(data);
            if (page >= pageCount()) {
                page = 0;
            }
            // Then the week — one request at a time through the phone.
            loading = true;
            Api.getWith("/api/garmin/week", { "from" => Workouts.today() }, method(:onWeek));
        } else if (responseCode == 401) {
            backToPairing();
            return;
        } else if (Api.isNetworkError(responseCode)) {
            error = Ui.str(Rez.Strings.ErrorNetwork);
        } else {
            error = "HTTP " + responseCode;
        }
        WatchUi.requestUpdate();
    }

    function onWeek(responseCode as Number, data as Dictionary or String or Null) as Void {
        loading = false;
        _weekAsked = true;
        if (responseCode == 200 && data instanceof Dictionary) {
            _week = data;
            Store.setWeek(data);
            Workouts.cleanup(data);
        } else if (responseCode == 401) {
            backToPairing();
            return;
        } else if (Api.isNetworkError(responseCode)) {
            error = Ui.str(Rez.Strings.ErrorNetwork);
        }
        // Any other answer (a server without this route yet): the page keeps
        // what it had, the rest of the app is unaffected.
        WatchUi.requestUpdate();
    }

    // --- week page ----------------------------------------------------------

    private function openSession(day as String, session as Dictionary) as Void {
        var view = new SessionView(day, session);
        WatchUi.pushView(view, new SessionDelegate(view), WatchUi.SLIDE_LEFT);
    }

    // A tap at height `y` on the week page: opens the session drawn there.
    function tapWeek(y as Number) as Boolean {
        for (var i = 0; i < _weekRows.size(); i++) {
            var row = _weekRows[i] as Array;
            if (y >= (row[0] as Number) && y < (row[1] as Number)) {
                openSession(row[2] as String, row[3] as Dictionary);
                return true;
            }
        }
        return false;
    }

    // Select on the week page: opens the next session still to ride.
    function openNext() as Boolean {
        var list = sessions();
        for (var i = 0; i < list.size(); i++) {
            var entry = list[i] as Array;
            var session = entry[1] as Dictionary;
            if (session["done"] != true) {
                openSession(entry[0] as String, session);
                return true;
            }
        }
        return false;
    }

    function unpair() as Void {
        Api.del("/api/garmin/pair", method(:onUnpair));
    }

    function onUnpair(responseCode as Number, data as Dictionary or String or Null) as Void {
        // Whatever the server said, the device forgets the token; a token the
        // server still considers live gets revoked on its next use anyway.
        backToPairing();
    }

    private function backToPairing() as Void {
        Store.clear();
        var pair = new PairView();
        WatchUi.switchToView(pair, new PairDelegate(pair), WatchUi.SLIDE_RIGHT);
    }

    // --- drawing ------------------------------------------------------------

    function onUpdate(dc as Dc) as Void {
        Ui.clear(dc);
        if (_home == null && _week == null) {
            Ui.center(dc, dc.getHeight() / 2 - dc.getFontHeight(Graphics.FONT_SMALL) / 2, Graphics.FONT_SMALL,
                loading ? Ui.str(Rez.Strings.Loading) : (error != null ? error : Ui.str(Rez.Strings.NoGoals)), Ui.DIM);
            return;
        }
        var weekCount = weekPages();
        if (page == 0) {
            drawGarage(dc);
        } else if (page < WEEK_FIRST_PAGE + weekCount) {
            drawWeek(dc, page - WEEK_FIRST_PAGE);
            // Drawing measures how many sessions fit; with fewer pages than
            // before this one may no longer exist.
            if (page >= WEEK_FIRST_PAGE + weekPages()) {
                page = WEEK_FIRST_PAGE + weekPages() - 1;
                Ui.clear(dc);
                drawWeek(dc, page - WEEK_FIRST_PAGE);
            }
        } else if (page == WEEK_FIRST_PAGE + weekCount) {
            drawLastRide(dc);
        } else {
            var g = goals();
            var index = page - weekCount - FIXED_PAGES;
            if (index < g.size()) {
                drawGoal(dc, g[index] as Dictionary);
            }
        }
        drawFooter(dc);
    }

    // One page of the week. The header is laid out
    // exactly like the garage page's (label, title, subline, the mark on the
    // right — owner, 10.11.2026): "Planned" / the time still to ride /
    // "This week". Under it a white card per session: day and length, the
    // session's headline, the block profile. A finished session is greyed.
    // `weekPage` is which slice of the sessions to show.
    private function drawWeek(dc as Dc, weekPage as Number) as Void {
        var w = dc.getWidth();
        var m = w / 12;
        var y = m;
        var list = sessions();
        _weekRows = [];
        var smallH = dc.getFontHeight(Graphics.FONT_XTINY);

        // The time still to ride this week.
        var planned = 0;
        for (var i = 0; i < list.size(); i++) {
            var s = (list[i] as Array)[1] as Dictionary;
            var mins = s["min"];
            if (s["done"] != true && mins instanceof Number) {
                planned += mins;
            }
        }

        var titleMax = drawBrandMark(dc, w, m, y);
        Ui.left(dc, m, y, Graphics.FONT_XTINY, Ui.str(Rez.Strings.Planned), Ui.DIM);
        y += smallH + 2;
        Ui.left(dc, m, y, Graphics.FONT_SMALL, Ui.fit(dc, Workouts.duration(planned), Graphics.FONT_SMALL, titleMax), Ui.FG);
        y += dc.getFontHeight(Graphics.FONT_SMALL);
        Ui.left(dc, m, y, Graphics.FONT_XTINY, Ui.str(Rez.Strings.Week), Ui.DIM);
        y += smallH + 12;

        if (list.size() == 0) {
            Ui.left(dc, m, y, Graphics.FONT_SMALL, Ui.fit(dc, Ui.str(Rez.Strings.NoSessions), Graphics.FONT_SMALL, w - 2 * m), Ui.FG);
            y += dc.getFontHeight(Graphics.FONT_SMALL) + 2;
            Ui.left(dc, m, y, Graphics.FONT_XTINY, Ui.str(Rez.Strings.NoSessionsHint), Ui.DIM);
            return;
        }

        // The session's headline in the size of the goal titles on the
        // last-ride page: the smallest font read too small on the real Edge
        // (owner, 10.11.2026).
        var titleFont = Graphics.FONT_TINY;
        var titleH = dc.getFontHeight(titleFont);
        var profileH = dc.getHeight() / 18;
        // A card, kept tight so that four sessions fit an Edge 1040 page
        // (owner, 10.11.2026): 9 above the day line so the text does not
        // press into the card's edge, 6 under the profile, 10 at the sides
        // (the text keeps the page margin, the card reaches past it); the
        // profile sits close under the headline it belongs to.
        var padTop = 9;
        var padBottom = 6;
        var padSide = 10;
        var cardGap = 4;
        var lineGap = 3;
        var profileGap = 3;
        var cardH = padTop + smallH + lineGap + titleH + profileGap + profileH + padBottom;
        var limit = dc.getHeight() - dc.getHeight() / 8;
        // How many sessions a page holds; the rest go on further week pages
        // (pageCount follows).
        var perPage = (limit - y + cardGap) / (cardH + cardGap);
        _weekPerPage = perPage < 1 ? 1 : perPage;

        var first = weekPage * _weekPerPage;
        for (var i = first; i < list.size() && i < first + _weekPerPage; i++) {
            var entry = list[i] as Array;
            var day = entry[0] as String;
            var session = entry[1] as Dictionary;
            var blocks = session["b"];
            var hasProfile = blocks instanceof Array && blocks.size() > 0;
            var done = session["done"] == true;
            var top = y;
            var thisH = hasProfile ? cardH : cardH - profileGap - profileH;

            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(m - padSide, y, w - 2 * (m - padSide), thisH, 10);
            dc.setColor(Ui.CARD_EDGE, Graphics.COLOR_TRANSPARENT);
            dc.drawRoundedRectangle(m - padSide, y, w - 2 * (m - padSide), thisH, 10);

            y += padTop;
            var isToday = Workouts.dayNumber(day) == Workouts.dayNumber(Workouts.today());
            // "Today · 1 h 1 min" on one line from the left; only the day
            // takes the accent.
            var dayText = Workouts.dayLabel(day);
            Ui.left(dc, m, y, Graphics.FONT_XTINY, dayText, done ? Ui.FAINT : (isToday ? Ui.ACCENT : Ui.DIM));
            var minutes = session["min"];
            if (minutes instanceof Number && minutes > 0) {
                var dayW = dc.getTextWidthInPixels(dayText, Graphics.FONT_XTINY);
                Ui.left(dc, m + dayW, y, Graphics.FONT_XTINY, " · " + Workouts.duration(minutes), done ? Ui.FAINT : Ui.DIM);
            }
            y += smallH + lineGap;
            Ui.left(dc, m, y, titleFont, Ui.fit(dc, session["t"] as String, titleFont, w - 2 * m), done ? Ui.FAINT : Ui.FG);
            y += titleH;
            if (hasProfile) {
                y += profileGap;
                Workouts.drawProfile(dc, m, y, w - 2 * m, profileH, blocks as Array, false, done);
            }
            y = top + thisH + cardGap;
            _weekRows.add([top, y, day, session]);
        }
    }

    private function drawLastRide(dc as Dc) as Void {
        var w = dc.getWidth();
        var m = w / 12;
        var y = m;
        var ride = lastRide();

        var titleMax = drawBrandMark(dc, w, m, y);
        Ui.left(dc, m, y, Graphics.FONT_XTINY, Ui.str(Rez.Strings.LastRide), Ui.DIM);
        y += dc.getFontHeight(Graphics.FONT_XTINY) + 2;
        if (ride == null) {
            Ui.left(dc, m, y, Graphics.FONT_SMALL, Ui.str(Rez.Strings.NoRide), Ui.FG);
            return;
        }

        Ui.left(dc, m, y, Graphics.FONT_SMALL, Ui.fit(dc, ride["n"] as String, Graphics.FONT_SMALL, titleMax), Ui.FG);
        y += dc.getFontHeight(Graphics.FONT_SMALL);
        Ui.left(dc, m, y, Graphics.FONT_XTINY, ride["d"] as String, Ui.DIM);
        y += dc.getFontHeight(Graphics.FONT_XTINY) + 8;

        // km · m · min on one line, big numbers.
        var third = (w - 2 * m) / 3;
        drawStat(dc, m, y, third, Ui.num(ride["km"], 1), "km");
        drawStat(dc, m + third, y, third, Ui.num(ride["m"], 0), "m");
        drawStat(dc, m + 2 * third, y, third, Ui.num(ride["min"], 0), "min");
        y += dc.getFontHeight(Graphics.FONT_NUMBER_MILD) + dc.getFontHeight(Graphics.FONT_XTINY) + 10;

        Ui.left(dc, m, y, Graphics.FONT_SMALL, Ui.str(Rez.Strings.Impact), Ui.FG);
        y += dc.getFontHeight(Graphics.FONT_SMALL) + 8;

        var impact = ride["impact"];
        if (!(impact instanceof Array) || impact.size() == 0) {
            Ui.left(dc, m, y, Graphics.FONT_TINY, Ui.str(Rez.Strings.NoImpact), Ui.DIM);
            return;
        }
        var titles = goalTitles();
        // Garmin system fonts come in fixed steps. XTINY was tried for the
        // goal titles (22.10) and read too small on the real Edge 1040
        // (owner, 30.10) — TINY, same as the goal page's sub-goal rows.
        var titleFont = Graphics.FONT_TINY;
        var lineH = dc.getFontHeight(titleFont);
        var smallH = dc.getFontHeight(Graphics.FONT_XTINY);
        var limit = dc.getHeight() - dc.getHeight() / 8;
        for (var i = 0; i < impact.size() && y + lineH + smallH < limit; i++) {
            var row = impact[i] as Dictionary;
            var title = titles[row["id"]];
            var gainText = "+" + Ui.num(row["gain"], 0) + "%";
            var gainW = dc.getTextWidthInPixels(gainText, titleFont) + 8;
            Ui.left(dc, m, y, titleFont, Ui.fit(dc, title != null ? title as String : "#" + row["id"], titleFont, w - 2 * m - gainW), Ui.FG);
            Ui.right(dc, w - m, y, titleFont, gainText, Ui.GOOD);
            y += lineH;
            var contribs = row["c"];
            if (contribs instanceof Array) {
                var line = "";
                for (var j = 0; j < contribs.size(); j++) {
                    var c = contribs[j] as Dictionary;
                    line += (j > 0 ? "  " : "") + (c["l"] as String) + " " + (c["v"] as String);
                }
                Ui.left(dc, m, y, Graphics.FONT_XTINY, Ui.fit(dc, line, Graphics.FONT_XTINY, w - 2 * m), Ui.DIM);
                y += smallH + 10;
            }
        }
    }

    // Brand mark top-right, spanning the label + title lines of a page.
    // Returns the width left for the title next to it.
    private function drawBrandMark(dc as Dc, w as Number, m as Number, y as Number) as Number {
        var sym = _symbol;
        if (sym == null) {
            return w - 2 * m;
        }
        dc.drawBitmap(w - m - sym.getWidth(), y, sym);
        return w - 2 * m - sym.getWidth() - 8;
    }

    private function statusTone(status) as Number {
        if ("critical".equals(status)) {
            return Ui.BAD;
        }
        if ("attention".equals(status) || "warning".equals(status)) {
            return Ui.WARN;
        }
        return Ui.GOOD;
    }

    private function drawStat(dc as Dc, x as Number, y as Number, w as Number, value as String, unit as String) as Void {
        Ui.boldLeft(dc, x, y, Graphics.FONT_NUMBER_MILD, value, Ui.FG);
        Ui.left(dc, x, y + dc.getFontHeight(Graphics.FONT_NUMBER_MILD) - 4, Graphics.FONT_XTINY, unit, Ui.DIM);
    }

    private function drawGarage(dc as Dc) as Void {
        var w = dc.getWidth();
        var m = w / 12;
        var y = m;
        var b = bike();

        var titleMax = drawBrandMark(dc, w, m, y);
        Ui.left(dc, m, y, Graphics.FONT_XTINY, Ui.str(Rez.Strings.Garage), Ui.DIM);
        y += dc.getFontHeight(Graphics.FONT_XTINY) + 2;
        if (b == null) {
            Ui.left(dc, m, y, Graphics.FONT_SMALL, Ui.str(Rez.Strings.NoBike), Ui.FG);
            return;
        }
        Ui.left(dc, m, y, Graphics.FONT_SMALL, Ui.fit(dc, b["n"] as String, Graphics.FONT_SMALL, titleMax), Ui.FG);
        y += dc.getFontHeight(Graphics.FONT_SMALL);
        // Ride count as the subline under the name, like the date under a ride.
        Ui.left(dc, m, y, Graphics.FONT_XTINY, Ui.num(b["r"], 0) + " " + Ui.str(Rez.Strings.Rides), Ui.DIM);
        y += dc.getFontHeight(Graphics.FONT_XTINY) + 8;

        // Mileage and overall health, side by side.
        var half = (w - 2 * m) / 2;
        drawStat(dc, m, y, half, Ui.num(b["km"], 0), "km");
        drawStat(dc, m + half, y, half, Ui.num(b["h"], 0) + "%", Ui.str(Rez.Strings.Health));
        y += dc.getFontHeight(Graphics.FONT_NUMBER_MILD) + dc.getFontHeight(Graphics.FONT_XTINY) + 10;

        var next = b["next"];
        if (next instanceof Dictionary) {
            Ui.left(dc, m, y, Graphics.FONT_XTINY, Ui.str(Rez.Strings.NextService), Ui.DIM);
            y += dc.getFontHeight(Graphics.FONT_XTINY) + 2;
            // Name + a status dot after it, km on the right — all ink; the
            // dot alone carries the urgency.
            var nextKm = Ui.num(next["km"], 0) + " " + Ui.str(Rez.Strings.KmLeft);
            var nextW = dc.getTextWidthInPixels(nextKm, Graphics.FONT_TINY) + 8;
            var dotR = 4;
            var textX = m + dotR * 2 + 8;
            var status = next["s"];
            if (status == null) {
                // Older payload without `s`: judge by the km left.
                var kmLeft = next["km"] as Number;
                status = kmLeft <= 0 ? "critical" : (kmLeft < 500 ? "warning" : "good");
            }
            dc.setColor(statusTone(status), Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(m + dotR, y + dc.getFontHeight(Graphics.FONT_TINY) / 2, dotR);
            var nextName = Ui.fit(dc, next["c"] as String, Graphics.FONT_TINY, w - m - textX - nextW);
            Ui.left(dc, textX, y, Graphics.FONT_TINY, nextName, Ui.FG);
            Ui.right(dc, w - m, y, Graphics.FONT_TINY, nextKm, Ui.FG);
            y += dc.getFontHeight(Graphics.FONT_TINY) + 14;
        }

        var parts = b["parts"];
        if (!(parts instanceof Array)) {
            return;
        }
        // TINY, same size as the goal page's sub-goal rows (XTINY read too
        // small on the device — owner, 30.10); fewer parts fit, the limit
        // below trims the list.
        var partFont = Graphics.FONT_TINY;
        var lineH = dc.getFontHeight(partFont);
        var limit = dc.getHeight() - dc.getHeight() / 8;
        var nextName = next instanceof Dictionary ? next["c"] : null;
        for (var i = 0; i < parts.size() && y + lineH + 20 < limit; i++) {
            var part = parts[i] as Dictionary;
            if (nextName != null && nextName.equals(part["c"])) {
                continue; // older payloads repeat the next-service part here
            }
            var status = part["s"];
            var tone = Ui.ACCENT;
            var word = Ui.str(Rez.Strings.StatusGood);
            if ("critical".equals(status)) {
                tone = Ui.BAD;
                word = Ui.str(Rez.Strings.StatusCritical);
            } else if ("attention".equals(status)) {
                tone = Ui.WARN;
                word = Ui.str(Rez.Strings.StatusAttention);
            } else if ("warning".equals(status)) {
                tone = Ui.WARN;
                word = Ui.str(Rez.Strings.StatusWarning);
            }
            var right = Ui.num(part["pct"], 0) + "% · " + word;
            var rightW = dc.getTextWidthInPixels(right, partFont) + 8;
            Ui.left(dc, m, y, partFont, Ui.fit(dc, part["c"] as String, partFont, w - 2 * m - rightW), Ui.FG);
            Ui.right(dc, w - m, y, partFont, right, "good".equals(status) ? Ui.DIM : tone);
            y += lineH + 4;
            Ui.bar(dc, m, y, w - 2 * m, 5, part["pct"] as Number, tone);
            y += 18;
        }
    }

    private function drawGoal(dc as Dc, g as Dictionary) as Void {
        var w = dc.getWidth();
        var m = w / 12;
        var y = m;
        var ok = g["ok"] == true;

        Ui.left(dc, m, y, Graphics.FONT_XTINY, Ui.str(Rez.Strings.Goals), Ui.DIM);
        y += dc.getFontHeight(Graphics.FONT_XTINY) + 2;
        var titleLines = Ui.wrap(dc, g["t"] as String, Graphics.FONT_SMALL, w - 2 * m, 2);
        for (var li = 0; li < titleLines.size(); li++) {
            Ui.left(dc, m, y, Graphics.FONT_SMALL, titleLines[li] as String, Ui.FG);
            y += dc.getFontHeight(Graphics.FONT_SMALL);
        }
        y += 4;

        var tone = ok ? Ui.GOOD : Ui.WARN;
        Ui.left(dc, m, y, Graphics.FONT_NUMBER_MEDIUM, Ui.num(g["pct"], 0) + "%", Ui.FG);
        var days = g["days"];
        var statusWord = ok ? Ui.str(Rez.Strings.OnTrack) : Ui.str(Rez.Strings.Behind);
        var lineY = y + dc.getFontHeight(Graphics.FONT_NUMBER_MEDIUM) - dc.getFontHeight(Graphics.FONT_XTINY) - 4;
        Ui.right(dc, w - m, lineY, Graphics.FONT_XTINY, statusWord, tone);
        if (days != null) {
            var statusW = dc.getTextWidthInPixels(statusWord, Graphics.FONT_XTINY);
            Ui.right(dc, w - m - statusW, lineY, Graphics.FONT_XTINY, days.toString() + " " + Ui.str(Rez.Strings.DaysLeft) + " · ", Ui.DIM);
        }
        y += dc.getFontHeight(Graphics.FONT_NUMBER_MEDIUM) + 2;
        Ui.bar(dc, m, y, w - 2 * m, 8, g["pct"] as Number, Ui.ACCENT);
        y += 28;

        var subs = g["subs"];
        if (!(subs instanceof Array)) {
            return;
        }
        var lineH = dc.getFontHeight(Graphics.FONT_TINY);
        var limit = dc.getHeight() - dc.getHeight() / 8;
        for (var i = 0; i < subs.size() && y + lineH + 26 < limit; i++) {
            var s = subs[i] as Dictionary;
            var unit = s["u"] != null ? " " + (s["u"] as String) : "";
            var value = Ui.num(s["cur"], 0) + " / " + Ui.num(s["tgt"], 0) + unit;
            var valueW = dc.getTextWidthInPixels(value, Graphics.FONT_TINY) + 8;
            Ui.left(dc, m, y, Graphics.FONT_TINY, Ui.fit(dc, s["t"] as String, Graphics.FONT_TINY, w - 2 * m - valueW), Ui.FG);
            Ui.right(dc, w - m, y, Graphics.FONT_TINY, value, Ui.DIM);
            y += lineH + 4;
            Ui.bar(dc, m, y, w - 2 * m, 5, s["pct"] as Number, Ui.ACCENT);
            y += 22;
        }
    }

    private function drawFooter(dc as Dc) as Void {
        var h = dc.getHeight();
        var y = h - h / 10;
        var note = "";
        if (loading) {
            note = Ui.str(Rez.Strings.Loading);
        } else if (error != null) {
            note = error;
        } else {
            var at = Store.fetchedAt();
            if (at != null) {
                note = Ui.str(Rez.Strings.Updated) + " " + Ui.ago(Time.now().value() - at);
            }
        }
        Ui.center(dc, y, Graphics.FONT_XTINY, note, error != null ? Ui.BAD : Ui.FAINT);
        Ui.dots(dc, pageCount(), page, y - 8);
    }

    // meta-goal id → title, for the impact rows on the last-ride page.
    private function goalTitles() as Dictionary {
        var out = {};
        var g = goals();
        for (var i = 0; i < g.size(); i++) {
            var mg = g[i] as Dictionary;
            out[mg["id"]] = mg["t"];
        }
        return out;
    }
}

class HomeDelegate extends WatchUi.BehaviorDelegate {
    private var _view as HomeView;

    function initialize(view as HomeView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onNextPage() as Boolean {
        _view.nextPage();
        return true;
    }

    function onPreviousPage() as Boolean {
        _view.prevPage();
        return true;
    }

    function onSwipe(evt as SwipeEvent) as Boolean {
        var dir = evt.getDirection();
        if (dir == WatchUi.SWIPE_LEFT || dir == WatchUi.SWIPE_UP) {
            _view.nextPage();
        } else if (dir == WatchUi.SWIPE_RIGHT || dir == WatchUi.SWIPE_DOWN) {
            _view.prevPage();
        }
        return true;
    }

    // On a week page a tap opens the session under the finger and the
    // Enter key the next one to ride; everywhere else both refresh.
    //
    // The Edge reports a touch as the Select behaviour first and passes it
    // on to onTap — the only one that knows where the finger was — only when
    // onSelect declines it. Handling Select here made every tap open the
    // first session (owner, 10.11.2026), so on a week page it is declined.
    function onSelect() as Boolean {
        if (_view.onWeekPage()) {
            return false;
        }
        _view.refresh();
        return true;
    }

    function onKey(evt as KeyEvent) as Boolean {
        if (evt.getKey() == WatchUi.KEY_ENTER && _view.onWeekPage()) {
            return _view.openNext();
        }
        return false;
    }

    function onTap(evt as ClickEvent) as Boolean {
        if (_view.onWeekPage() && _view.tapWeek(evt.getCoordinates()[1])) {
            return true;
        }
        _view.refresh();
        return true;
    }

    function onMenu() as Boolean {
        var menu = new WatchUi.Menu2({ :title => Ui.str(Rez.Strings.AppName) });
        menu.addItem(new WatchUi.MenuItem(Ui.str(Rez.Strings.MenuRefresh), null, :refresh, null));
        menu.addItem(new WatchUi.MenuItem(Ui.str(Rez.Strings.MenuUnpair), null, :unpair, null));
        WatchUi.pushView(menu, new HomeMenuDelegate(_view), WatchUi.SLIDE_UP);
        return true;
    }
}

class HomeMenuDelegate extends WatchUi.Menu2InputDelegate {
    private var _view as HomeView;

    function initialize(view as HomeView) {
        Menu2InputDelegate.initialize();
        _view = view;
    }

    function onSelect(item as MenuItem) as Void {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id == :refresh) {
            _view.refresh();
        } else if (id == :unpair) {
            _view.unpair();
        }
    }
}
