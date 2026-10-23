# BOSS 岗位筛选与首次招呼

一个本地运行的 Chrome / Edge Manifest V3 扩展，用于按城市和关键词预览 BOSS 直聘岗位，并在用户主动启动后发送一条预设的首次招呼。

当前版本：`0.1.11`

## 功能

- 轮换上海、深圳、珠海和杭州，按 AI 产品经理、FDE、AI 解决方案、AIGC 等关键词读取已加载的岗位列表。
- 在详情页重新核对岗位方向、城市、公司和招聘者公开信息。
- 先提供只读预览；发送必须由用户在扩展面板中明确启动。
- 对同一岗位保存 `reserved`、`unknown`、`existing` 或 `sent` 记录，避免结果不明时自动重发。
- 只有在当前会话身份稳定、编辑器已清空，且页面连续显示公开的“送达”或“已读”状态时，才记录为 `sent`。
- 新聊天页可能先显示“面议”或上一会话的职位栏；扩展要求公开身份快照连续稳定，并在有限水合窗口后仍执行严格薪资与收件人核对。“面议”不会被当作数字薪资，也不会猜测网页字体字形。
- 遇到登录、验证码、平台限制、身份不一致、页面超时或结果不明时停止。

扩展不会自动回复、上传简历附件、交换联系方式、绕过验证码或在浏览器重启后自动续跑。

## 安装

1. 下载或克隆此仓库。
2. 打开 `chrome://extensions`（Edge 使用 `edge://extensions`）。
3. 打开“开发者模式”，点击“加载已解压的扩展程序”。
4. 选择仓库中的 `extension/` 目录。
5. 在浏览器中登录 [BOSS 直聘](https://www.zhipin.com)。登录、验证码和账号验证应由用户本人完成。
6. 打开扩展，先运行“预览筛选（不发消息）”。确认结果后，再按需启动发送。首次使用建议把本批上限设为 `1`。

扩展附带一段通用示例招呼。请先在面板中改成适合自己的内容；配置保存在浏览器的 `chrome.storage.local` 中。

## 安全行为

扩展只申请以下权限：

- `storage`：保存本地配置、运行状态和去重记录。
- `tabs`：创建或更新本次运行使用的标签页。
- `https://www.zhipin.com/*`：读取可见页面并执行用户启动的操作。

扩展不申请 `cookies`、`debugger` 或 `webRequest` 权限，也没有外部数据上传端点。页面诊断会移除 URL 查询参数，不导出 Cookie、LocalStorage、密码、聊天正文、草稿或联系人列表。

发送操作具有外部影响。点击停止不能撤回已经提交的消息。BOSS 页面结构或风控策略变化后，扩展可能停止工作；没有账号安全或平台许可保证。请遵守网站规则，并在低数量设置下人工检查结果。

## 去重与状态

- `reserved`：已在外部动作前占用，避免并发或重启后重复处理。
- `unknown`：无法确认结果，后续批次不会自动重试，应人工核对。
- `existing`：当前会话已有我方实际消息，扩展没有追加。
- `sent`：页面上的完整消息、清空的编辑器和明确公开回执均通过检查。

本地记录没有一键清空入口，避免误删后重复发送。卸载扩展可能同时删除这些记录；卸载前可先导出。

## 开发与验证

```bash
npm ci
npm test
node --check extension/core.js
node --check extension/content.js
node --check extension/background.js
node --check extension/popup.js
node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json', 'utf8'))"
```

测试使用 `jsdom` 和虚构页面数据，不会访问真实账号或发送消息。详细范围见 [TEST_REPORT.md](TEST_REPORT.md)。版本 `0.1.10` 和 `0.1.11` 均完成过受控的单消息真实端到端验收；`0.1.11` 还在真实页面只读复现并修复了薪资占位符的延迟水合问题。公开仓库不包含收件人、公司、岗位链接、时间、运行 ID、消息正文或诊断导出。

## 项目结构

- `extension/`：浏览器扩展源码。
- `TESTS.cjs`：本地 DOM 和后台流程回归测试。
- `TEST_REPORT.md`：公开的验证范围与限制。
- `NOTICE.md`、`UPSTREAM_LICENSE.txt`：参考来源和对应授权说明。

## 来源说明

本项目为重新实现的最小扩展，不是上游项目的官方发行版。部分页面选择器参考了 `czc6666/czc-good-job`；具体版本和 MIT 授权信息见 [NOTICE.md](NOTICE.md) 与 [UPSTREAM_LICENSE.txt](UPSTREAM_LICENSE.txt)。

