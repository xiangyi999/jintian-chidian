# 本地开发、同步 GitHub 与回退流程

本项目采用“功能分支”工作流：所有修改先在本地功能分支完成，确认可以运行、测试通过后再同步到 GitHub。只有合并到 `main` 后，GitHub Pages 的手机端页面才会更新。

## 日常本地运行

在项目目录 `D:\Study\Codex\Project\App` 运行：

```bash
npm.cmd start
```

打开：

```text
http://localhost:4173
```

统一检查命令：

```bash
npm.cmd run check
```

这个命令会运行自动测试，并检查主要 JavaScript 文件语法。

## 开始一个新修改

先回到稳定分支并拉取 GitHub 最新代码：

```bash
git switch main
git pull --ff-only origin main
```

创建功能分支：

```bash
git switch -c feature/功能名
```

分支命名建议：

- `feature/menu-ui-polish`
- `feature/ai-recipe-settings`
- `feature/backup-improvements`

## 本地完成后同步到 GitHub

先检查：

```bash
npm.cmd run check
git status --short --branch
```

确认没有意外文件后提交：

```bash
git add .
git commit -m "说明这次修改"
```

推送功能分支：

```bash
git push -u origin feature/功能名
```

## 合并并发布到手机端

确认功能分支没问题后，合并到 `main`：

```bash
git switch main
git pull --ff-only origin main
git merge --no-ff feature/功能名
npm.cmd run check
git push origin main
```

发布地址：

```text
https://xiangyi999.github.io/jintian-chidian/
```

GitHub Pages 通常会在几十秒到几分钟内更新。

## 回退方式

### 修改还没有提交

只丢弃某个文件的修改：

```bash
git restore path/to/file
```

查看所有未提交修改：

```bash
git status --short
```

### 已提交但还没有合并到 main

直接切回稳定分支：

```bash
git switch main
```

如果确认不要这个功能分支：

```bash
git branch -d feature/功能名
```

如果分支已经推到 GitHub，也删除远程分支：

```bash
git push origin --delete feature/功能名
```

### 已合并并发布

使用安全回退，保留历史：

```bash
git switch main
git pull --ff-only origin main
git revert <commit>
npm.cmd run check
git push origin main
```

不要默认使用 `git reset --hard` 或强推；这类操作会重写历史，只有明确需要时再做。

## 每次同步前的固定检查

- 本地页面能打开：`http://localhost:4173`
- `npm.cmd run check` 通过
- `git status --short --branch` 没有意外改动
- 当前分支不是误改的 `main`
