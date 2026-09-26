<div align="center">

<img src="docs/screenshots/desktop-pet-cut.png" alt="小小的她" width="180" />

# 小小的她 · xiaoxiaodeta

**A quiet, offline desktop companion for Windows — 她就住在你的桌面上。**

`Windows` `Electron` `React` `离线运行` `自定义形象`

</div>

---

「小小的她」是一个安静、离线、可拖动的 Windows 桌面宠物：透明置顶、不弹广告、不上传任何数据。她有待机、奔跑、挥手、比心、猜拳等 20 组动作，有喂养、签到、成长等级、衣橱换装、记忆翻牌等本地玩法，还有会根据你说话内容做简短回应的本地文字聊天（关键词规则，不是联网 AI）。

默认形象是一位 AI 绘制的 Q 版女孩；你也可以用自己的动作图集替换她——让桌宠变成你想要的样子。

## ✨ 功能

- **桌面陪伴**：透明置顶小窗，可拖动、可点击穿透，不占任务栏
- **互动回应**：点头摸摸、投喂点心、比心、抱抱、猜拳（真的会在桌面亮出石头剪刀布）
- **本地成长**：签到 / 任务 / 经验等级 / 徽章 / 星星商城衣橱（8 套配色主题），全部保存在本机
- **小游戏**：记忆翻牌、星星狩猎、抓星星，完成有奖励
- **文字聊天**：本地关键词回应，不联网、无语音、无远程 AI
- **更换形象**：在应用内导入自定义动作图集，一键替换桌宠形象（详见下文）

## 🖼️ 更换形象（自定义你的桌宠）

打开托盘菜单或陪伴面板 →「徽章装扮」→「我的形象」：

1. **选择图集 PNG…** 从文件选择器导入，或直接把 PNG 拖进「我的形象」卡片
2. 导入会校验图集格式（8 列 × 11 行、1536×2288 像素），通过后桌宠立即换上新形象
3. 「恢复默认形象」随时可以换回默认

🔒 导入全程在本地完成：图片只保存在你电脑的应用数据目录里，**不会被上传，也不会进入源码仓库**。

想自己绘制或用工具生成动作图集？逐格动作规范见 [docs/ATLAS-FORMAT.md](docs/ATLAS-FORMAT.md)；仓库内 `scripts/` 也附带了图集质检与安装脚本（`qa-action-atlas.py`、`normalize-atlas.py`、`install-custom-atlas.ps1`）。

## 📦 快速开始

开发运行（需要 Node.js 18+）：

```bash
npm ci
npm run dev:desktop
```

打包便携版（`artifacts/desktop-<版本>/win-unpacked/`，附自动打包的 zip）：

```bash
npm run build:desktop
```

打包 NSIS 安装包：

```bash
npm run build:installer
```

## 🧪 测试

```bash
npm test                # 纯逻辑单元测试（存档、动作、小游戏、拖拽、图集安装…）
npm run test:atlas      # 校验默认动作图集完整性（需要 Python 3 + pip install -r requirements-assets.txt）
npm run test:wardrobe   # 校验衣橱素材
```

## 🔒 隐私承诺

- 所有互动、成长、聊天回应都在本地完成，**没有任何遥测和联网上报**
- 你的照片与自定义形象永不进入源码仓库或发布包
- 拖入的图片只在导入校验时被本机程序读取
- 存档是本机的 JSON 文件，卸载也不会删除（NSIS 配置 `deleteAppDataOnUninstall: false`）

## 🗺️ Roadmap

- [x] 应用内导入自定义动作图集（拖拽 / 文件选择）
- [ ] **照片 → 动作图集**：上传一张照片，借助图像生成 API 自动产出符合规范的 8×11 动作图集（设计中，欢迎讨论方案）
- [ ] 多形象管理（保存多套自定义图集随时切换）
- [ ] 跨平台（macOS / Linux）

## 📄 许可

代码以 [MIT](LICENSE) 协议开源。默认角色素材为 AI 生成，其来源与使用说明见 [ASSETS.md](ASSETS.md)。
