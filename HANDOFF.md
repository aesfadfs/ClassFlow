# 课序 ClassFlow — 换电脑与开发交接说明

> 2026-11-05 GitHub 协作补充：以下内容记录原迁移 ZIP。当前 GitHub 仓库跟踪 Android 工程，但不上传开发签名、构建缓存及 APK；现有 APK 从 Releases 下载。克隆后的运行、签名准备和分支协作流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。下文“无 Git 提交”“包含开发签名”等说法仅描述当时的本地迁移包。

交接日期：2026-11-04（北京时间）。这是当前工作目录的迁移快照，包含尚未提交的全部应用源码。接手时以实际源码和配置为准。

## 1. 在新电脑上开始

1. 解压迁移 ZIP，进入其中的 `ClassFlow` 文件夹。Windows 原生构建建议放到 `C:\dev\ClassFlow` 这类较短的纯英文路径。
2. 安装带 npm 的完整 Node.js 24 环境（原 README 的最低要求为 22.13+），确认 `node --version`、`npm --version` 都可用。只预览 Web 不需要 Android SDK。
3. 在包含 `package.json` 的目录打开终端，执行：

```sh
npm ci
npm run typecheck
npm test
npm run web
```

浏览器打开 `http://localhost:8081`。首次安装依赖需要联网；`node_modules` 没有随包迁移。Windows 如果 PowerShell 阻止 `npm.ps1`，可使用 `npm.cmd` / `npx.cmd`，或改在命令提示符中运行，无需修改系统执行策略。

静态预览：

```sh
npm run build:web
npm run preview:web
```

打开 `http://127.0.0.1:8082`。`npm start` 启动 Expo 开发服务；学校内置浏览器和其他原生能力应通过兼容的原生构建验收。

## 2. 让 Claude 或其他助手接手

用编码助手打开解压后的 `ClassFlow` 根目录，提供下面这段话，再补充你的下一项需求：

> 请先阅读 CLAUDE.md、HANDOFF.md 和 README.md，检查 package.json 及当前源码。这个项目从另一台电脑迁移而来，请沿用现有实现和锁文件，先恢复运行环境。首次启动为空白、导入默认覆盖课程并保留个人安排等规则必须保留。请区分已经验证的功能和仍待真机验收的内容。我的下一步需求是：……

`CLAUDE.md` 是简短的开发约定；本文件记录迁移细节；`README.md` 包含更完整的功能、导入格式和历史验证记录。旧聊天不会随 ZIP 迁移，继续工作所需的主要背景已写在这些文件中。

## 3. 当前实现和关键文件

当前版本为 0.1.15 / Android versionCode 17，包名 `app.classflow.mobile`。主要技术版本来自 `package.json`：Expo 56、React Native 0.85、React 19.2.3、TypeScript 5.9。

已实现课表概览、周 / 日时间画布、课程与个人安排的增删改、拖动和时长调整、冲突提示、撤销、本地保存、JSON 备份、学期设置、CSV / HTML / JSON 导入和原生学校浏览器。支持浅色 / 深色与响应式布局。“拍照翻译”目前只是未来功能入口。

| 文件 / 目录 | 用途 |
| --- | --- |
| `App.tsx` | 页面状态协调、导航、导入提交、AsyncStorage 持久化 |
| `src/domain/schedule.ts` | 数据类型、初始空白状态、旧数据恢复、周次、布局、校验 |
| `src/domain/import.ts` | 文件解析、重复和冲突分析 |
| `src/domain/canvas.ts` | 拖动吸附、边界与时长 |
| `src/components/Calendar.tsx` | 时间画布和课程卡片 |
| `src/components/Sheets.tsx` | 编辑、导入预览、设置面板 |
| `src/components/SchoolBrowser.tsx` / `.web.tsx` | 原生 WebView 与 Web 替代入口 |
| `src/features/timetableBrowserScript.ts` | 页面检测、DOM / iframe / XHR / fetch 课表读取 |
| `src/features/zhengfang.ts` | 正方字段、周次、节次、作息标准化 |
| `src/features/schools.ts` | 学校域名与桂林洋校区作息配置 |
| `src/ui/`、`src/services/files.ts` | 主题、界面基础组件、文件导入导出 |
| `tests/`、`examples/` | 单元 / 浏览器回归与虚构或脱敏课表 |
| `app.json`、`scripts/with-android-gradle.cjs` | Expo 配置与 Gradle 兼容插件 |

