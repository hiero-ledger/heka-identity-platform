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
  // Kept for SceneDelegate, which starts React Native once the window scene connects.
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

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

    // The window and React Native root view are created in SceneDelegate:
    // apps built with newer iOS SDKs must adopt the UIScene life cycle.
    self.launchOptions = launchOptions

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

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo _: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    // With the scene life cycle, the URL that launched the app (e.g.
    // openid-credential-offer://...) arrives here instead of in launchOptions.
    // Expose it as the launch URL so that `Linking.getInitialURL()` returns it
    // once JS is ready; emitting a `url` event now would be lost, as no JS
    // listener is registered yet.
    var launchOptions = appDelegate.launchOptions ?? [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }

    factory.startReactNative(
      withModuleName: "heka-wallet",
      in: window,
      launchOptions: launchOptions
    )
  }

  func scene(_: UIScene, openURLContexts urlContexts: Set<UIOpenURLContext>) {
    for context in urlContexts {
      _ = RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func sceneDidBecomeActive(_: UIScene) {
    UIApplication.shared.applicationIconBadgeNumber = 0
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