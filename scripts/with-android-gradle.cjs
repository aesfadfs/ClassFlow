const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

module.exports = function withAndroidGradle(config) {
  // The open school browser must reach 教务 systems that are still served over
  // plain HTTP (often on campus networks). The app itself makes no other
  // network requests; the WebView only loads pages the user opens.
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    // The React Native 0.85 toolchain resolver still references a vendor removed in Gradle 9.
    const wrapper = path.join(mod.modRequest.platformProjectRoot, 'gradle/wrapper/gradle-wrapper.properties');
    const properties = await fs.readFile(wrapper, 'utf8');
    const compatible = properties.replace('gradle-9.3.1-bin.zip', 'gradle-8.14.3-bin.zip');
    if (properties !== compatible) await fs.writeFile(wrapper, compatible);
    return mod;
  }]);
};
