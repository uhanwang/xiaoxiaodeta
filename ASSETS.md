# 默认素材说明 / Default Assets

本仓库 `public/assets/` 内的默认角色素材（动作图集 `atlas/`、姿态图 `sprites/`、手势图 `actions/`、衣橱配色 `wardrobe/`、吉祥物图标 `brand/`）以及 `docs/screenshots/` 中的截图均为 **AI 图像生成服务绘制的原创 Q 版角色**，不是对任何现存 IP 角色的复刻。

## 内置模型

`electron/models/u2netp.onnx` 是 [U²-Net](https://github.com/xuebinqin/U-2-Net) 的小型版（u2netp），用于照片导入时的本地抠图，按 **Apache License 2.0** 随本仓库分发，版权归 U²-Net 原作者所有。

## 授权

- 这些素材随本项目一并以 **CC BY 4.0** 授权：你可以自由使用、修改、再分发，只需注明出处（链接回本仓库即可）。
- 项目**代码**的授权与此不同，见 [LICENSE](LICENSE)（MIT）。

## 素材红线

- 请勿将这些素材用于违法违规用途，或声称其为真人形象。
- **你的个人照片与生成的自定义形象属于你**：本项目的一切处理都在本地完成，请勿把他人的肖像在未经同意的情况下上传到任何在线服务（本项目自身不包含任何上传功能）。
- 替换默认素材时，请保留 `customAssets.cjs` 的回退逻辑，保证没有自定义图集时应用仍能运行。

## 自定义形象

导入的图集会保存在本机应用数据目录（`%APPDATA%/小小的她/custom-pet/`），永远不在仓库或发布包内。规范见 [docs/ATLAS-FORMAT.md](ATLAS-FORMAT.md)。
