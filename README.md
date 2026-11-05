# 课序 · ClassFlow

安排课程，也为自己留一点空白。

朋友加入私有仓库、下载运行及提交修改，请阅读 [朋友协作指南](CONTRIBUTING.md)。GitHub 仓库保留 Android 工程，但不包含签名密钥；现有 APK 从仓库 Releases 下载。下文 `dist/` 路径指本地构建或下载后的位置。

换电脑或让 Claude 接手，请先阅读 [迁移与开发交接说明](HANDOFF.md) 和 [AI 开发约定](CLAUDE.md)。

课序使用 Expo 和 React Native，同一套 TypeScript 源码支持 Android、iOS 和 Web 预览。界面跟随系统浅色或深色外观，随窗口宽度和高度调整布局。主页是「接下来」卡片列表：最近的课程或待办在最上面，滚到顶部的卡片会停住，后面的卡片盖上来时把它压成逐层缩小的一叠；「查看完整课表」进入七天详情，时间规划也提供摘要入口。课表、规划、工具三页可在任意位置左右滑动切换，底部是液态玻璃风格的导航。周视图在当前宽度内显示七天，日视图用于查看和编辑详细信息。

## 运行

需要 Node.js 22.13+，推荐使用 Node.js 24 LTS。

```sh
npm install
npm run web
npm start
```

Web 预览默认在 `http://localhost:8081`。iOS 原生开发需要 macOS 和 Xcode，也可使用 EAS Build。

### Android 原生构建

最新本地构建为 `dist/ClassFlow-Android-0.1.7-Stack.apk`（2026-11-05，versionCode 8），用法与说明见下方 0.1.4–0.1.7 一段。以下为 0.1.3 的历史记录：当时的安装包为 `dist/ClassFlow-Android-0.1.3-ImportFix.apk`（2026-11-04，versionCode 4），适用于 Android 7.0 及以上的 ARM64 设备，约 32.5 MB，并包含此前的课表识别和 UI 修复。`dist/ClassFlow-Android-ImportFix.apk` 同步指向这次构建。它包含离线运行所需的代码和内置浏览器，沿用此前的开发签名，可直接覆盖安装。

0.1.4–0.1.7（2026-11-05）是界面与交互更新，课表识别和导入规则没有改动：

- 课表 / 规划 / 工具三页可整页左右滑动，带惯性和吸附；底部导航改为液态玻璃风格（iOS 26 使用系统 Liquid Glass，Android 用模糊模拟），可拖动导航上的玻璃块切换页面。
- 主页「接下来」改为可滚动的置顶堆叠卡片：最多保留 3 层可见，更深的逐渐淡出；支持触摸惯性、鼠标滚轮、键盘（↑↓、PageUp / PageDown、Home / End、Enter 编辑）和读屏的上下轻扫。列表变化时保留当前停留的卡片。单击卡片软回弹，长按编辑。
- 卡片和面板默认采用雾化玻璃质感，默认背景为柔和色彩光晕；系统开启「降低透明度」时改回不透明样式。
- 「偏好设置 → 外观与操作」可设置自定义背景及遮罩深浅、启动问候、详细课表拖动开关和振动反馈。课程卡片图片可用于同名课程全部或仅这一条，并可单独开启雾化。背景和卡片图片只保存在本机，不进入 JSON 备份。
- 打开时显示灰色遮罩和按早上 / 中午 / 下午 / 晚上随机的问候语，随后以圆形遮罩揭开主页；轻点可跳过，可在设置中关闭。自动化浏览器测试中会跳过此遮罩。
- 修复快速左右滑动时的按压闪烁、卡片翻走时 Android 上的半透明叠层毛糙。

0.1.7 通过 TypeScript、31 项业务测试和布局、面板、画布浏览器回归；另有本地浏览器检查覆盖翻页、卡片滚动（触摸、滚轮、键盘）、外观设置和启动问候。识别脚本未改动，0.1.6 时已跑过内嵌、兼容、海南师大结构回归。Release APK 版本号和签名证书与此前一致，`scripts/verify-android-import.ps1` 对 0.1.7 APK 全部通过（含包内脚本的兼容和海南师大结构回归）。真机上的模糊效果、动画流畅度和振动手感尚待 Android 真机确认，iOS 未验证。

