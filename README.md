# llmpro

llmpro 桌面客户端 —— 一键把 Claude Code / Codex 指向 llm-center 网关。

## 下载安装

前往 [**Releases**](https://github.com/quhongli123/llmpro-release/releases/latest) 下载对应平台的安装包：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `llmpro_x.y.z_aarch64.dmg` |
| Windows | `llmpro_x.y.z_x64-setup.exe` |
| Linux | `llmpro_x.y.z_amd64.AppImage` / `.deb` |

## macOS 发布要求

macOS 安装包必须使用 Developer ID Application 证书签名，并通过 Apple notarization 后再发布。
公开仓库的 Actions secrets 需要配置：

- `APPLE_CERTIFICATE`：Developer ID Application `.p12` 文件的 base64 内容
- `APPLE_CERTIFICATE_PASSWORD`：`.p12` 导出密码
- `APPLE_SIGNING_IDENTITY`：证书完整名称，例如 `Developer ID Application: Your Name (TEAMID)`
- `APPLE_ID`：Apple Developer 账号邮箱
- `APPLE_PASSWORD`：该 Apple ID 的 app-specific password，不是 Apple ID 登录密码
- `APPLE_TEAM_ID`：Apple Developer Team ID

缺少任意一项时，macOS 发布任务会直接失败，不会生成未签名的可下载 DMG。

## 自动更新

应用启动后会自动检查更新，有新版本时会在界面右上角提示，点击「立即更新」即可自动下载并重启，无需手动重装。

> 本仓库仅用于分发安装包，源代码不公开。
