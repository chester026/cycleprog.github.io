// One planned session (docs/plans/garmin-edge-workouts.md): its profile, the
// list of blocks with what to do in each, and Start — which puts the
// session on the Edge as a workout and opens it in the Edge's own player.
//
// Opened from the week page with the row it was tapped on, so the title and
// the profile are there at once; the blocks in full come from
// `GET /api/garmin/sessions/:id`. Swipe up / down pages the list — a bar on
// the right edge and an "N more" arrow under it say there is more — tap the
// button or Select starts, Back returns to the week.
//
// The button starts the session through Starter.mc.
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

class SessionView extends WatchUi.View {
    // :loading | :ready | :noPhone | :failed | :downloading | :startFailed
    var status as Symbol = :loading;

    private var _day as String;
    private var _row as Dictionary;
    private var _detail as Dictionary? = null;
    private var _starter as Starter = new Starter();

    // The block list is paged: the index each page so far starts at, and
    // the one the next page would start at (set while drawing).
    private var _starts as Array = [0];
    private var _nextStart as Number = 0;
    // Top of the Start button as last drawn, -1 when it is not shown.
    private var _buttonY as Number = -1;

    function initialize(day as String, row as Dictionary) {
        View.initialize();
        _day = day;
        _row = row;
    }

    function onShow() as Void {
        if (_detail == null) {
            load();
        }
    }

    // --- data ---------------------------------------------------------------

    function load() as Void {
        status = :loading;
        WatchUi.requestUpdate();
        Api.get("/api/garmin/sessions/" + _row["id"], method(:onSession));
    }

    function onSession(responseCode as Number, data as Dictionary or String or Null) as Void {
        if (responseCode == 200 && data instanceof Dictionary) {
            _detail = data;
            status = :ready;
        } else if (Api.isNetworkError(responseCode)) {
            status = :noPhone;
        } else {
            status = :failed;
        }
        WatchUi.requestUpdate();
    }

    // The blocks to draw and whether they are the full ones.
    private function blocks() as Array {
        var detail = _detail;
        var source = detail != null ? detail["b"] : _row["b"];
        return source instanceof Array ? source : [];
    }

    function canStart() as Boolean {
        var profile = _row["b"];
        return profile instanceof Array && profile.size() > 0;
    }

    // --- start --------------------------------------------------------------

    function start() as Void {
        if (canStart()) {
            _starter.start(_row, method(:onStartState));
        }
    }

    function onStartState(state as Symbol) as Void {
        if (state == :ok) {
            status = _detail != null ? :ready : :loading;
        } else {
            status = state;
        }
        WatchUi.requestUpdate();
    }

    // Tap: the button starts; anywhere else retries a failed load.
    function tap(y as Number) as Void {
        if (_buttonY >= 0 && y >= _buttonY) {
            start();
        } else if (_detail == null && (status == :noPhone || status == :failed)) {
            load();
        }
    }

    // --- paging -------------------------------------------------------------

    function nextPage() as Void {
        if (_detail != null && _nextStart < blocks().size()) {
            _starts.add(_nextStart);
            WatchUi.requestUpdate();
        }
    }

    function prevPage() as Void {
        if (_starts.size() > 1) {
            _starts = _starts.slice(0, _starts.size() - 1);
            WatchUi.requestUpdate();
        }
    }

    // --- drawing ------------------------------------------------------------

