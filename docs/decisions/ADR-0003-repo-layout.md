# ADR-0003 · 仓库布局:前端保留根目录,新增 backend/ 与 deploy/

- 状态:已接受(2026-08-06)

## 背景

前端已有大量提交与未提交的中途重构成果(src/api、components/ui 等)。
需要决定 monorepo 结构。

## 备选

1. 前端迁移到 `frontend/` 子目录:结构对称,但破坏 git 历史连续性、现有脚本路径、
   未提交改动风险高。
2. **前端保留根目录,新增 `backend/`、`deploy/`、`docs/`**:零迁移成本。

## 决定

方案 2。根目录 = 前端项目(package.json/bunfig/src/tests);
`backend/` = uv Python 项目;`deploy/` = docker/compose/freeradius/nginx;`docs/` = 本体系。

## 后果

- 正面:不动现有工作;CI 路径清晰(frontend=. / backend=backend)。
- 代价:根目录混合了前端文件与顶层目录,需在 README 说明(已做)。
