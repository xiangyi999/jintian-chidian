# 今日吃点

一个本地优先的每日菜单 PWA。适合手机浏览器打开，也可以添加到桌面使用。

## 功能

- 记录菜名、做法、标签、收藏和本地图片
- 按标签或收藏随机一道菜
- 设置 OpenAI API Key 后生成 AI 做法建议
- 导出和导入 JSON 备份，导出文件不包含 API Key
- PWA 离线缓存基础页面和本地菜谱

## 本地运行

```bash
npm.cmd start
```

打开：

```text
http://localhost:4173
```

## 测试

```bash
npm.cmd run check
```

## 本地开发和同步 GitHub

本项目采用功能分支流程：先在本地分支完成修改和测试，再推送到 GitHub，确认稳定后合并到 `main` 发布到手机端。

详细流程见：[docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md)。

## 云同步和 DeepSeek

跨手机数据互通使用 Supabase，AI 做法推荐使用 DeepSeek。密钥只保存在手机浏览器本地，不写入 GitHub。

配置说明见：[docs/CLOUD_SYNC_AND_DEEPSEEK.md](docs/CLOUD_SYNC_AND_DEEPSEEK.md)。

## 隐私说明

菜谱和 API Key 默认只保存在当前浏览器本机。只有点击 AI 推荐时，菜名和标签会发送给 OpenAI API。

## 发布到手机长期使用

推荐发布到 GitHub Pages：

1. 创建一个 GitHub 仓库，例如 `jintian-chidian`。
2. 把本目录所有文件推送到仓库的 `main` 分支。
3. 打开仓库的 `Settings` -> `Pages`。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/ root`。
6. 等待 Pages 构建完成。
7. 用手机打开 Pages 地址，再添加到主屏幕。

iPhone：Safari 打开网址 -> 分享 -> 添加到主屏幕。

Android：Chrome 打开网址 -> 菜单 -> 添加到主屏幕或安装应用。
