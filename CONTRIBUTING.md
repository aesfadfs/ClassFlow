# 朋友协作指南

## 加入私有仓库

仓库所有者在 GitHub 仓库的 **Settings → Collaborators → Add people** 中输入朋友的 GitHub 用户名并发送邀请。朋友接受邀请后，才能查看、克隆和提交修改；仅转发私有仓库链接不会授予访问权限。每个人使用自己的 GitHub 账号。

## 下载并运行

安装 Git 和完整的 Node.js 24 环境，然后执行：

```sh
git clone https://github.com/aesfadfs/ClassFlow.git
cd ClassFlow
npm ci
npm run web
```

浏览器访问 http://localhost:8081。Windows 若无法运行 `npm.ps1`，可使用 `npm.cmd`。Git 提示认证时，使用自己的 GitHub 账号完成浏览器登录。

开始修改前阅读 [CLAUDE.md](CLAUDE.md)、[HANDOFF.md](HANDOFF.md) 和 [README.md](README.md)。

## 提交修改

每项修改使用一个分支，以下 `feature/my-change` 可换成描述任务的名称：

```sh
git switch main
git pull --ff-only
git switch -c feature/my-change
```

修改文件后，执行检查并提交：

```sh
npm run typecheck
npm test
git status
git add <本次修改的文件路径>
git commit -m "说明本次修改"
git push -u origin feature/my-change
```

在 GitHub 点击 **Compare & pull request**，目标分支选择 `main`，说明修改内容及验证结果，请仓库所有者检查并合并。建议双方约定通过 Pull Request 合并；此约定本身不等于已设置强制分支保护。

合并后，各自在本机运行 `git switch main` 和 `git pull --ff-only` 同步。开始新任务时再创建新分支。若工作区有未提交修改，先提交或暂存，避免切换分支时丢失工作。

## 仓库内容与 Android 签名

Git 跟踪源码、配置、锁文件、资源、测试、样例、文档和 Android 原生工程。依赖、缓存、构建输出、本机 SDK 路径及签名密钥不上传。最新版现有 APK 通过仓库 Releases 提供；GitHub 的 **Code → Download ZIP** 可下载源码，但日常协作推荐 `git clone`。

Android 环境要求见 HANDOFF.md。克隆后没有 `android/app/debug.keystore`；仅当该文件不存在时，可在项目根目录用 JDK 的 `keytool` 生成自己的开发签名：

```sh
keytool -genkeypair -v -keystore android/app/debug.keystore -storepass android -alias androiddebugkey -keypass android -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000
```

该命令只用于开发测试。不同密钥签出的 APK 不能直接覆盖原有签名的安装包；不要覆盖所有者本机现有密钥。需要继续给原有安装提供覆盖升级时，由所有者保留原签名构建。正式发布需另行配置生产签名。

不要提交 `.env`、登录令牌、学校原始页面、浏览器会话、个人课表备份或签名密钥。业务或原生改动的验证要求见 CLAUDE.md；Web 测试不能替代真机验收。
