# HSAD 3D 模型与 UI 接入验收报告

## 1. 交付结论

本轮已将统一的可运动 HSAD 教学手接入“认识装置”和“关节信号与动作映射实验台”。网页不再依赖 SVG 手、截图手或高面数 FBX；两个页面共同加载同一份 Draco 压缩 GLB，并共同使用 `src/data/jointHotspots.ts` 的 14 关节语义映射。

最终产物：

- Blender 源文件：`assets/blender/hsad_teaching_hand.blend`
- 网页模型：`public/models/hsad/hsad_teaching_hand.glb`
- 可复现重建脚本：`tools/blender/rebuild_hsad_teaching_hand.py`
- 独立验收脚本：`tools/blender/reports/validate_hsad_teaching_hand.py`
- 结构报告：`tools/blender/reports/hsad_teaching_hand_report.json`
- 验收报告：`tools/blender/reports/hsad_teaching_hand_validation.json`

模型快照为 198,432 bytes、24,984 三角面、12,706 个建模顶点、1 个 Skin、16 根骨骼。其中 14 根骨骼对应 14 个检测关节，另有 `WristRoot` 与拇指辅助骨 `Thumb_CMC`。GLB 使用 `KHR_draco_mesh_compression`，解码文件位于 `public/draco/`。

## 2. 资产处理与真实性边界

### 实际采用的源资产

- `三种手势手掌1.blend`：复用 16 骨拓扑、关节层级与简化手形比例依据。
- `Hitem3d-1784084384679(1).fbx`：仅作为 FPC、检测片与器件分区参考；约 199 万三角、无骨骼，不直接进入网页。
- `Hitem3d-1784083563533.fbx`：仅校核黑色手套、装置佩戴关系与张开手轮廓，不直接进入网页。
- 论文、答辩 PPT 和 ProDoc EDA：决定 14 单元、双层 PVDF、指部蛇形段、手背电路、ESP32、JY60、模拟复用、电源管理与内置电池的教学表达。

没有找到第二个独立 `.blend`；同目录 `.blend1` 只是 Blender 自动备份，未当作第二个源模型。网页模型是依据上述资料重建的教学低模，不冒充实物扫描或精确 PCB 工程模型。

## 3. 模型结构与运动

### 骨骼

- 拇指：`Thumb_MCP`、`Thumb_IP`，另有辅助对掌骨 `Thumb_CMC`。
- 食指：`Index_MCP`、`Index_PIP`、`Index_DIP`。
- 中指：`Middle_MCP`、`Middle_PIP`、`Middle_DIP`。
- 无名指：`Ring_MCP`、`Ring_PIP`、`Ring_DIP`。
- 小指：`Little_MCP`、`Little_PIP`、`Little_DIP`。
- 根节点：`WristRoot`。

每个检测关节拥有 `Sensor_<JointId>`、`Highlight_<JointId>` 和 `Serpentine_<JointId>`。检测片父级直接绑定对应骨骼；手指主体、指部 FPC 与蛇形段使用跨相邻骨的平滑权重；手背 `DeviceRoot` 刚性绑定 `WristRoot`，不会随手指产生不合理弯曲。

`Hand_ThumbBase` 与 `FingerFPC_ThumbBase` 跨 `WristRoot → Thumb_CMC` 蒙皮，减少拇指根部断裂感。网页运行时对 `Thumb_CMC` 施加受限对掌辅助角，但它不被计入 14 个检测关节。

### 器件语义节点

模型保留 `MainFPC`、`CircuitModule`、`SignalConditioning`、`AnalogMultiplexerArray`、`ESP32Module`、`IMUModule`、`BatteryModule`、`PowerManagement`、`TypeCPort` 以及五指 FPC 支路。器件使用简化几何体表达功能分区，不虚构具体芯片丝印和精确走线。

## 4. 认识装置页面接入

组件链路：

`DeviceHotspotExplorer` → `HSADHand3D` → GLB 节点 raycast → `HSADSelectionEvent` → 关节/器件浮框。

已实现：

- OrbitControls 拖拽环绕、滚轮缩放、有限平移与视角复位；
- 通过按下/抬起位移阈值区分“点击”与“拖拽”，避免旋转模型时误选节点；
- 点击 14 个检测单元、FPC、蛇形段、采集总成、信号调理、ESP32、IMU、电池和电源管理区域；
- 点击对象后局部橙色高亮，其余可选对象降低对比；
- 相机以选中对象为目标平滑聚焦；
- 浮框显示名称、作用、原始通道、差分输出及“在实验台中查看”；
- 快速选择、上一个/下一个和自动讲解与三维点击共用同一语义 ID。

Canvas 提供可读名称与文本等价说明；所有 14 关节也可以通过 HTML 按钮访问，用户不必依赖精确鼠标点击完成任务。

## 5. 实验台模型与波形同步

实验台的唯一教学闭环为：

`目标角度 → 角速度 → V+ / V− → Udiff → 6 Hz 二阶低通 → SIA 梯形积分 → 三维骨骼角度`

