import Expo
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import UIKit
import UserNotifications

@main
class AppDelegate: ExpoAppDelegate, UNUserNotificationCenterDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Set notification delegate to allow foreground notifications
    UNUserNotificationCenter.current().delegate = self

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "heka-wallet",
      in: window,
      launchOptions: launchOptions
    )

    // Exclude .afj folder from backup
    excludeDotAFJFolderFromBackup()

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options)
      || RCTLinkingManager.application(app, open: url, options: options)
  }

  override func applicationDidBecomeActive(_ application: UIApplication) {
    super.applicationDidBecomeActive(application)
    UIApplication.shared.applicationIconBadgeNumber = 0
  }

  override func application(
    _: UIApplication,
    supportedInterfaceOrientationsFor _: UIWindow?
  ) -> UIInterfaceOrientationMask {
    return Orientation.getOrientation()
  }

  // The .afj folder from Credo cannot be restored.
  private func excludeDotAFJFolderFromBackup() {
    let folderName = ".afj"
    guard let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
      NSLog("Could not get documents directory")
      return
    }

    let folderURL = documentsURL.appendingPathComponent(folderName)

    // Check if the directory exists
    var isDir: ObjCBool = false
    let fileExists = FileManager.default.fileExists(atPath: folderURL.path, isDirectory: &isDir)

    if !fileExists || !isDir.boolValue {
      NSLog("Directory %@ does not exist. Skipping backup exclusion.", folderName)
      return
    }

    // Exclude the folder from backup
    do {
      var resourceValues = URLResourceValues()
      resourceValues.isExcludedFromBackup = true
      var mutableURL = folderURL
      try mutableURL.setResourceValues(resourceValues)
      NSLog("Excluded folder %@ from backup.", folderName)
    } catch {
      NSLog("Error excluding folder %@ from backup: %@", folderName, error.localizedDescription)
    }
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for _: RCTBridge) -> URL? {
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