# 贡献指南

欢迎提交问题和修改。提交 Issue 前请先搜索是否已有相同反馈；涉及学校课表读取的问题，请只提供脱敏后的页面结构，不要附上账号、Cookie、原始课表页面或个人课表数据。

## 下载并运行

安装 Git 和完整的 Node.js 24 环境，然后执行：

```sh
git clone https://github.com/aesfadfs/ClassFlow.git
cd ClassFlow
npm ci
npm run web
```

浏览器访问 http://localhost:8081。Windows 若无法运行 `npm.ps1`，可使用 `npm.cmd`。

开始修改前阅读 [CLAUDE.md](CLAUDE.md)、[HANDOFF.md](HANDOFF.md) 和 [README.md](README.md)，其中记录了必须保留的业务规则（首次启动空白、导入默认覆盖课程并保留个人安排、不猜测未知上课时间等）。

## 提交修改

1. 在 GitHub 上 Fork 本仓库，克隆自己的 Fork。
2. 每项修改使用一个分支，以下 `feature/my-change` 可换成描述任务的名称：

```sh
git switch main
git pull --ff-only
git switch -c feature/my-change
```

3. 修改文件后，执行检查并提交：

```sh
npm run typecheck
npm test
git status
git add <本次修改的文件路径>
git commit -m "说明本次修改"
git push -u origin feature/my-change
```

4. 在 GitHub 向本仓库的 `main` 分支发起 Pull Request，说明修改内容及验证结果（实测了哪些平台、哪些仍未验证），由维护者检查后合并。

导入读取脚本的改动请至少运行 `npm run test:compat`、`npm run test:hainnu` 和 `npm run test:embedded`。Web / 浏览器测试不能替代 Android、iOS 真机验收。

## 仓库内容与 Android 签名

Git 跟踪源码、配置、锁文件、资源、测试、样例、文档和 Android 原生工程。依赖、缓存、构建输出、本机 SDK 路径及签名密钥不上传。最新版 APK 通过仓库 Releases 提供。

Android 环境要求见 HANDOFF.md。克隆后没有 `android/app/debug.keystore`；仅当该文件不存在时，可在项目根目录用 JDK 的 `keytool` 生成自己的开发签名：

```sh
keytool -genkeypair -v -keystore android/app/debug.keystore -storepass android -alias androiddebugkey -keypass android -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000
```

该命令只用于开发测试。正式分发版由维护者用单独的发布密钥签名；本地构建得到的是开发签名包，不能覆盖安装正式版，测试前需先导出课表备份并卸载正式版。

不要提交 `.env`、登录令牌、学校原始页面、浏览器会话、个人课表备份或签名密钥。
