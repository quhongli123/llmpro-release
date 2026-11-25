# llmpro 打包发布 Runbook（AI 执行版）

> 最后验证：`v0.2.164`，2026-11-25（Asia/Shanghai）
>
> 本文档描述当前实际使用的 GitHub Actions 发布链路。任何 AI 或工程师执行正式发布前，应先完整阅读本文档，再检查实时仓库、Tag、OBS 和 workflow 状态。
>
> 文档同步位置：
>
> - 私有源码仓：`docs/发布部署.md`
> - 公开发布仓：`docs/RELEASE_RUNBOOK.md`
> - 两份内容应保持一致；流程变更时同时更新。

## 0. AI 最短执行路径

只有用户明确要求“提交、推送并发布”时，才执行正式发布。

```text
确认仓库/分支/未提交修改
-> 从 OBS 读取当前线上版本
-> 准备下一个 patch 版本
-> 同步四个版本文件和发布说明
-> 本地验证
-> 提交并推送私有源码 main
-> 创建并推送 annotated tag vX.Y.Z
-> 从 llmpro-release 运行 scripts/trigger-release.sh vX.Y.Z
-> 等待 prepare-release 和 release 两个 run 全部成功
-> 验证 GitHub Release、OBS、GitHub bridge、安装包和签名
-> 按“完成状态模板”报告
```

标准发布命令：

```bash
cd /Users/quhongli/Desktop/work/llmpro-release
./scripts/trigger-release.sh vX.Y.Z
```

脚本会：

1. 确认私有源码仓存在该 Tag；
2. 在公开发布仓触发 `prepare-release.yml`；
3. 等待 macOS / Windows 候选包构建；
4. 等待 `release.yml` 通过 `workflow_run` 自动接力；
5. 等待签名、公证、OBS 上传和 GitHub Release 公开；
6. 输出 Release 地址。

当前正常耗时参考：

- `prepare-release`：约 16 分钟；
- `release`：约 2-3 分钟；
- 总计：约 18-20 分钟，不含 GitHub hosted runner 排队和 Apple 公证排队。

## 1. 当前架构

```text
quhongli123/llmpro（私有源码）
  -> vX.Y.Z Tag
  -> quhongli123/llmpro-release/prepare-release.yml
       -> preflight
       -> macOS Apple Silicon 未签名 DMG
       -> Windows x64 未签名 EXE / MSI
       -> candidate artifacts
       -> release metadata artifact
  -> workflow_run
  -> quhongli123/llmpro-release/release.yml
       -> 复用 candidate artifacts
       -> macOS Developer ID 签名、公证、staple
       -> Tauri updater 签名
       -> GitHub draft Release
       -> OBS versioned assets
       -> OBS llmpro/latest.json
       -> GitHub bridge updater/latest.json
       -> 公开 GitHub Release
```

当前生产发布平台：

| 平台                | 产物                                                               |
| ------------------- | ------------------------------------------------------------------ |
| macOS Apple Silicon | `llmpro_X.Y.Z_aarch64.dmg`、`llmpro_aarch64.app.tar.gz`、`.sig`    |
| Windows x64         | `llmpro_X.Y.Z_x64-setup.exe`、`llmpro_X.Y.Z_x64_en-US.msi`、`.sig` |

Linux 不在当前正式发布 job 中，不能把 README 里的 Linux 文件名当作已发布事实。

## 2. 仓库、地址和权威来源

| 对象                | 地址                                                                                    | 用途                                      |
| ------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------- |
| 私有源码仓          | `quhongli123/llmpro`                                                                    | 发布代码、版本号、Tag、发布说明           |
| 公开发布仓          | `quhongli123/llmpro-release`                                                            | public Actions、签名、OBS、GitHub Release |
| OBS 版本目录        | `<OBS_PUBLIC_BASE_URL>/llmpro/<version>/`                                               | 实际安装包和 updater 文件                 |
| OBS stable manifest | `<OBS_PUBLIC_BASE_URL>/llmpro/latest.json`                                              | 客户端首选更新清单                        |
| GitHub bridge       | `https://raw.githubusercontent.com/quhongli123/llmpro-release/main/updater/latest.json` | 兼容旧客户端的桥接清单                    |
| GitHub Release      | `https://github.com/quhongli123/llmpro-release/releases/tag/vX.Y.Z`                     | 公开版本记录和安装包镜像                  |
| Huawei 镜像         | `f70296edad404aa3ac9f5d19edfc9121/inference/llmpro.git`                                 | 公司内代码镜像，不是安装包发布源          |

