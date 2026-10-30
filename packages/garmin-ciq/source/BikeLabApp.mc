import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

// Entry point (manifest.xml entry="BikeLabApp"). Paired → HomeView, else
// PairView. The views swap each other via WatchUi.switchToView once pairing
// completes or the token is rejected.
class BikeLabApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() {
        if (Store.token() == null) {
            var pair = new PairView();
            return [pair, new PairDelegate(pair)];
        }
        var home = new HomeView();
        return [home, new HomeDelegate(home)];
    }
}