0.1.3 将首次启动改为完全空白：没有课程、个人安排或自动生成的示例。覆盖升级时，仅清空仍标记为未修改示例的数据；已保存或导入的用户课表正常恢复。学校、CSV、HTML、JSON 导入默认覆盖现有课程并保留个人安排，可取消「覆盖现有课程」切换为合并导入。取消部分课程勾选不会悄悄切回合并模式，确认后以本次选中的有效课程覆盖，仍支持撤销。

0.1.3 通过 TypeScript 和 27 项业务测试，覆盖空白初始化、旧示例迁移、用户数据保留及导入替换规则。浏览器实测全新来源显示 0 课程 / 0 个人安排，刷新后仍为空；创建旧课程后，默认覆盖导入选中的新课程，刷新后旧课程没有恢复。Release 构建、APK v2 签名、16 KB ZIP 对齐及包内版本检查通过，构建输入与当前应用源码一致。SHA-256：`34E6A6AFB7C8D0B412D65CF789E25C738A29B00852A75650F4C4857EFA21C9A9`。

0.1.1 修复学校页面已经打开、却提示“课表页面读取失败”的兼容问题：学校的脚本将 `Array.prototype.filter` 回调改为 `(index, value)`，旧安装包会因此把索引当作页面节点，导致读取中断。识别脚本使用私有过滤循环，不修改学校网页的原型；可选的 DOM 检查失败也不会阻断学校自身的 XHR / fetch 请求。本次从旧 APK 提取实际识别脚本复现了相同报错，重新构建后又从新 APK 提取脚本运行同一组回归，避免源码已修好但安装包仍包含旧代码。

0.1.2 进一步修复真实课表的网格与隐藏列表重复识别、列表合并行丢失星期 / 节次，以及将底部注释误认成课程的问题。周次按各段分别处理单双周，保留 `4周,9周,13-19周(单)` 中的第 4 周。学校页面只有节次、没有钟点时，对匹配桂林洋校区的课表使用用户提供并确认的作息，导入预览中标明来源并允许修改；第 10 节为 20:20–21:05。

2026-11-04 已在用户授权的真实学校登录会话中运行当前源码的 DOM 读取器：网格、列表各识别 13 条授课安排，字段一致，识别警告和标准化错误均为 0；第 10 周的 11 节课程与用户参考图一致。将这次读取结果送入隔离的本地 Web 验证副本后，完成 412×915 手机宽度下的预览、作息修改与恢复、替换示例、导入 13 条和刷新恢复检查。该副本只替换原生浏览器桥接入口，使用生产导入与保存逻辑；真实抓取结果及验证入口没有加入发布包。以上不等同于在 Android 真机内完成登录和导入。

0.1.2 验证通过 TypeScript、26 项业务测试、标准课表 / 内嵌页面回归、7 个学校脚本兼容场景，以及真实页面脱敏结构的网格 / 列表 / 双视图 3 种回归。Release 构建含 Lint Vital，APK v2 签名、16 KB ZIP 对齐及包内版本检查通过；从最终 APK 提取的识别脚本与源码完全一致，并通过兼容和海南师大结构回归。

本项目提供 TypeScript 检查、业务测试和课表浏览器集成测试。新增 WebView 是原生依赖，旧 APK 不包含它，更新代码后需要重新安装新版 APK。真实学校登录、键盘、触觉反馈和实际帧率仍需真机验收。

本次 UI 修复通过 TypeScript、25 项业务测试，以及 320×568、390×844、412×915、768×1024、1440×900、844×390 的浏览器布局检查。交互回归覆盖自由跟手、松手吸附、时长调整、跨日移动、撤销、保存恢复、触摸、深色模式与减少动态效果；另验证新增、保存、删除、设置、导入后的面板退出及横竖屏切换。Android Release 构建（含 Lint Vital）、APK v2 签名和 16 KB ZIP 对齐检查通过。当前未连接 Android 设备，原生触摸体验及 iOS 尚未真机验收。