近期修复：学校页面改写 `Array.prototype.filter` 引起的读取失败；网格与隐藏列表重复识别；合并行星期和节次继承；注释误认课程；分段单双周；首次启动空白和旧示例迁移；部分勾选时的覆盖导入规则。不要重新引入这些问题。

## 4. 测试与当前验证范围

本次打包前重新执行并通过：TypeScript 类型检查、27 项业务测试；最新版 APK 的 SHA-256 与 README 一致。本次没有重新构建 APK，也没有重新进行真机验收。

当前迁移执行环境只有 Node 可直接调用、npm 不在 PATH，实际检查使用 `node node_modules/typescript/bin/tsc --noEmit` 和 `node --experimental-strip-types --test tests/*.test.ts`，分别对应项目的 `typecheck` 和 `test` 脚本。新电脑使用完整 Node 安装即可按上面的 npm 命令运行。

课表读取回归无需学校账号，先安装测试浏览器：

```sh
npx playwright install chromium
npm run test:browser
npm run test:embedded
npm run test:compat
npm run test:hainnu
```

界面回归：先启动 `npm run build:web`、`npm run preview:web`，保持预览服务运行，再在另一个终端执行：

```sh
npm run test:canvas
npm run test:layout
npm run test:panels
```

浏览器路径可以用 `CLASSFLOW_BROWSER` 指定，界面测试地址可以用 `CLASSFLOW_URL` 指定，默认 `http://127.0.0.1:8082`。截图写入 `.qa/`。

README 记录了历史上的真实学校页面 DOM 验证、浏览器交互验证及 APK 签名 / 对齐检查。Android 真机内完整的登录→识别→预览→导入流程、原生键盘 / 触觉 / 帧率及 iOS 真机仍需验收。海南师大适配器仍为 `pending`，不可把浏览器通过等同于真机通过。

## 5. Android 继续构建

迁移包保留干净的 `android/` 工程、Gradle Wrapper 和原有开发签名，省去恢复这些文件的步骤；不包含 SDK、JDK、Gradle 缓存和旧机器的路径配置。

原项目使用的工具版本：JDK 17、Android SDK 36、Build Tools 36.0.0、NDK 27.1.12297006、CMake 3.22.1、Gradle 8.14.3。按新电脑实际安装位置设置 `JAVA_HOME`、`ANDROID_HOME`，并保证 Java 和 Node 可被终端找到；也可通过本机 `android/local.properties` 设置 `sdk.dir`。这些绝对路径不能从旧电脑照抄。

连接开启 USB 调试的手机或启动模拟器后，运行 `npm run android`。生成与当前 ARM64 安装包相同架构的自用 Release APK，Windows PowerShell 执行：

```powershell
cd android
.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
cd ..
```

macOS / Linux 使用 `chmod +x android/gradlew`，再在 `android/` 下执行 `./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a`。输出为 `android/app/build/outputs/apk/release/app-release.apk`。x86_64 模拟器需要对应架构，不能安装这个 ARM64 专用包。

Android 配置或原生依赖变化需要同步工程时，再运行 `npx expo prebuild --platform android`。运行前备份原生改动和 `android/app/debug.keystore`；不要随意用 `--clean` 丢弃现有工程。更改版本时核对 `package.json`、`app.json` 和 `android/app/build.gradle` 中相应版本。Gradle 插件把模板中的 9.3.1 换为 8.14.3，以处理原项目记录的工具链兼容问题。

发布前可在项目根目录检查实际新包内的识别脚本：

