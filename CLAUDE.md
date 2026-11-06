# 课序 ClassFlow — AI 接手入口

先阅读根目录 `HANDOFF.md`（迁移、当前状态、验证边界）和 `README.md`（功能与详细操作），再根据用户的新需求工作。此文件适用于 Claude，也可供其他编码助手阅读。

## 项目约定

- 使用中文与用户沟通。项目是 Expo 56 / React Native 0.85 / React 19 / TypeScript 应用，支持 Android、iOS 和 Web；当前版本 0.1.13，Android versionCode 14。
- 使用 npm 和已有 `package-lock.json`，新电脑先执行 `npm ci`。不要为迁移主动升级框架或重写项目。
- 首次启动必须为空白，不能自动添加示例课程或个人安排。旧数据迁移只能清理仍标为未修改示例的数据，保留真实用户数据。
- 学校、CSV、HTML、JSON 导入默认覆盖课程并保留个人安排；用户关闭覆盖选项才合并。取消部分课程勾选不能改变覆盖模式。导入和编辑要保留撤销能力。
- 课程的离散周次、单双周、合并行及节次含义必须保留。未知上课时间要提示用户确认，不能猜测。桂林洋校区作息来自用户确认，不能套用到其他校区；第 10 节为 20:20–21:05。
- 学校登录由用户自行完成。不要采集登录表单、密码、Cookie 或请求头，不要上传学校页面。域名和桥接数据校验不可放宽以绕过错误。
- Web 不能直接读取学校跨域登录后的页面；原生使用 `react-native-webview`。学校适配器的 `pending` 表示完整原生流程仍需真机验收，不能仅凭浏览器测试改成 `ready`。
- 保持浅色 / 深色、自适应布局、减少动态效果、中文文案及现有 Reanimated 手势行为。
- `App.tsx` 协调状态与持久化；`src/domain` 放纯业务规则；`src/components` 放界面；`src/features` 放学校识别和适配。优先沿用现有结构。

## 验证与交付

- 业务改动后执行 `npm run typecheck` 和 `npm test`，按修改范围选择 `package.json` 中的浏览器回归。导入读取脚本改动至少关注 `test:compat`、`test:hainnu` 和 `test:embedded`。
- Web / 浏览器测试不能代替 Android、iOS 真机验收。报告时区分本次实测、README 历史记录和未验证项。
- `npm run build:android` 只导出 JavaScript 资源，不生成 APK。可安装 APK 需 Gradle 或 EAS 构建。
- 原生依赖或代码更新后要重新构建 APK；复制旧 APK 或只更新源码不算完成。发布前使用 `scripts/verify-android-import.ps1` 核验 APK 内识别脚本与源码一致。
- 保留 `scripts/with-android-gradle.cjs` 的 Gradle 8.14.3 兼容处理。正式分发版用仓库外的 kenshi 发布密钥签名（见 HANDOFF.md），密钥库和密码绝不进仓库、对话或日志；`android/app/debug.keystore` 只作本地自测回退，不要随意替换，也不要用它签名公开发布的版本。
- 不依赖旧电脑的 `.tools`、SDK 路径或对话记录。具体环境、构建和迁移办法见 `HANDOFF.md`。