本机常用目录（目录可能变化，执行前以 `git remote -v` 为准）：

```text
私有源码：/Users/quhongli/Desktop/work/llmpro
发布仓：  /Users/quhongli/Desktop/work/llmpro-release
Huawei：  /Users/quhongli/Desktop/work/cc-switch
```

## 3. 发布前必须确认

```bash
pwd
git remote -v
git status --short --branch
git branch -vv
git diff --check
```

要求：

- 当前 checkout 是准备发布的源码基线。
- 已识别并保护用户已有 tracked / untracked 修改。
- 不执行 `reset --hard`、`clean -fd`、`stash` 来整理发布工作区。
- 不把无关改动混入发布提交。
- 不使用已经发布过的版本号、Tag 或 OBS 目录。
- 不打印或提交 secrets、token、证书、私钥、签名 URL。

读取当前线上版本：

```bash
curl -fsSL \
  '<OBS_PUBLIC_BASE_URL>/llmpro/latest.json' \
  | jq -r '.version'
```

下一个正式版本通常是当前版本的下一个 patch，例如 `0.2.164 -> 0.2.165`。

## 4. 发布版本需要修改的文件

版本使用三段式 `X.Y.Z`，Tag 使用 `vX.Y.Z`。以下文件必须一致：

```text
package.json
src-tauri/tauri.conf.json
src-tauri/Cargo.toml
src-tauri/Cargo.lock 中 [[package]] name = "llmpro"
```

同时新增：

```text
docs/releases/vX.Y.Z.md
src/whats-new/X.Y.Z.json
```

检查版本：

```bash
node scripts/verify-release-version.mjs
```

带 Tag 检查：

```bash
RELEASE_TAG=vX.Y.Z node scripts/verify-release-version.mjs
```

发布说明示例：

```markdown
## llmpro vX.Y.Z

- 用户可感知的修复或改进。
- 另一项用户可感知的修复或改进。
```

`src/whats-new/X.Y.Z.json` 格式：

```json
{
  "version": "X.Y.Z",
  "items": [
    {
      "type": "improve",
      "zh": "简体中文说明",
      "zh-TW": "繁體中文說明",
      "en": "English description.",
      "ja": "日本語の説明"
    }
  ]
}
```

允许的 `type`：`new`、`improve`、`fix`。

## 5. 本地验证

当前机器使用 Node 22。Node 20 可能触发 pnpm 的 `node:sqlite` 错误。

```bash
export PATH="/Users/quhongli/.nvm/versions/node/v22.23.5/bin:$PATH"

pnpm install --frozen-lockfile
pnpm typecheck
pnpm build:renderer
pnpm exec vitest run <本次相关测试>
```