本地开发需要 JDK 17、Android SDK 36、Build Tools 36.0.0、NDK 27.1.12297006 和 CMake 3.22.1。连接开启了 USB 调试的安卓设备，或启动 Android Studio 模拟器后运行 `npm run android`。如果 Windows 构建工具报路径编码错误，将项目放在较短的纯英文路径下再构建。

本地可生成自用 APK。先运行 `npx expo prebuild --platform android`，再进入 `android` 目录运行 `gradlew.bat :app:assembleRelease`（macOS / Linux 用 `./gradlew :app:assembleRelease`）。安装包位于 `android/app/build/outputs/apk/release/`，使用开发签名。

已有 Expo 账号时，也可用预置的 `preview` 配置生成可直接安装的 APK。首次构建按 CLI 提示关联 EAS 项目并设置签名凭据。

```sh
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

`npm run build:android` 可以在没有 Android SDK 的环境中验证 Android JavaScript 打包，输出到 `dist/android`。

```sh
npm run typecheck
npm test
npm run build:web
npm run preview:web
```

## 已实现

- 按学期日期计算周次，手机 / 桌面均可快捷切换周 / 日视图，回到本周。
- 全天连续时间画布，首次定位到最早安排附近；课程与自定义活动均可拖动，底边可调整时长。
- 拖动时自由跟随手指或鼠标，松手后用弹簧动画贴合最近日期及 5 分钟网格，靠近其他卡片时优先吸附其实际边缘；周视图支持跨日移动，重叠卡片自动并排。调整保留原周次并支持撤销。
- 概览、详情和标签页切换带进出动画；保存、删除、导入和设置完成后，面板播放退出动画再关闭。动效参照 Motion.Lab 的弹簧物理模式，使用现有 Reanimated 实现。
- 添加、编辑、删除课程及个人安排，删除后可以撤销。
- 编辑名称、星期、起止时间、教师、地点、备注、颜色、周次与单双周。
- 点按时间轴空白创建安排，按日查看可用时间段。
- 时间冲突提示、并排显示冲突课程，允许明确确认后保留重叠。
- 原生内置浏览器登录学校教务、自动检测正方课表并提取；同时支持模拟课表及 HTML、UTF-8 CSV、JSON 导入。确认前可逐条选择，查看异常、重复和时间冲突，导入后可撤销。
- 本地持久化、JSON 备份导出、学期设置。
- iOS 使用原生 Liquid Glass（系统支持时）和 SF Symbols。Android 的悬浮导航使用静态半透明表面以控制绘制成本，Web 使用背景模糊；Android 和 Web 使用 SVG 图标。
- Reanimated 按压反馈、支持速度交接及中途打断的手机编辑面板；减少动态效果与减少透明度适配。

初次启动为**全空白课表**，不预填任何课程或个人安排。只有主动添加或确认导入才会生成安排。

## 导入课表

识别支持动态写入的同源内嵌页面；受隔离限制、无法直接读取的已知教务课表链接会在内置浏览器直接打开。除标准正方标签外，还可按星期表头、合并单元格及明确标注的节次解析课程。手动“重新识别”会重新报告结果，并等待内容稳定后提交；未响应或字段缺失时显示具体提示。`npm run test:embedded` 验证这些场景，测试模拟 Android 只向顶层页面注入脚本的行为。真实学校登录页面尚需用户设备验证。

登录入口使用用户提供的[海南师范大学统一身份认证](https://auth.hainnu.edu.cn:9443/cas/login)，课表提取仍适配[正方教务系统](https://zfjw.hainnu.edu.cn/jwglxt/)。Android / iOS 点击“导入课表”直接打开内置浏览器。在学校网页自行登录，进入学生个人课表，选择目标学期并查询整学期课表。课程加载稳定后会自动提取，进入核对流程。浏览器提供返回、刷新和重新识别；关闭浏览器可切换文件导入。网址校验单独允许认证主机的 9443 端口，不会放开其他主机的非标准端口。

课表提取优先读取页面请求返回的正方 `kbList` 课程字段，也支持 `.timetable_con` 网格 / 列表结构、动态 DOM 和同源 iframe。可识别的跨域正方课表 iframe 会在当前内置浏览器中打开。监听只读取课程字段，不读取登录表单、账号密码、Cookie 或请求头，不上传页面。学校导航和课表数据分别校验域名。

课程会转换为星期、实际开始 / 结束时间、教师、教室和明确周次数组；单双周和离散周次保留，非连续节次拆成多条安排。时间和节数自动检测：支持课表行、提示框、独立时间列、合并节次、接口作息列表及课程自带的起止时间。网页自带时间优先。网页缺少时间且学校域名、校区均匹配时，可补充已确认的校区作息；当前桂林洋配置来源是用户参考课表及 2026-11-04 的确认，并非学校页面返回。不会跨校区套用，也不会猜测未知节次或合并节次内部的时间。可在「核对或调整作息时间」修改并更新预览，仍缺少时间的记录单独提示，完整记录仍可导入。学期起始日期仍使用当前应用设置，需与所选学校学期一致。异常记录会单独提示，正常记录沿用重复检查、冲突提示和确认保存流程。

在「导入课表 → 学校教务」选择「体验教务导入演示」，可以主动用模拟课程体验识别、预览和确认；首次启动不会自动导入。所有导入来源默认覆盖现有课程，保留个人安排。预览中明确显示覆盖选项及其影响；取消勾选覆盖选项后，改为合并导入并跳过重复条目。确认保存后可通过提示条撤销。

自动识别已通过模拟正方 DOM / 接口测试，并在授权的海南师范大学真实登录页面核对网格和列表结果；Android 真机内置浏览器的完整流程尚未验收，因此学校登记中的状态仍为 `pending`。当前适配新正方结构，不宣称覆盖所有学校定制页面。网页版受跨域限制，无法读取学校登录后的内容，会明确引导使用原生 App 或课表文件。

浏览器集成测试使用虚构课表 [zhengfang-timetable.html](examples/zhengfang-timetable.html)，不需要学校账号。首次运行安装 Chromium：

```sh
npx playwright install chromium
npm run test:browser
npm run test:embedded
npm run test:compat
npm run test:hainnu
```

Windows 发布前可用 `powershell -File scripts/verify-android-import.ps1` 校验当前版本 APK 内识别脚本与源码完全一致，并直接对包内脚本执行兼容及海南师大结构回归。也可通过 `-ApkPath dist/ClassFlow-Android-0.1.3-ImportFix.apk` 指定文件，通过 `-BrowserPath` 或 `CLASSFLOW_BROWSER` 指定本机 Edge / Chromium。此检查会拒绝仍包含旧识别逻辑的 APK。海南师大回归使用 [hainnu-timetable.html](examples/hainnu-timetable.html) 中的脱敏结构，不需要账号。

也可通过 `CLASSFLOW_BROWSER` 环境变量指定本机 Chromium / Edge 可执行文件。测试覆盖登录页、异步加载、iframe、XHR / fetch、学期切换、过期响应、重复提取、敏感字段排除、提示框时间、合并节次和接口时间。

画布交互回归：先运行 `npm run build:web` 和 `npm run preview:web`，另一个终端运行 `npm run test:canvas`。默认测试 `http://127.0.0.1:8082`，可通过 `CLASSFLOW_URL` 指定预览地址。截图输出到 `.qa/`。

