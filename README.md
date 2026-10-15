# 手感实验室（Feel-Lab）

**线上：https://sg.wbztl.xyz**（仓库 `fjkkx77/Feel-Lab`，公开）

在手机上把常见交互的「手感」调到自己满意——按钮按下、卡片按下、开关与勾选……每个模块都有能真点的示范、调手感面板、Apple 原文参照和每个参数的来源。
调好的存进「我的手感库」，填同一个同步码就在手机和电脑之间同步；满意的那组「设为定稿」，以后做新项目第一版直接用。

## 结构（纯静态 + 一个同步函数，零构建）
| 文件 | 干什么 |
|---|---|
| `index.html` | 外壳：标题、云同步弹窗、确认框、提示条 |
| `assets/app.js` | 手感库（本机存储 + 同步）、路由（`#/` 首页、`#/m/<模块>`、`#/lib` 手感库） |
| `assets/modules.js` | 模块定义：参数、示范、参照、每个参数的来源（官方原文 / 第三方 / 推导 / 我定的起点 / 你真机调定） |
| `assets/lab.css` | 站点样式 |
| `assets/tune-panel.js` | 调手感面板——**存档 `references/组件_调手感面板` 的逐字节副本**，别在这里改 |
| `assets/sync-*.js / .css` | 多设备同步——**存档 `references/组件_多设备同步` 的逐字节副本** |
| `assets/sheet-dismiss.js` | 下拉关闭弹窗，摘自存档 `组件_iOS手势` |
| `assets/qrcode.js` | 二维码（面板「二维码」按钮按需加载） |
| `api/sync.js` | 同步接口（改编自日程卡片，Upstash EVAL 原子写；**键前缀 `feel:` + 盐 `flv1|`**，和日程卡片 / 接着来共用一个 Upstash 也互不串数据） |

## 测试
```bash
node tests/server.js . 18901 api/sync.js      # 静态页 + 真的 api/sync.js + 内存版 Upstash
node tests/smoke.js                            # 24 条：首页、三个模块真触摸、存库、定稿、两台设备同步、320/430 宽、深色
LAB_URL=https://sg.wbztl.xyz/ node tests/smoke.js   # 对线上跑（同步那段会真的写一条测试数据）
```