Rust 相关修改至少运行：

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib <相关测试名> -- --nocapture
```

高风险或跨模块发布再增加：

```bash
pnpm test:unit
cargo test --manifest-path src-tauri/Cargo.toml --lib
git diff --check
```

验收标准：

- `verify-release-version.mjs` 输出与 Tag 对应的版本号。
- 类型检查、前端生产构建、相关测试真实通过。
- Rust 测试若使用过滤条件，不能把“只跑过滤用例”说成“全量 Rust 测试通过”。
- 编译通过、构建成功、workflow 成功、GitHub Release 成功、OBS 成功、线上下载成功是六个不同状态，分别报告。

## 6. 提交、Tag 和推送

只暂存本次发布文件：

```bash
git add <本次文件>
git diff --cached --stat
git diff --cached --check
git commit -m "chore(release): prepare llmpro vX.Y.Z"
git push origin main
```

创建 annotated Tag：

```bash
git tag -a vX.Y.Z -m "llmpro vX.Y.Z"
RELEASE_TAG=vX.Y.Z node scripts/verify-release-version.mjs
git push origin vX.Y.Z
```

验证远端 ref：

```bash
git ls-remote origin                     refs/heads/main       refs/tags/vX.Y.Z       'refs/tags/vX.Y.Z^{}'
```

Tag 必须指向已推送的源码提交。

Huawei 镜像需要同步时，把同一源码提交推送到 Huawei `main`；Huawei 镜像不负责安装包签名和 OBS 发布。

## 7. 正式触发发布

### 7.1 推荐方式

```bash
cd /Users/quhongli/Desktop/work/llmpro-release
./scripts/trigger-release.sh vX.Y.Z
```

只测试候选包、不自动发布：

```bash
gh workflow run prepare-release.yml   --repo quhongli123/llmpro-release   --ref main   -f source_ref=vX.Y.Z   -f macos_runner=macos-15   -f publish_after_build=false
```

macOS runner：

- 默认 `macos-15`：Apple Silicon 原生，快；
- `macos-15-intel`：仅用于原生 runner 长时间排队时的兜底，构建更慢；
- 正式发布默认保持 `macos-15`。

### 7.2 手动方式

```bash
gh workflow run prepare-release.yml   --repo quhongli123/llmpro-release   --ref main   -f source_ref=vX.Y.Z   -f macos_runner=macos-15   -f publish_after_build=true
```

记录 run：

```bash
gh run list   --repo quhongli123/llmpro-release   --workflow prepare-release.yml   --limit 5
```

候选包成功后，`release.yml` 应由 `workflow_run` 自动启动。若自动接力异常，可手动补触发：

```bash
gh workflow run release.yml   --repo quhongli123/llmpro-release   --ref main   -f source_ref=vX.Y.Z   -f release_tag=vX.Y.Z   -f platform=all   -f candidate_run_id=<prepare-run-id>
```

不要在没有 candidate artifact 时先触发 `release.yml`。

### 7.3 私有仓 Tag workflow 说明

私有源码仓 `.github/workflows/trigger-release.yml` 设计为 Tag 推送后触发公开仓的 `prepare-release.yml`。

当前已知问题：私有仓可能因 GitHub Billing / spending limit 未配置而无法获得 runner。表现为：

```text
The job was not started because recent account payments have failed
or your spending limit needs to be increased.
```

此时 Tag 本身仍然有效，发布可以继续。直接使用公开发布仓的 `scripts/trigger-release.sh` 或手动 `gh workflow run prepare-release.yml`。不要因为私有 Tag workflow 红灯而重推或覆盖 Tag。

## 8. Workflow 内部执行内容

### 8.1 `prepare-release.yml`

1. `Preflight release`
   - checkout 私有源码 Tag；
   - 校验版本、发布说明、in-app whats-new；
   - 校验 Apple / OBS / Tauri updater 配置；
   - 校验 OBS 当前版本小于目标版本。
2. 并行构建
   - macOS Apple Silicon：未签名 DMG；
   - Windows x64：未签名 NSIS EXE + MSI。
3. 上传 candidate artifact：
   - `llmpro-candidate-<source-sha>-macos`
   - `llmpro-candidate-<source-sha>-windows`
4. 上传 `llmpro-release-meta-<source-sha>`，供自动发布读取 Tag 和 source ref。

### 8.2 `release.yml`

由 `workflow_run` 自动触发时，会从 prepare metadata 读取 Tag，并锁定该次 prepare run 的候选包。

执行顺序：

1. Resolve release request；
2. 查找并校验 candidate artifacts；
3. 校验 OBS stable version；
4. 读取发布说明；
5. 创建或复用 draft GitHub Release；
6. macOS 签名、公证、staple、DMG 重打包、updater 签名；
7. Windows updater 签名；
8. 下载完整 Release assets；
9. 生成 updater manifest；
10. 使用安装客户端的公钥验证 updater 签名；
11. 上传并校验 OBS versioned assets；
12. 更新 OBS `llmpro/latest.json`；
13. 更新 GitHub Release `latest.json`；
14. 提交 GitHub bridge `updater/latest.json`；
15. 将 Release 从 draft 改为公开。

### 8.3 `release-full.yml`

冷启动兜底流程。不要在正常发布中优先使用。只有在 candidate artifact 缺失、prepare 链路不可用且用户明确接受更长构建时间时才使用。

## 9. Required GitHub configuration

公开发布仓 `quhongli123/llmpro-release` 需要以下 secrets：

```text
SOURCE_REPO_TOKEN
APPLE_CERTIFICATE
APPLE_CERTIFICATE_PASSWORD
APPLE_SIGNING_IDENTITY
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD   # 或 APPLE_PASSWORD
APPLE_TEAM_ID
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD  # 允许为空
OBS_ACCESS_KEY
OBS_SECRET_KEY
```

Repository variables：

```text
OBS_BUCKET
OBS_ENDPOINT
OBS_PUBLIC_BASE_URL
```

注意：

- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 允许为空；不要把空密码误判为缺失。
- 只检查 secret 名称和是否存在，不输出值。
- Apple / OBS / signing 配置缺失时，preflight 应在昂贵编译前失败。
- 私有源码仓可选变量：`LLMPRO_RELEASE_APP_CLIENT_ID`；可选 Secret：`LLMPRO_RELEASE_APP_PRIVATE_KEY`。它们只在私有 Tag workflow 可用时生效。

## 10. GitHub Release 与 OBS 产物

GitHub Release 正常应包含：

```text
latest.json
llmpro_X.Y.Z_aarch64.dmg
llmpro_aarch64.app.tar.gz
llmpro_aarch64.app.tar.gz.sig
llmpro_X.Y.Z_x64-setup.exe
llmpro_X.Y.Z_x64-setup.exe.sig
llmpro_X.Y.Z_x64_en-US.msi
llmpro_X.Y.Z_x64_en-US.msi.sig
```

OBS 路径：

```text
llmpro/X.Y.Z/llmpro_X.Y.Z_aarch64.dmg
llmpro/X.Y.Z/llmpro_aarch64.app.tar.gz
llmpro/X.Y.Z/llmpro_aarch64.app.tar.gz.sig
llmpro/X.Y.Z/llmpro_X.Y.Z_x64-setup.exe
llmpro/X.Y.Z/llmpro_X.Y.Z_x64-setup.exe.sig
llmpro/X.Y.Z/llmpro_X.Y.Z_x64_en-US.msi
llmpro/X.Y.Z/llmpro_X.Y.Z_x64_en-US.msi.sig
llmpro/latest.json
```

客户端 updater 端点顺序：

1. OBS stable：`<OBS_PUBLIC_BASE_URL>/llmpro/latest.json`
2. GitHub bridge：`https://raw.githubusercontent.com/quhongli123/llmpro-release/main/updater/latest.json`

