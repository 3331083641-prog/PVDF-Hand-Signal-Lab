# Blender 工具审查

## 实际采用

| 工具 | 官方地址 | 作用 | 采用理由与状态 |
|---|---|---|---|
| Blender 5.1.2 Windows Portable | https://www.blender.org/download/ | 读取 Blend/FBX、精修、Rig、导出 GLB | 已采用。便携版位于 `D:\Codex\blender-5.1.2\blender-5.1.2-windows-x64\blender.exe`，不会改写系统安装配置。 |
| glTF-Blender-IO | https://github.com/KhronosGroup/glTF-Blender-IO | Blender 官方 glTF 2.0 导入导出 | 已采用 Blender 内置版本，不重复安装。用于保留骨骼、蒙皮、节点名与 Draco 压缩。 |
| 项目内 Blender Python | `tools/blender/` | 可复现地重建、绑定、导出与审计 | 已采用。脚本随项目保存，优先于不可追踪的手工操作。 |

## 审查后不额外安装

| 工具 | 官方地址 | 作用 | 未采用原因 |
|---|---|---|---|
| Rigify | https://docs.blender.org/manual/en/latest/addons/rigging/rigify/ | 通用人形/手部 Rig 生成 | 本项目需要与 14 个检测单元严格同名、同序的确定性关节骨架；现有 16 骨拓扑更直接，Rigify 会增加无关控制骨与导出复杂度。 |
| glTF-Transform | https://github.com/donmccurdy/glTF-Transform | glTF 检查与后处理压缩 | 本轮优先由 Blender 内置导出完成 Draco 和结构保留。若后续纹理体积成为瓶颈再引入，避免多一套不必要的 Node 工具链。 |
| Blender MCP 类社区仓库 | 未采用 | 通过 MCP 远程操控 Blender | 建模流程需要可复现的、可审计的离线 Python 脚本；社区 MCP 不提升骨骼与节点正确性，因此不让关键交付依赖不确定服务。 |

## 环境检查结论

- Blender 初始未在 `PATH` 中；已使用官方便携版，不需系统级安装权限。
- Blender 自带 Python 足以运行 `bpy`、FBX 导入和 glTF 导出。
- 不安装额外 Rig、材质包或不明来源插件；本轮新增依赖保持为零。

