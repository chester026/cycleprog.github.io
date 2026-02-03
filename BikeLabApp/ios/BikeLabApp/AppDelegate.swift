import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "BikeLabApp",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
  
  // MARK: - Universal Links & URL Scheme handling
  
  // Обработка URL Scheme (bikelab://)
  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey : Any] = [:]
  ) -> Bool {
    print("🔗 [AppDelegate] URL Scheme received: \(url.absoluteString)")
    // React Native's Linking автоматически обработает этот URL
    return reactNativeDelegate?.application(app, open: url, options: options) ?? false
  }
  
  // Обработка Universal Links (https://bikelab.app/auth)
  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    print("🌐 [AppDelegate] Universal Link received")
    print("🌐 [AppDelegate] Activity type: \(userActivity.activityType)")
    
    // Universal Link activity
    if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
       let url = userActivity.webpageURL {
      print("🔗 [AppDelegate] Universal Link URL: \(url.absoluteString)")
      
      // React Native's Linking автоматически обработает этот URL
      return reactNativeDelegate?.application(application, continue: userActivity, restorationHandler: restorationHandler) ?? false
    }
    
    return false
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