OBS 主清单先更新。GitHub raw 可能因 CDN 缓存短暂显示旧版本；通常等待几分钟后刷新，最终必须显示新版本。

## 11. 发布后线上验收

### 11.1 GitHub Release

```bash
gh release view vX.Y.Z   --repo quhongli123/llmpro-release   --json tagName,name,isDraft,isPrerelease,publishedAt,url,assets
```

必须确认：

- `isDraft=false`
- `isPrerelease=false`
- 资产数量和文件名完整
- Release 页面可以打开

### 11.2 OBS 和 GitHub manifests

```bash
OBS_BASE='https://playground-modelbest.obs.cn-north-4.myhuaweicloud.com'

curl -fsSL "$OBS_BASE/llmpro/latest.json" | jq -r '.version'
curl -fsSL   'https://raw.githubusercontent.com/quhongli123/llmpro-release/main/updater/latest.json'   | jq -r '.version'
```

两者都必须等于本次版本。

检查每个平台 URL 和 signature：

```bash
curl -fsSL "$OBS_BASE/llmpro/latest.json"   | jq '.platforms | with_entries(.value={url:.value.url,signature_present:(.value.signature|length>0)})'
```

### 11.3 真实 GET 下载

不要只用 `HEAD`。OBS 某些配置可能对 HEAD 返回不同状态。至少测试：

- macOS DMG；
- macOS updater tar.gz；
- Windows EXE；
- Windows MSI；
- `latest.json`。

示例：

