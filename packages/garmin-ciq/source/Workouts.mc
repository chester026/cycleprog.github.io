// The week's sessions on the device (docs/plans/garmin-edge-workouts.md):
// what the week page and SessionView share — the block profile, the way
// dates and durations read, and the hand-over of a downloaded workout to the
// Edge's own workout player.
//
// Blocks arrive as positional arrays (contract/garmin.ts):
//   week row   [seconds, zone, effort 0|1]
//   session    [seconds, zone, kind, rep, reps, unit, low, high, cadLow, cadHigh, cue]
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.PersistedContent;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

module Workouts {
    // Session block positions.
    const B_SECONDS = 0;
    const B_ZONE = 1;
    const B_KIND = 2;
    const B_REP = 3;
    const B_REPS = 4;
    const B_UNIT = 5;
    const B_LOW = 6;
    const B_HIGH = 7;
    const B_CAD_LOW = 8;
    const B_CAD_HIGH = 9;
    const B_CUE = 10;

    // Kind codes (contract GARMIN_BLOCK_KINDS).
    const KIND_WARMUP = 0;
    const KIND_WORK = 1;
    const KIND_RECOVERY = 2;
    const KIND_COOLDOWN = 3;
    const KIND_STEADY = 4;

    // Warm-up, recovery and cool-down: the neutral frame around the work,
    // as in the phone's calendar.
    const FRAME = 0xB8BEC8;

    // Zone colours, Z1..Z7 — the phone's order (grey, blue, green, yellow,
    // orange, red, purple) in stronger tones: the Edge's panel has a small
    // palette and is read in sunlight, where the app's pastels wash out.
    function zoneColor(zone as Number) as Number {
        if (zone <= 1) {
            return FRAME;
        } else if (zone == 2) {
            return 0x5B8DEF;
        } else if (zone == 3) {
            return 0x34B27B;
        } else if (zone == 4) {
            return 0xE0A800;
        } else if (zone == 5) {
            return 0xF07F2E;
        } else if (zone == 6) {
            return 0xE04848;
        }
        return 0x8E6BE0;
    }

    // Whether a block is the work (an effort or steady riding). `detail`
    // says which of the two block shapes this is.
    function isEffort(block as Array, detail as Boolean) as Boolean {
        if (detail) {
            return block[B_KIND] == KIND_WORK || block[B_KIND] == KIND_STEADY;
        }
        return block[2] == 1;
    }

    function blockColor(block as Array, detail as Boolean) as Number {
        return isEffort(block, detail) ? zoneColor(block[B_ZONE] as Number) : FRAME;
    }

    // One bar per block: as wide as the block is long, as tall as it is hard
    // (40 % of the height in zone 1, all of it in zone 7), bottom-aligned.
    function drawProfile(dc as Dc, x as Number, y as Number, w as Number, h as Number, blocks as Array, detail as Boolean, muted as Boolean) as Void {
        var n = blocks.size();
        var total = 0;
        for (var i = 0; i < n; i++) {
            total += (blocks[i] as Array)[B_SECONDS] as Number;
        }
        if (n == 0 || total <= 0) {
            return;
        }
        var gap = 2;
        var elapsed = 0;
        for (var i = 0; i < n; i++) {
            var block = blocks[i] as Array;
            var seconds = block[B_SECONDS] as Number;
            var zone = block[B_ZONE] as Number;
            var x0 = x + (elapsed.toFloat() / total * w).toNumber();
            elapsed += seconds;
            var x1 = x + (elapsed.toFloat() / total * w).toNumber();
            var bw = x1 - x0 - gap;
            if (bw < 2) {
                // Too short for a gap: keep the block visible instead.
                bw = x1 - x0 > 1 ? x1 - x0 : 1;
            }
            var clamped = zone < 1 ? 1 : (zone > 7 ? 7 : zone);
            var bh = (h * (0.4 + 0.1 * (clamped - 1))).toNumber();
            dc.setColor(muted ? Ui.BAR_BG : blockColor(block, detail), Graphics.COLOR_TRANSPARENT);
            var r = bw >= 8 ? 4 : bw / 2;
            dc.fillRoundedRectangle(x0, y + h - bh, bw, bh, r);
        }
    }

    // --- dates --------------------------------------------------------------

    // The device's local date, "YYYY-MM-DD" — the `from` of the week request.
    function today() as String {
        var info = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        return info.year.format("%04d") + "-" + (info.month as Number).format("%02d") + "-" + info.day.format("%02d");
    }

    function part(day as String, from as Number, to as Number) as Number {
        var s = day.substring(from, to);
        if (s == null) {
            return 0;
        }
        var n = s.toNumber();
        return n != null ? n : 0;
    }

    // "2026-11-11" → 20261111, so days compare as numbers.
    function dayNumber(day as String) as Number {
        return part(day, 0, 4) * 10000 + part(day, 5, 7) * 100 + part(day, 8, 10);
    }

    // "Today", otherwise the weekday and the day of the month: "Wed 11".
    function dayLabel(day as String) as String {
        if (dayNumber(day) == dayNumber(today())) {
            return Ui.str(Rez.Strings.Today);
        }
        // Noon, so the local date is the same in any time zone.
        var moment = Gregorian.moment({
            :year => part(day, 0, 4),
            :month => part(day, 5, 7),
            :day => part(day, 8, 10),
            :hour => 12
        });
        var info = Gregorian.info(moment, Time.FORMAT_MEDIUM);
        return info.day_of_week.toString() + " " + info.day.format("%d");
    }

    // --- words --------------------------------------------------------------