    function onUpdate(dc as Dc) as Void {
        Ui.clear(dc);
        var w = dc.getWidth();
        var h = dc.getHeight();
        var m = w / 12;
        var y = m;
        var smallH = dc.getFontHeight(Graphics.FONT_XTINY);
        var done = _row["done"] == true;
        var list = blocks();
        var detail = _detail != null;

        // Day on the left, length on the right.
        Ui.left(dc, m, y, Graphics.FONT_XTINY, Workouts.dayLabel(_day), Ui.DIM);
        var minutes = _row["min"];
        if (minutes instanceof Number && minutes > 0) {
            Ui.right(dc, w - m, y, Graphics.FONT_XTINY, Workouts.duration(minutes), Ui.DIM);
        }
        y += smallH + 2;

        // The headline on the first page only: further pages give its room
        // to the blocks.
        if (_starts.size() == 1) {
            var titleLines = Ui.wrap(dc, _row["t"] as String, Graphics.FONT_SMALL, w - 2 * m, 2);
            for (var li = 0; li < titleLines.size(); li++) {
                Ui.left(dc, m, y, Graphics.FONT_SMALL, titleLines[li] as String, Ui.FG);
                y += dc.getFontHeight(Graphics.FONT_SMALL);
            }
        }
        y += 8;

        if (list.size() > 0) {
            var profileH = h / 9;
            Workouts.drawProfile(dc, m, y, w - 2 * m, profileH, list, detail, done);
            y += profileH + 12;
        }

        // Bottom up: the footer line, then the Start button above it.
        var footerY = h - h / 10;
        var limit = footerY - 10;
        _buttonY = -1;
        if (canStart()) {
            var buttonH = dc.getFontHeight(Graphics.FONT_SMALL) + 14;
            _buttonY = footerY - buttonH - 12;
            drawButton(dc, m, _buttonY, w - 2 * m, buttonH);
            limit = _buttonY - 10;
        }

        var note = "";
        var noteTone = Ui.FAINT;
        if (!canStart()) {
            Ui.left(dc, m, y, Graphics.FONT_TINY, Ui.str(Rez.Strings.NoBlocks), Ui.FG);
            y += dc.getFontHeight(Graphics.FONT_TINY) + 2;
            Ui.left(dc, m, y, Graphics.FONT_XTINY, Ui.str(Rez.Strings.NoBlocksHint), Ui.DIM);
        } else if (detail) {
            note = drawBlocks(dc, list, m, y, w, limit);
        } else if (status == :loading) {
            note = Ui.str(Rez.Strings.Loading);
        }
        if (status == :noPhone) {
            note = Ui.str(Rez.Strings.PairNoPhone);
            noteTone = Ui.BAD;
        } else if (status == :failed) {
            note = Ui.str(Rez.Strings.SessionFailed);
            noteTone = Ui.BAD;
        } else if (status == :startFailed) {
            note = Ui.str(Rez.Strings.StartFailed);
            noteTone = Ui.BAD;
        }
        Ui.center(dc, footerY, Graphics.FONT_XTINY, note, noteTone);
    }

    private function drawButton(dc as Dc, x as Number, y as Number, w as Number, h as Number) as Void {
        var sending = status == :downloading;
        dc.setColor(sending ? Ui.BAR_BG : Ui.ACCENT, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, y, w, h, h / 2);
        var label = Ui.str(sending ? Rez.Strings.Downloading : Rez.Strings.Start);
        // A line of text is taller than its letters by the room left for
        // descenders, so centring the line puts the letters too high: shift
        // by half of that room.
        var textY = y + (h - dc.getFontHeight(Graphics.FONT_SMALL)) / 2 + Graphics.getFontDescent(Graphics.FONT_SMALL) / 2;
        Ui.center(dc, textY, Graphics.FONT_SMALL, label, sending ? Ui.DIM : Graphics.COLOR_WHITE);
    }

