# llmpro

llmpro 桌面客户端 —— 一键把 Claude Code / Codex 指向 llm-center 网关。

## 下载安装

安装包和自动更新文件发布到 OBS；GitHub Release 只保留兼容旧版本的桥接清单。

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `llmpro_x.y.z_aarch64.dmg` |
| Windows | `llmpro_x.y.z_x64-setup.exe` |
| Linux | `llmpro_x.y.z_amd64.AppImage` / `.deb` |

## 发布流程

正常发版使用 `release.yml`。它复用私有源码仓 `llmpro-build.yml` 已成功生成的 macOS/Windows 候选包，只执行签名、公证、updater 清单和 OBS 发布，不再重复编译 Rust。

发布阶段的时间边界：

- 候选包已就绪时，macOS/Windows 并行封装在 5 分钟内完成；
- Apple 公证排队时间和 GitHub/OBS 上传时间取决于实际服务与带宽；
- 从源码冷编译仍使用 `release-full.yml`，该路径通常需要数十分钟。

`release.yml` 要求同一个源码 commit 存在成功的 `llmpro-build.yml` run，并包含两个 artifact：

- `llmpro-macOS-aarch64-apple-darwin`
- `llmpro-Windows-x86_64-pc-windows-msvc`

可手动填写 `candidate_run_id` 锁定候选构建。仅修复单个平台时，将 `platform` 设为 `macos` 或 `windows`；正常发版保持 `all`。

## macOS 发布要求

macOS 安装包使用 Developer ID Application 证书签名与公证。公开仓库 Actions secrets 需要配置：

- `APPLE_CERTIFICATE`：Developer ID Application `.p12` 文件的 base64 内容
- `APPLE_CERTIFICATE_PASSWORD`：`.p12` 导出密码
- `APPLE_SIGNING_IDENTITY`：证书完整名称，例如 `Developer ID Application: Your Name (TEAMID)`
- `APPLE_ID`：Apple Developer 账号
- `APPLE_APP_SPECIFIC_PASSWORD`：App 专用密码
- `APPLE_TEAM_ID`：Apple Team ID

缺少任意一项时，macOS 发布任务会直接失败，不会生成未签名或未公证的 DMG。

## OBS 发布配置

公开仓 `Actions` 使用以下配置上传到 Huawei Cloud OBS：

Repository Variables：

- `OBS_BUCKET`：OBS 桶名，例如 `assets-hub`
- `OBS_ENDPOINT`：OBS 服务 endpoint
- `OBS_PUBLIC_BASE_URL`：客户端可访问的公开下载地址，不填控制台地址

Repository Secrets：

- `OBS_ACCESS_KEY`：OBS AK
- `OBS_SECRET_KEY`：OBS SK

对象路径固定为：

```text
llmpro/<version>/*
llmpro/latest.json
```

`latest.json` 和安装包会先上传到 OBS，再把 GitHub Release 中的 `latest.json` 替换为 OBS 地址。这样已经安装旧版本的用户仍能从 GitHub 获取一次桥接清单，之后更新直接走 OBS。

## 自动更新

应用启动后会自动检查更新，有新版本时会在界面右上角提示，点击「立即更新」即可自动下载并重启，无需手动重装。

> 本仓库仅用于分发安装包，源代码不公开。