    // Minutes as "45 min" / "1 h" / "1 h 5 min".
    function duration(minutes as Number) as String {
        if (minutes < 60) {
            return minutes.format("%d") + " " + Ui.str(Rez.Strings.Min);
        }
        var text = (minutes / 60).format("%d") + " " + Ui.str(Rez.Strings.Hour);
        if (minutes % 60 > 0) {
            text += " " + (minutes % 60).format("%d") + " " + Ui.str(Rez.Strings.Min);
        }
        return text;
    }

    // A block's length: "30 s" / "8 min" / "2 min 30 s" / "1 h 15 min".
    function blockDuration(seconds as Number) as String {
        if (seconds < 60) {
            return seconds.format("%d") + " " + Ui.str(Rez.Strings.Sec);
        }
        if (seconds >= 3600 || seconds % 60 == 0) {
            return duration(seconds / 60);
        }
        return (seconds / 60).format("%d") + " " + Ui.str(Rez.Strings.Min) + " " + (seconds % 60).format("%d") + " " + Ui.str(Rez.Strings.Sec);
    }

    // "Effort 2/3", "Warm-up".
    function blockName(block as Array) as String {
        var kind = block[B_KIND];
        var id = Rez.Strings.KindSteady;
        if (kind == KIND_WARMUP) {
            id = Rez.Strings.KindWarmup;
        } else if (kind == KIND_WORK) {
            id = Rez.Strings.KindWork;
        } else if (kind == KIND_RECOVERY) {
            id = Rez.Strings.KindRecovery;
        } else if (kind == KIND_COOLDOWN) {
            id = Rez.Strings.KindCooldown;
        }
        var name = Ui.str(id);
        var reps = block[B_REPS] as Number;
        if (reps > 1) {
            name += " " + (block[B_REP] as Number).format("%d") + "/" + reps.format("%d");
        }
        return name;
    }

    function range(low as Number, high as Number, unit as String) as String {
        return (low == high ? low.format("%d") : low.format("%d") + "–" + high.format("%d")) + " " + unit;
    }

    // "240–250 W · 85–95 rpm"; "" when the block has neither.
    function blockTarget(block as Array) as String {
        var text = "";
        var unit = block[B_UNIT];
        if (unit == 1) {
            text = range(block[B_LOW] as Number, block[B_HIGH] as Number, Ui.str(Rez.Strings.Watts));
        } else if (unit == 2) {
            text = range(block[B_LOW] as Number, block[B_HIGH] as Number, Ui.str(Rez.Strings.Bpm));
        }
        var cadLow = block[B_CAD_LOW] as Number;
        if (cadLow > 0) {
            text += (text.length() > 0 ? " · " : "") + range(cadLow, block[B_CAD_HIGH] as Number, Ui.str(Rez.Strings.Rpm));
        }
        return text;
    }

    // --- the Edge's workout player -----------------------------------------
    //
    // A FIT download hands the callback an iterator over what the device
    // just saved; each item can be turned into an Intent that opens it in
    // the native workout player. The parameters below are untyped on
    // purpose: the SDK's own type for the callback data does not include the
    // iterator on every version, and `remove` is not on the base content
    // class.

    function asIterator(value) {
        return value instanceof PersistedContent.Iterator ? value : null;
    }

    // The workout this app downloaded earlier under `name`, or null.
    function findAppWorkout(name as String) {
        try {
            var iterator = PersistedContent.getAppWorkouts();
            var workout = iterator.next();
            while (workout != null) {
                if (name.equals(workout.getName())) {
                    return workout;
                }
                workout = iterator.next();
            }
        } catch (e) {
            // Treated as "not on the device": the caller downloads it again.
        }
        return null;
    }

    // Opens the workout in the Edge's player; false when the device refuses.
    function launch(workout) as Boolean {
        try {
            System.exitTo(workout.toIntent());
            return true;
        } catch (e) {
            return false;
        }
    }

    function removeContent(content) as Void {
        if (content has :remove) {
            content.remove();
        }
    }

    // Removes the workouts this app downloaded that are not in `keep`
    // (names), so Training → Workouts does not fill up with past sessions.
    // Only ever touches this app's own downloads.
    function removeAppWorkoutsExcept(keep as Array) as Void {
        try {
            var iterator = PersistedContent.getAppWorkouts();
            var workout = iterator.next();
            while (workout != null) {
                if (keep.indexOf(workout.getName()) < 0) {
                    removeContent(workout);
                }
                workout = iterator.next();
            }
        } catch (e) {
            // Housekeeping only — never worth an error on screen.
        }
    }

    // After a fresh week: forget the downloads of sessions that are gone or
    // have changed, and remove their files.
    function cleanup(week as Dictionary) as Void {
        var live = {};
        var days = week["days"];
        if (days instanceof Array) {
            for (var i = 0; i < days.size(); i++) {
                var sessions = (days[i] as Dictionary)["ev"];
                if (sessions instanceof Array) {
                    for (var j = 0; j < sessions.size(); j++) {
                        var session = sessions[j] as Dictionary;
                        var id = session["id"];
                        if (id != null) {
                            live[id.toString()] = session["u"];
                        }
                    }
                }
            }
        }
        var downloaded = Store.fits();
        var kept = {};
        var names = [];
        var keys = downloaded.keys();
        for (var i = 0; i < keys.size(); i++) {
            var entry = downloaded[keys[i]];
            var version = live[keys[i]];
            if (entry instanceof Array && entry.size() == 2 && version != null && version.equals(entry[0])) {
                kept[keys[i]] = entry;
                names.add(entry[1]);
            }
        }
        Store.setFits(kept);
        removeAppWorkoutsExcept(names);
    }
}