```powershell
powershell -File scripts/verify-android-import.ps1 -ApkPath android/app/build/outputs/apk/release/app-release.apk
```

此脚本需要 Node 和可用的 Playwright Chromium（或通过 `-BrowserPath` 指定 Edge / Chromium），会比较 APK 内识别脚本并运行兼容与海南师大结构回归。

正式分发版从 0.1.8 起使用别名为 `kenshi` 的发布密钥（证书 `CN=kenshi, O=ClassFlow`）。密钥库和密码保存在仓库之外（所有者本机 `E:\ClassFlow-signing\`），通过 Gradle 用户目录的 `gradle.properties` 中 `CLASSFLOW_RELEASE_STORE_FILE`、`CLASSFLOW_RELEASE_STORE_PASSWORD`、`CLASSFLOW_RELEASE_KEY_ALIAS`、`CLASSFLOW_RELEASE_KEY_PASSWORD` 提供；没有这些属性时 release 构建回退到 `android/app/debug.keystore`，只用于本地自测。kenshi 密钥一旦丢失就无法发布可覆盖安装的更新，换电脑时须手动迁移并另行备份，绝不提交到仓库。0.1.7 及以前的安装包使用 `android/app/debug.keystore` 开发签名，与 kenshi 签名不同，从旧版换到 0.1.8 需要先导出备份、卸载再安装。

`npm run build:android` 仅验证 Android JavaScript 导出，不能生成可安装 APK。`eas.json` 保留 `preview` APK 配置，使用时需自行登录 Expo 并关联项目；包内没有迁移登录凭据。iOS 原生开发需要 macOS / Xcode 或适当的 EAS 构建环境。

## 6. 包中包含和省略的内容

包含源码、配置、锁文件、资源、测试、样例、交接文档、无构建缓存的 Android 工程，以及 `dist/ClassFlow-Android-0.1.3-ImportFix.apk`。

省略 `node_modules/`、`.expo/`、`.npm-cache/`、`.pnpm-store/`、`.tools/`、`.qa/`、Android `build/` / `.gradle/` / `.cxx/`、`local.properties`、旧版 APK 和 Web 导出产物。`.tools/` 内的历史构建脚本依赖旧机 `C:/cf-build-298/` 等绝对路径，故以本说明中的标准构建流程替代。没有打包学校原始抓取数据或浏览器登录会话。

源目录的 Git 仓库尚无任何提交，所有源码都未跟踪，因此没有可携带的提交历史，迁移包不包含 `.git/`。新电脑需要版本管理时可以 `git init` 后自行提交。现有 `.gitignore` 忽略生成的 `android/`；如果以后手工维护原生代码，需要相应调整跟踪策略并保护签名文件。

个人课表数据存于设备 / 浏览器的 AsyncStorage，键为 `classflow.schedule.v1`，不在源码里。**如需迁移个人课程，请在旧设备 App 中先导出 JSON 备份，再到新设备导入。** 不同浏览器来源（如 localhost 与 127.0.0.1）也可能有各自独立的数据。

随包 APK 大小为 32,498,557 字节，SHA-256：

```text
34E6A6AFB7C8D0B412D65CF789E25C738A29B00852A75650F4C4857EFA21C9A9
```

迁移 ZIP 内的 `PACKAGE-MANIFEST.json` 列出打包文件的大小和 SHA-256（清单自身除外）；旁边的 `.sha256.txt` 用于检查整包传输完整性。脚本创建后会重新读取 ZIP，并逐个核对文件内容与清单。

以后需要重新打包，在 Windows 项目根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-transfer.ps1
```

输出到 `dist/transfer/`。命令中的执行策略参数只对本次 PowerShell 进程生效，不修改系统设置，用于运行随项目提供的已审阅脚本。脚本打包当前工作区，无需先 Git 提交；采用明确的源码目录与根文件列表，新增其他目录时需相应更新脚本。它要求当前 `app.json` 版本对应的 `dist/ClassFlow-Android-<版本>-ImportFix.apk` 已存在，且不会替你重新构建 APK。
