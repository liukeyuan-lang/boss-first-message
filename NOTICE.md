# 来源与改动

此部署包为重新编写的最小 Chrome 扩展，并非上游项目官方发行版。

页面选择器参考：https://github.com/czc6666/czc-good-job
参考版本：e07bf4cb663d9531864ca22eb6195b77e064c3b5
上游授权：MIT（副本见 UPSTREAM_LICENSE.txt）

此版本没有包含上游后端、内部接口调用、协议拦截、自动发附件或自动聊天流程。
所有配置和记录使用 chrome.storage.local，仅普通网页操作作用于 BOSS 网站。
权限：storage（本地配置与记录）、tabs（创建/更新任务标签页）、https://www.zhipin.com/*（在 BOSS 页面读取可见 DOM 并执行用户启动的操作）。
没有 cookies、debugger、webRequest、全站 host 权限或外部数据上传端点。
