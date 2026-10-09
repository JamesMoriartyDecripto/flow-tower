/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'LeafwiseWidget',
  deploymentTarget: '17.0',
  // Shared container with the app: the JS side writes plants due today, the widget reads them.
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
  colors: {
    $accent: '#2F8F46',
    $widgetBackground: { light: '#FFFFFF', dark: '#121613' },
  },
});
