# HSAD teaching hand 独立验收

验收对象是 2026-07-15 23:18 导出的最终模型快照。验收只读取模型并施加临时姿态，没有保存或修改源 Blend。

## 文件快照

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `assets/blender/hsad_teaching_hand.blend` | 326,608 bytes | `FB4F4F4DE5D789471ABC7644A1940934F39C57C6AEF4C1A369DAFAD2C7F69D53` |
| `public/models/hsad/hsad_teaching_hand.glb` | 198,432 bytes | `72BCC5D5B6F0BF0A15FA129989BE2689DDB35D0A49319685B0B85E0596AECE51` |

## 结构与导出结果

- Blender：5.1.2。
- Blend：111 个对象，其中 87 个 Mesh、1 个 Armature。
- Blend 几何：12,706 个建模顶点，24,984 个三角面。
- GLB：123 个节点、87 个 Mesh、1 个 Skin、16 个 Joint、0 个内置动作。
- GLB 使用 `KHR_draco_mesh_compression`；所有蒙皮对象保留 `JOINTS_0` 和 `WEIGHTS_0`。
- 模型没有依赖外部纹理；关键器件、检测片和柔性段使用独立语义节点与简化材质。

16 个骨骼完整：`WristRoot`，四指各 MCP/PIP/DIP，`Thumb_CMC`、`Thumb_MCP`、`Thumb_IP`。

14 个检测节点、14 个高亮锚点、14 个蛇形走线节点均存在。每个 Sensor 的父骨、`hsadId`、通道号、两路原始通道和差分输出均与项目映射一致。`DeviceRoot` 刚性绑定 `WristRoot`，符合手背主板不随手指变形的要求。

## 权重验收

- 6 个 `FingerFPC_*`（含 `FingerFPC_ThumbBase`）：无未加权顶点，所有顶点权重和为 1.0；指部约 20%–23%、拇指根部约 16% 顶点跨相邻骨平滑过渡。
- 14 个 `Serpentine_*`：无未加权顶点，所有顶点权重和为 1.0；每段 40% 顶点跨父骨和当前骨过渡。
- 6 个手指/拇指根部主体：无未加权顶点，所有顶点权重和为 1.0；约 11%–20% 顶点跨骨过渡。
- GLB 中上述网格均关联同一个 `HandRoot` Skin。

## 姿态验收

- [0° 中性姿态](teaching_hand_validation/hsad_teaching_hand_pose_00.png)
- [45° 统一屈曲](teaching_hand_validation/hsad_teaching_hand_pose_45.png)
- [90° 统一屈曲](teaching_hand_validation/hsad_teaching_hand_pose_90.png)

三组姿态中，Sensor 到手指/FPC 的最近距离保持稳定，没有检测到整个压片脱离手指的现象。拇指的 `-X` 屈曲方向能够向掌侧运动，轴向本身正确。

## 问题分级

### P0

未发现缺骨、缺检测节点、Skin 丢失、权重为空、GLB 无法驱动等结构性 P0。

### P1

最终复验未发现未关闭的 P1。上一轮的四项 P1 已处理：

1. 掌背刚性走线缩短至 MCP 根部，避免高屈曲时形成长悬臂；
2. 握拳预设改为分关节生理角度，不再给 14 关节统一 88°；
3. 新增 `Hand_ThumbBase` 与 `FingerFPC_ThumbBase`，跨 `WristRoot → Thumb_CMC` 蒙皮，并在网页端加入受限对掌辅助角；
4. 蛇形段采样密度提高，实际教学预设不再使用全关节统一 90°极限姿态。

### P2

- 24,984 三角面很轻，但 87 个 Mesh 仍带来较多绘制调用。18 个 SMD 和 7 个放大器等不单独交互的同材质物体，后续可按语义父组静态合并；ESP32、IMU、电池、信号调理等可点击节点应继续独立保留。
- GLB 没有内置动作是合理设计，当前网页通过骨骼四元数实时驱动模型。

## 复验方法

使用 `validate_hsad_teaching_hand.py` 可重建全部结构检查、权重统计和三姿态截图。生成物一旦重新导出，应先核对文件哈希，再重新运行验收。
