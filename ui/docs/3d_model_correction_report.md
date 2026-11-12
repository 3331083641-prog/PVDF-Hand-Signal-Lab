# HSAD 三维手模型修正与 UI 接入报告

日期：2026-07-16

## 1. 两阶段执行结论

本轮严格按“先模型、后 UI”执行。第一阶段的 Blender 源模型、导出 GLB 和三组姿态验证全部通过后，才进入第二阶段替换网页资源。

| 阶段 | 验收门槛 | 结果 |
|---|---|---|
| 第一阶段：模型修正 | 拇指压片方向、五指 FPC 连续性、掌指一体化、14 节点映射、三组姿态、GLB 回读 | 通过 |
| 第二阶段：UI 接入 | 认识装置、实验台共用模型；点击、高亮、角度和波形同 ID 联动 | 通过 |

## 2. 模型修正内容

### 2.1 大拇指压片方向

- T1、T2 压片改为沿大拇指骨段长轴纵向铺设。
- 生成器在骨骼矩阵更新后再保持世界变换，避免骨骼父级绑定令压片回到世界坐标轴方向。
- 几何长轴使用 PCA 复核。T1 与 T2 的方向点积均为 `1.0`，通过阈值 `abs(dot) >= 0.95`。
- T1 长宽比为 `2.067589`，T2 长宽比为 `1.545697`，均高于 `1.4`。

### 2.2 蛇形走线和 FPC 连续性

- 每根手指采用一张连续的 `FingerFPC_*` 背衬网格，从 `MainFPC` 掌部桥接区延伸至末端。
- 蛇形段不再只是靠近压片。每段路径均从前一节点内部起步，并进入后一压片内部结束，端点波幅归零，避免视觉断口。
- 四指链路为：`MainFPC -> 蛇形 1 -> 压片 1 -> 蛇形 2 -> 压片 2 -> 蛇形 3 -> 压片 3`。
- 拇指链路为：`MainFPC -> Serpentine_T1 -> Sensor_T1 -> Serpentine_T2 -> Sensor_T2`。
- 对 `MainFPC`、五条 `FingerFPC_*`、14 个 `Serpentine_*` 和 14 个 `Sensor_*` 进行了 BVH 网格相交验证，不以对象原点距离代替真实几何接触。
- 0°、45°、90°姿态下重复验证连接关系，FPC 随骨骼运动，掌部主板保持刚性。

### 2.3 掌部、贴片和比例

- 掌部主 FPC 调整为 `2.90 x 2.08` 的矩形主体，减少原模型掌部过大的感觉。
- 电路区调整为 `2.24 x 1.42`，关键芯片与器件分布保留。
- 五指横向间距、指长和拇指 CMC 位置重新协调，拇指方向改为更自然的外展方向。
- 压片统一为矩形、轻圆角、同一厚度语言，长度由骨段长度约束，宽度不超过对应 FPC 支路宽度。
- 保留并校验 `CircuitModule`、`SignalConditioning`、`ESP32Module`、`IMUModule`、`BatteryModule` 与 `PowerManagement` 等教学语义节点。

## 3. 输出文件

| 文件 | 用途 | 大小 | SHA-256 |
|---|---|---:|---|
| `assets/blender/hsad_teaching_hand.blend` | 可编辑 Blender 源文件 | 324,781 B | `6E71B231A1D027D59C22571AA7E085B41747D0CF7450D796B91AF1D29DFFD705` |
| `public/models/hsad/hsad_teaching_hand.glb` | 网页正式模型 | 205,160 B | `7255F5B084290D982D447AFFFA16D8BC630F943EC551F56F088D50187B9FA715` |
| `tools/blender/rebuild_hsad_teaching_hand.py` | 可复现生成器 | 可执行脚本 | 见项目文件 |

原模型备份位于：

`backups/pre_fpc_correction_20260716_143851/`

## 4. 验证结果

### 4.1 Blender 源模型

- 23,952 个三角面
- 12,186 个顶点
- 86 个网格
- 16 根骨骼，其中 14 根为检测关节骨骼
- 14 个传感单元、14 个高亮节点、14 条蛇形连接段
- 0°、45°、90°三组姿态通过
- `acceptance.all_passed = true`

报告：`tools/blender/reports/hsad_teaching_hand_validation.json`

### 4.2 最终 GLB 回读

最终 GLB 被重新导入空 Blender 场景并执行同一组结构、节点、连接和姿态检查：

- 24,044 个三角面
- 17,540 个导入后顶点
- 88 个网格
- 1 个骨骼蒙皮，16 根骨骼
- 14 个传感单元完整保留
- Draco 压缩与语义节点完整保留
- `acceptance.all_passed = true`

报告：`tools/blender/reports/hsad_teaching_hand_glb_validation.json`

姿态验收图位于：

- `tools/blender/reports/teaching_hand_validation/`
- `tools/blender/reports/glb_validation/`

## 5. UI 替换结果

两个页面继续通过同一组件 `src/components/hand3d/HSADHand3D.tsx` 加载同一 GLB。模型 URL 增加版本查询参数，避免浏览器继续使用旧模型缓存。

### 5.1 认识装置

- 已替换为修正后的模型。
- 14 个检测单元、装置器件切换、上一个、下一个、自动讲解和浮动说明卡保持可用。
- 点击 `Sensor_<JointId>` 后以同一 `JointId` 选择关节并高亮，不依赖对象顺序。
- 模型可拖拽旋转、缩放和复位视角。

### 5.2 关节信号与动作映射实验台

- 中间舞台已使用同一修正模型。
- 右侧关节按钮、目标角度、骨骼运动、局部高亮和左侧波形继续以 `JointId` 联动。
- 实测浏览器操作 I2 从 0°到 60°时，目标角为 60°，SIA 教学推演角约 60.1°；回到 0°后角度回到 0.0°。
- 弯曲阶段生成正向差分峰值，伸展阶段生成负向谷值，保持后回到零附近。

## 6. 浏览器验收

| 场景 | 结果 | 证据 |
|---|---|---|
| 认识装置，桌面 | 模型加载、点击与信息卡正常 | `tools/browser/reports/device_fpc_corrected.png` |
| 实验台，I2 弯曲 | 高亮、角度和波形同步 | `tools/browser/reports/lab_fpc_corrected_bend.png` |
| 实验台，弯曲后伸展 | 正负瞬态与积分角回落正常 | `tools/browser/reports/lab_fpc_corrected_cycle.png` |
| 实验台，1024 x 768 | 无横向溢出，控制区正常下移 | `tools/browser/reports/lab_fpc_corrected_1024.png` |

生产构建已通过 TypeScript 与 Vite。浏览器无业务错误。控制台仅有 React Three Fiber 内部使用 Three.js 旧 `Clock` API 的上游弃用提示，不影响模型或交互。

## 7. 运行地址

当前开发站点运行于：

`http://127.0.0.1:5173/`

主要路由：

- `http://127.0.0.1:5173/#/device`
- `http://127.0.0.1:5173/#/lab`

