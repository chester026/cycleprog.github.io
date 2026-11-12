// Puts a session on the Edge as a workout and opens it in the Edge's own
// player (docs/plans/garmin-edge-workouts.md). Used by the session screen's
// button; kept apart from the view so another screen can start the same way.
//
// A session whose workout file is already on the device in the current
// version is opened straight away, phone or no phone. Otherwise the file is
// downloaded (`…/sessions/:id/fit`) — the device saves it under Training →
// Workouts — and then opened.
//
// The caller's callback gets the state as it changes:
//   :downloading   the file is being fetched through the phone
//   :ok            handed to the player (the app is about to close)
//   :noPhone       no connection to the phone
//   :startFailed   the server or the device refused
import Toybox.Lang;

class Starter {
    var busy as Boolean = false;

    private var _row as Dictionary? = null;
    private var _callback as Method? = null;

    // `row` is the session as the week payload gives it (id, u, …).
    function start(row as Dictionary, callback as Method) as Void {
        if (busy) {
            return;
        }
        var known = Store.fitName(row["id"], row["u"]);
        if (known != null) {
            var workout = Workouts.findAppWorkout(known);
            if (workout != null) {
                callback.invoke(Workouts.launch(workout) ? :ok : :startFailed);
                return;
            }
        }
        busy = true;
        _row = row;
        _callback = callback;
        callback.invoke(:downloading);
        Api.getFit("/api/garmin/sessions/" + row["id"] + "/fit", method(:onFit));
    }

    // `data` is declared as for every other request; for a FIT download it
    // is in fact an iterator over the saved content (Workouts.asIterator).
    function onFit(responseCode as Number, data as Dictionary or String or Null) as Void {
        busy = false;
        var row = _row;
        var callback = _callback;
        if (row == null || callback == null) {
            return;
        }
        var iterator = Workouts.asIterator(data);
        var workout = iterator != null ? iterator.next() : null;
        if (responseCode == 200 && workout != null) {
            Store.rememberFit(row["id"], row["u"], workout.getName());
            callback.invoke(Workouts.launch(workout) ? :ok : :startFailed);
        } else {
            callback.invoke(Api.isNetworkError(responseCode) ? :noPhone : :startFailed);
        }
    }
}
