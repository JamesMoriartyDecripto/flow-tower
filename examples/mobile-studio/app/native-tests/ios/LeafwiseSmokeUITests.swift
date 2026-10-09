import XCTest

// Smoke test run by the iOS lane on iPhone 16 Pro and iPhone SE simulators before every PR.
final class LeafwiseSmokeUITests: XCTestCase {
  private var app: XCUIApplication!

  override func setUpWithError() throws {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments += ["-uiTesting", "-resetState"]
    app.launch()
  }

  func testAddPlantAndMarkWatered() throws {
    app.buttons["Add your first plant"].tap()
    let name = app.textFields["Plant name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.tap()
    name.typeText("Monstera")
    app.buttons["Save"].tap()

    let water = app.buttons["Mark Monstera as watered"]
    XCTAssertTrue(water.waitForExistence(timeout: 5))
    water.tap()
    XCTAssertTrue(app.staticTexts["Next watering"].exists)
  }

  func testPaywallShowsTermsAndRestore() throws {
    app.launchArguments += ["-seedPlants", "2"]
    app.launch()
    app.buttons["Add plant"].tap()
    XCTAssertTrue(app.staticTexts["7-day free trial, then billed yearly"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["Restore purchases"].exists)
    XCTAssertTrue(app.buttons["Close"].isHittable)
  }

  func testLaunchPerformance() throws {
    measure(metrics: [XCTApplicationLaunchMetric()]) { XCUIApplication().launch() }
  }
}
