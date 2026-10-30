// Drawing helpers shared by the views. Everything is relative to dc size so
// Edge 1040 and 1050 (both portrait, different pixel density) lay out alike.
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

module Ui {
    // Tokens mirror BikeLabApp/src/theme/colors.ts (accent, success, warning,
    // danger). Edge panels are 64-colour/16-bit depending on model — the
    // values are quantised on device, which is fine for flat fills.
    // Light theme like the app's bright screens: backgroundLight,
    // text.primary / text.secondary / text.faint, disabled for empty bars.
    const BG = 0xF5F5F5;
    const FG = 0x1A1A1A;
    const DIM = 0x666666;
    const FAINT = 0x999999;
    const ACCENT = 0x274DD3;
    const GOOD = 0x10B981;
    const WARN = 0xF59E0B;
    const BAD = 0xEF4444;
    const BAR_BG = 0xCCCCCC;

    function str(id as ResourceId) as String {
        return WatchUi.loadResource(id) as String;
    }

    function clear(dc as Dc) as Void {
        dc.setColor(FG, BG);
        dc.clear();
    }

    function text(dc as Dc, x as Number, y as Number, font, s as String, color as Number, justify as Number) as Void {
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x, y, font, s, justify);
    }

    function left(dc as Dc, x as Number, y as Number, font, s as String, color as Number) as Void {
        text(dc, x, y, font, s, color, Graphics.TEXT_JUSTIFY_LEFT);
    }

    function center(dc as Dc, y as Number, font, s as String, color as Number) as Void {
        text(dc, dc.getWidth() / 2, y, font, s, color, Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Faux bold: the system number fonts have no weight variants, so the
    // glyphs are drawn twice, one pixel apart.
    function boldLeft(dc as Dc, x as Number, y as Number, font, s as String, color as Number) as Void {
        text(dc, x, y, font, s, color, Graphics.TEXT_JUSTIFY_LEFT);
        text(dc, x + 1, y, font, s, color, Graphics.TEXT_JUSTIFY_LEFT);
    }

    function right(dc as Dc, x as Number, y as Number, font, s as String, color as Number) as Void {
        text(dc, x, y, font, s, color, Graphics.TEXT_JUSTIFY_RIGHT);
    }

    // Truncates `s` with an ellipsis so it fits in maxWidth px at `font`.
    function fit(dc as Dc, s as String, font, maxWidth as Number) as String {
        if (dc.getTextWidthInPixels(s, font) <= maxWidth) {
            return s;
        }
        var ell = "…";
        var n = s.length();
        while (n > 1) {
            n -= 1;
            var candidate = s.substring(0, n) + ell;
            if (dc.getTextWidthInPixels(candidate, font) <= maxWidth) {
                return candidate;
            }
        }
        return ell;
    }

    // Word-wraps `s` into at most maxLines lines of maxWidth px; the last
    // line is ellipsised if text remains.
    function wrap(dc as Dc, s as String, font, maxWidth as Number, maxLines as Number) as Array {
        var words = splitWords(s);
        var lines = [];
        var line = "";
        for (var i = 0; i < words.size(); i++) {
            var word = words[i] as String;
            var candidate = line.length() == 0 ? word : line + " " + word;
            if (dc.getTextWidthInPixels(candidate, font) <= maxWidth) {
                line = candidate;
            } else {
                if (lines.size() == maxLines - 1) {
                    var rest = line.length() == 0 ? word : line + " " + word;
                    for (var j = i + 1; j < words.size(); j++) {
                        rest += " " + (words[j] as String);
                    }
                    lines.add(fit(dc, rest, font, maxWidth));
                    return lines;
                }
                if (line.length() > 0) {
                    lines.add(line);
                }
                line = word;
            }
        }
        if (line.length() > 0) {
            lines.add(fit(dc, line, font, maxWidth));
        }
        return lines;
    }

    function splitWords(s as String) as Array {
        var words = [];
        var chars = s.toCharArray();
        var current = "";
        for (var i = 0; i < chars.size(); i++) {
            if (chars[i] == ' ') {
                if (current.length() > 0) {
                    words.add(current);
                    current = "";
                }
            } else {
                current += chars[i].toString();
            }
        }
        if (current.length() > 0) {
            words.add(current);
        }
        return words;
    }

    function bar(dc as Dc, x as Number, y as Number, w as Number, h as Number, pct as Number, color as Number) as Void {
        dc.setColor(BAR_BG, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(x, y, w, h, h / 2);
        var p = pct < 0 ? 0 : (pct > 100 ? 100 : pct);
        var fill = (w * p) / 100;
        if (fill > 0) {
            dc.setColor(color, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(x, y, fill < h ? h : fill, h, h / 2);
        }
    }

    function dots(dc as Dc, count as Number, active as Number, y as Number) as Void {
        if (count <= 1) {
            return;
        }
        var gap = 10;
        var x0 = dc.getWidth() / 2 - ((count - 1) * gap) / 2;
        for (var i = 0; i < count; i++) {
            dc.setColor(i == active ? ACCENT : BAR_BG, Graphics.COLOR_TRANSPARENT);
            dc.fillCircle(x0 + i * gap, y, i == active ? 3 : 2);
        }
    }

    function num(v, decimals as Number) as String {
        if (v == null) {
            return "–";
        }
        if (v instanceof Float || v instanceof Double) {
            return v.format(decimals > 0 ? "%." + decimals + "f" : "%d");
        }
        return v.toString();
    }

    function ago(seconds as Number) as String {
        if (seconds < 3600) {
            return (seconds / 60).toString() + str(Rez.Strings.Ago_m);
        }
        if (seconds < 86400) {
            return (seconds / 3600).toString() + str(Rez.Strings.Ago_h);
        }
        return (seconds / 86400).toString() + str(Rez.Strings.Ago_d);
    }
}