    // Draws as many blocks as fit from the current page's start, the signs
    // that the list goes on, and returns the footer note: "Blocks 1–4 / 8".
    private function drawBlocks(dc as Dc, list as Array, m as Number, y as Number, w as Number, limit as Number) as String {
        var nameFont = Graphics.FONT_TINY;
        var textFont = Graphics.FONT_XTINY;
        var nameH = dc.getFontHeight(nameFont);
        var textH = dc.getFontHeight(textFont);
        var textX = m + 12;
        // The right margin holds the scroll bar.
        var textW = w - m - textX;
        var first = _starts[_starts.size() - 1] as Number;
        var listTop = y;
        // The last line above the button is kept for the "N more" arrow.
        var bottom = limit - textH - 4;
        var i = first;
        while (i < list.size()) {
            var block = list[i] as Array;
            var target = Workouts.blockTarget(block);
            var cue = block[Workouts.B_CUE] as String;
            var cueLines = cue.length() > 0 ? Ui.wrap(dc, cue, textFont, textW, 2) : [];
            var rowH = nameH + (target.length() > 0 ? textH : 0) + cueLines.size() * textH + 10;
            // Always at least one block per page, however long its cue.
            if (i > first && y + rowH > bottom) {
                break;
            }
            // A bar in the block's colour, the height of the name line.
            dc.setColor(Workouts.blockColor(block, true), Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(m, y + 3, 5, nameH - 6, 2);

            var length = Workouts.blockDuration(block[Workouts.B_SECONDS] as Number);
            var lengthW = dc.getTextWidthInPixels(length, nameFont) + 8;
            Ui.left(dc, textX, y, nameFont, Ui.fit(dc, Workouts.blockName(block), nameFont, textW - lengthW), Ui.FG);
            Ui.right(dc, w - m, y, nameFont, length, Ui.FG);
            y += nameH;
            if (target.length() > 0) {
                Ui.left(dc, textX, y, textFont, Ui.fit(dc, target, textFont, textW), Ui.DIM);
                y += textH;
            }
            for (var c = 0; c < cueLines.size(); c++) {
                Ui.left(dc, textX, y, textFont, cueLines[c] as String, Ui.FAINT);
                y += textH;
            }
            y += 10;
            i += 1;
        }
        _nextStart = i;
        var total = list.size();
        if (first > 0 || i < total) {
            // Scroll bar on the right edge: where this page is in the list.
            var barX = w - m / 2 - 2;
            var barH = bottom - listTop;
            dc.setColor(Ui.BAR_BG, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(barX, listTop, 4, barH, 2);
            var thumbTop = listTop + barH * first / total;
            var thumbH = barH * (i - first) / total;
            dc.setColor(Ui.DIM, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(barX, thumbTop, 4, thumbH < 8 ? 8 : thumbH, 2);
        }
        if (i < total) {
            // "▼ 6 more", centred between the list and the button.
            var more = Lang.format(Ui.str(Rez.Strings.MoreBlocks), [(total - i).format("%d")]);
            var moreW = dc.getTextWidthInPixels(more, textFont);
            var arrow = 10;
            var x0 = (w - moreW - arrow - 6) / 2;
            var arrowY = bottom + 4 + (textH - 6) / 2;
            dc.setColor(Ui.ACCENT, Graphics.COLOR_TRANSPARENT);
            dc.fillPolygon([[x0, arrowY], [x0 + arrow, arrowY], [x0 + arrow / 2, arrowY + 6]]);
            Ui.left(dc, x0 + arrow + 6, bottom + 4, textFont, more, Ui.ACCENT);
        }
        return Ui.str(Rez.Strings.Blocks) + " " + (first + 1).format("%d") + "–" + i.format("%d") + " / " + total.format("%d");
    }
}

class SessionDelegate extends WatchUi.BehaviorDelegate {
    private var _view as SessionView;

    function initialize(view as SessionView) {
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
        if (dir == WatchUi.SWIPE_UP) {
            _view.nextPage();
        } else if (dir == WatchUi.SWIPE_DOWN) {
            _view.prevPage();
        } else if (dir == WatchUi.SWIPE_RIGHT) {
            WatchUi.popView(WatchUi.SLIDE_RIGHT);
        }
        return true;
    }

    // Declined, so that a touch reaches onTap with its position (see
    // HomeDelegate.onSelect): only a tap on the button starts the session.
    function onSelect() as Boolean {
        return false;
    }

    function onKey(evt as KeyEvent) as Boolean {
        if (evt.getKey() == WatchUi.KEY_ENTER) {
            _view.start();
            return true;
        }
        return false;
    }

    function onTap(evt as ClickEvent) as Boolean {
        _view.tap(evt.getCoordinates()[1]);
        return true;
    }

    function onMenu() as Boolean {
        var menu = new WatchUi.Menu2({ :title => Ui.str(Rez.Strings.AppName) });
        if (_view.canStart()) {
            menu.addItem(new WatchUi.MenuItem(Ui.str(Rez.Strings.MenuStart), null, :start, null));
        }
        menu.addItem(new WatchUi.MenuItem(Ui.str(Rez.Strings.MenuRefresh), null, :refresh, null));
        WatchUi.pushView(menu, new SessionMenuDelegate(_view), WatchUi.SLIDE_UP);
        return true;
    }
}

class SessionMenuDelegate extends WatchUi.Menu2InputDelegate {
    private var _view as SessionView;

    function initialize(view as SessionView) {
        Menu2InputDelegate.initialize();
        _view = view;
    }

    function onSelect(item as MenuItem) as Void {
        var id = item.getId();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
        if (id == :start) {
            _view.start();
        } else if (id == :refresh) {
            _view.load();
        }
    }
}
