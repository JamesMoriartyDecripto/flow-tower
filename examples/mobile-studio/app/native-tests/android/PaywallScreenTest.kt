package com.example.leafwise

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test

// Runs on the Pixel 9 (API 36) and API 26 emulator images. The activity is launched with a
// fake billing client (no Play Store account on the emulator) and two seeded plants.
class PaywallScreenTest {
  @get:Rule val rule = createAndroidComposeRule<MainActivity>()

  @Test
  fun paywallShowsTermsRestoreAndClose() {
    rule.onNodeWithText("Add plant").performClick()
    rule.onNodeWithText("7-day free trial, then billed yearly").assertIsDisplayed()
    rule.onNodeWithText("Restore purchases").assertIsDisplayed()
    rule.onNodeWithContentDescription("Close").assertIsDisplayed()
  }

  @Test
  fun cancelledPurchaseReturnsToTrigger() {
    rule.onNodeWithText("Add plant").performClick()
    rule.onNodeWithText("Start free trial").performClick()
    // FakeBillingClient answers USER_CANCELED for this test build.
    rule.onNodeWithText("Your plants").assertIsDisplayed()
  }
}
