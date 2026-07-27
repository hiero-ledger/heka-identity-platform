package com.heka.wallet

import expo.modules.ReactActivityDelegateWrapper

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactActivityDelegate
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle

import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory

class MainActivity : ReactActivity() {

    /**
     * Detects changes in device orientation and sends them to JavaScript by broadcasting an event.
     * This is used to support the camera on different tablet orientations.
     */
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val intent = Intent("onConfigurationChanged")
        intent.putExtra("newConfig", newConfig)
        this.sendBroadcast(intent)
    }

    /**
     * Returns the name of the main component registered from JavaScript.
     */
    override fun getMainComponentName(): String = "heka-wallet"

    /**
     * Returns the instance of the ReactActivityDelegate.
     */
    override fun createReactActivityDelegate(): ReactActivityDelegate =
        ReactActivityDelegateWrapper(this, BuildConfig.IS_NEW_ARCHITECTURE_ENABLED, DefaultReactActivityDelegate(
            this,
            mainComponentName,
            DefaultNewArchitectureEntryPoint.fabricEnabled
        ))

    // react-native-screens override
    // See https://github.com/software-mansion/react-native-screens?tab=readme-ov-file#android
    override fun onCreate(savedInstanceState: Bundle?) {
      supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
      super.onCreate(savedInstanceState);
    }
}