```bash
curl -fL --max-time 180 -o /tmp/llmpro.dmg   "$OBS_BASE/llmpro/X.Y.Z/llmpro_X.Y.Z_aarch64.dmg"
test -s /tmp/llmpro.dmg
```

### 11.4 macOS 包验收

```bash
hdiutil verify /tmp/llmpro.dmg
codesign -dv --verbose=2 /tmp/llmpro.dmg
spctl --assess --type open --context context:primary-signature --verbose=2 /tmp/llmpro.dmg
```

期望：

- DMG checksum valid；
- Authority 为 Developer ID Application；
- `Notarization Ticket=stapled`；
- `spctl` 输出 `accepted`，source 为 `Notarized Developer ID`。

### 11.5 Workflow 结果

```bash
gh run view <prepare-run-id>   --repo quhongli123/llmpro-release   --json conclusion,jobs,url
gh run view <release-run-id>   --repo quhongli123/llmpro-release   --json conclusion,jobs,url
```

两个 run 都必须是 `success`，所有必需 job 都必须成功。

## 12. 常见故障处理

| 现象                                              | 原因 / 处理                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 私有 Tag workflow 立即失败，runner 为空           | GitHub Billing / spending limit；使用公开发布仓脚本，不要重推 Tag                     |
| preflight 报缺少 setting                          | 检查公开仓 secret/variable 名称；不要打印值                                           |
| preflight 报 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 这是可选字段；只有当前 workflow 又重新把它列为 required 时才需要修 workflow           |
| OBS 已是最新版本                                  | 目标版本必须更高；递增 patch                                                          |
| Candidate build missing                           | 先让 `prepare-release.yml` 成功；不要直接跑 `release.yml`                             |
| macOS notarization 失败                           | 检查 Apple ID/team/app-specific password/certificate；修复后新 patch 或安全重跑 draft |
| OBS upload 失败                                   | 检查 OBS AK/SK、bucket、endpoint；确认没有把密钥写进日志                              |
| GitHub raw bridge 仍旧版本                        | raw CDN 可能缓存约 5 分钟；用 GitHub API 确认提交内容，再等待刷新                     |
| prepare 同时有多个 run                            | 同一 Tag 的 prepare 使用 `cancel-in-progress: true`，以最新 run 为准                  |
| Release 已公开后发现包有问题                      | 不覆盖已发布版本；修复代码后发布下一个 patch                                          |

## 13. 回滚和重试边界

- 未创建 Tag：直接修复本地文件并重新验证。
- Tag 已推送但 prepare 未开始：修正公开仓 workflow 或用脚本触发。
- prepare 失败：修复原因后重跑 prepare；同一 Tag 可生成新的 candidate run。
- release draft 失败：可在确认 candidate 和配置后重跑 release；workflow 会复用 draft。
- OBS 上传部分失败：先确认是否已有版本目录；若 stable manifest 未切换，可修复后重跑同一版本。
- Release 已公开或 stable manifest 已指向新版本：不要覆盖。发布新的 patch 版本。
- 不执行 force push、删除 Tag、删除 Release 或覆盖 OBS 已发布文件，除非用户明确要求并理解影响。

## 14. AI 完成报告模板

```text
源码：
- 仓库/分支：
- commit：
- tag：
- 是否已推送：

本地验证：
- 命令与结果：
- 未执行或失败项：

CI：
- prepare run：
- release run：
- 关键 job 结论：

发布：
- GitHub Release：
- OBS latest.json：
- GitHub bridge：
- 资产完整性：

线上验收：
- HTTP/GET：
- macOS 签名/公证：
- updater 签名：

未完成项与风险：
- ...
```

## 15. 当前已验证基线

`v0.2.164` 实际验收结果，可作为未来发布的参照：

- `prepare-release` 约 16 分 19 秒完成；
- `release` 约 2 分 40 秒完成；
- GitHub Release 已公开；
- OBS 和 GitHub bridge 均返回 `0.2.164`；
- DMG `hdiutil verify` 通过；
- Developer ID 签名有效；
- Notarization ticket 已 stapled；
- Gatekeeper `spctl` 返回 `accepted`；
- Windows EXE/MSI 和 updater 资产均返回 HTTP 200；
- updater signature 使用已安装客户端公钥验证通过。