模型使用 `metrics.siaAngle`，而不是直接使用目标滑块值。目标角只是教学输入真值；因此改变角度后，必须先产生信号并经过内部处理，三维手才随 SIA 输出运动。

### 运行时关系

- 采样率：80 Hz。
- 原始通道：`V+ = 1.65 + motion + common + n1`，`V− = 1.65 − motion + common + n2`，并限制在 0–3.3 V。
- 差分：`Udiff = (V+ − V−) / 2`。
- 噪声：固定种子高斯噪声、低频漂移、相关共模与极少量微脉冲；切换关节会重置独立引擎，避免跨关节历史污染。
- 瞬态：角速度决定主要幅值；短时起始过冲、相关运动纹理和电荷松弛尾迹避免生成理想矩形或规则正弦。
- SIA：0.006 V 可配置阈值、梯形积分、0–90°限幅和论文保持修正 `1.056 − 0.11·exp(−t/2.3374)`。
- 14 个教学标定值均配置在 `src/simulation/signalTypes.ts`，不是论文实测常数。

### 自动交互验收

使用 `tools/browser/cdp_lab_action.mjs` 在真实 Edge/WebGL 页面完成自动操作：

1. 选择食指 PIP（I2）；
2. 从 4°设置为 60°；
3. 切换“差分有效信号”；
4. 等待弯曲、保持并读取页面结果；
5. 再从 60°伸展回 0°。

弯曲验收读数：目标 60°、SIA 60.2°、差分峰值约 0.316 V、采样率 80 Hz；保持时差分返回近零。伸展验收读数：差分谷值约 −0.315 V，SIA 回到约 1.2°并继续受 0–90°限幅。截图位于：

- `tools/blender/reports/browser_lab_action_60deg.png`
- `tools/blender/reports/browser_lab_action_bend_extend.png`

这些数值属于固定种子的“教学推演”，不是实验实测结果。

## 6. 浏览器与响应式验收

已在本机 Edge 通过 Chrome DevTools Protocol 实际加载页面、等待 GLB 解码并读取控制台：

| 页面/视口 | 结果 | 截图 |
|---|---|---|
| 认识装置 1920×1080 | GLB 加载、浮框和 14 快选正常 | `browser_device_cdp_1920x1080.png` |
| 实验台 1920×1080 | 三栏舞台、模型和两种波形正常 | `browser_lab_cdp_1920x1080.png` |
| 实验台 1440×900 | 核心三栏操作区可见 | `browser_lab_cdp_1440x900.png` |
| 认识装置 1024×768 | 模型、浮框正常，无横向溢出 | `browser_device_cdp_1024x768.png` |
| 实验台 1024×768 | 两列主舞台 + 下方控制区，无横向溢出 | `browser_lab_cdp_1024x768.png` |

控制台无业务错误。唯一警告来自 React Three Fiber 内部仍使用 Three.js 已弃用的 `Clock`，不影响模型或交互，待上游升级处理。

## 7. 构建与性能

`npm.cmd run build` 已通过 TypeScript 与 Vite 生产构建。主要产物：

- `HSADHand3D` 业务分块约 82.56 kB，gzip 约 25.90 kB；
- R3F/Three 共享分块约 881.77 kB，gzip 约 234.37 kB；
- GLB 约 194 kB，按路由懒加载；
- 模型无外部纹理请求，Draco 解码器随项目本地提供。

R3F 共享分块触发 Vite 的 500 kB 体积提示，但首页不会主动加载 3D 路由分块，当前不构成阻断问题。后续若面向低端平板，可继续合并不交互的 SMD 网格并对 Three 依赖做更细的分块。

## 8. 尚需真实资料

- 14 个关节各自的真实 0°→90°校准积分面积，以替换教学标定值；
- 静止、弯曲、保持、伸展阶段的真实 28 路 CSV，以校核噪声、峰值与松弛时间；
- 真实串口桥接/WebSocket 协议；
- 若确有第二个独立 Blend，请补充后重新评估融合价值。

在这些数据提供前，UI 会持续以小标签标明“教学推演”，不会将模拟曲线包装成实验实测。

## 9. 2026-07-16 连续 FPC 修正版接入

本轮先完成 Blender 模型结构验收，再替换网页资源：

- 拇指 T1、T2 压片已沿拇指骨段长轴铺设；
- 五指 `FingerFPC_*` 已从掌部连续延伸至指端；
- 14 条 `Serpentine_*` 均实际进入相邻压片与 FPC 网格，不再以对象靠近冒充连接；
- `MainFPC`、主板与关键器件保持刚性，指部 FPC 随 14 个关节运动；
- Blend 与最终 GLB 回读的 0°、45°、90°验证均为 `all_passed = true`；
- `#/device` 与 `#/lab` 继续共用 `HSADHand3D` 和同一 `hsad_teaching_hand.glb`；
- 模型资源 URL 使用 `rev=2.1-continuous-fpc` 避免旧 GLB 缓存。

完整结果见 `docs/3d_model_correction_report.md`。