画布动效采用轻微抬起、阴影和弹簧回落，遵循系统减少动态效果设置。实现参考 [Gesture Handler Pan](https://docs.swmansion.com/react-native-gesture-handler/docs/legacy-gestures/pan-gesture/) 和 [Reanimated 手势动画](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/handling-gestures/)。原生长按卡片后拖动，Web 可直接拖动；点按仍打开编辑。拖动与调整时长会作用于该卡片原有的全部周次，提示条可撤销。

「课表文件」支持 [课序 HTML 示例](examples/timetable.html)。App 离线读取固定的 `<script type="application/json" id="classflow-timetable">` 数据块并解析 JSON，文件中的脚本不会执行。模板版本为 `1`，`periodTimes` 定义每节的起止时间，`courses` 包含课程名称及一个或多个 `meetings`。星期和节次从 1 开始，`weeks` 填实际授课周次。其他格式的教务网页需要专用适配器，可先使用 CSV。

CSV 模板可在 App 内下载，亦可参考 `examples/timetable.csv`。当前不直接解析 XLS / XLSX / PDF / 图片；Excel 请另存为 UTF-8 CSV。CSV 的“星期”可用 `周一`–`周日` 或数字 1–7，起止时间使用 `HH:MM`。

JSON 支持 App 导出的备份对象或课程数组；备份格式中的 `day` 是 0–6，`start` / `end` 是从午夜起的分钟数。恢复备份时可选择同时恢复学期日期和周数。

### 新增学校适配器

1. 从学校官网核对教务入口与统一认证域名。由账户持有者自行登录，获取已去除账号、会话和个人信息的课表 HTML 或导出样例。
2. 根据样例确认课程、星期、节次时间、地点和周次的含义。浏览器提取与标准化分别参考 `src/features/timetableBrowserScript.ts` 和 `src/features/zhengfang.ts`；离线 HTML 适配参考 `src/features/timetableAdapters.ts`，将每条授课安排转换为现有 `Entry`。
3. 添加脱敏样例和测试，覆盖空课表、页面结构变化、多时段和离散周次。接入学校入口前，验证真实页面和官方域名。用户点击导入后，在内置浏览器中自动检测课表；识别结果进入同一预览面板，经确认后保存。

导入流程参考 Dawn-Course 的解析器选择和预览确认设计。[Dawn-Course 导入实现](https://github.com/HF-CYGG/Dawn-Course/blob/main/feature/import/src/main/java/com/dawncourse/feature/import_module/ImportScreen.kt)

## 结构与后续扩展

```text
App.tsx                      应用布局与状态协调
src/domain/schedule.ts       周次、冲突、空闲时间、课程布局、校验
src/domain/import.ts         文件导入、重复与冲突分析
src/domain/canvas.ts         画布吸附、边界与时长计算
src/components/Calendar.tsx  自适应课表
src/components/Sheets.tsx    编辑、导入、设置面板
src/ui/primitives.tsx        原生玻璃、SF Symbols、按钮、无障碍设置
src/services/files.ts       原生 / Web 文件读写
src/features/schools.ts      学校适配器登记
src/features/timetableAdapters.ts  模拟课表与 HTML 数据适配
src/features/timetableBrowserScript.ts  页面检测、接口监听和课程提取
src/features/zhengfang.ts     正方课表校验、周次解析和节次标准化
src/components/SchoolBrowser.tsx  原生内置教务浏览器
tests/                      核心规则测试
```

工具箱为“拍照翻译”留出入口并明确标注未来计划，尚未请求相机权限或接入识别 / 翻译服务。后续可独立增加 `src/features/translation/`，不需要修改课表领域逻辑。

动效参考 [Emil Kowalski 的 animate-expo](https://github.com/emilkowalski/skills/blob/main/skills/animate-expo/SKILL.md) 和 [apple-design](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md)。原生材质参考 [Expo GlassEffect](https://docs.expo.dev/versions/v56.0.0/sdk/glass-effect/) 与 [Expo Symbols](https://docs.expo.dev/versions/v56.0.0/sdk/symbols/)。

原生 Liquid Glass、ProMotion 帧率、触感和键盘交互需要在 iPhone / Android 真机的发布构建中验收；Web 预览仅验证浏览器界面和业务流程。
