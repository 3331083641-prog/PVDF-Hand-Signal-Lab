# HSAD 三维模型节点与 UI 映射

本文档定义网页运行时使用的三维节点契约。依据如下：

- `src/data/jointHotspots.ts`：关节、原始通道、差分通道和运行时节点名的唯一数据源；
- `tools/blender/reports/hsad_teaching_hand_report.json`：最终 GLB 实际导出的骨骼、检测单元、高亮锚点、蛇形段和器件节点清单；
- `src/components/hand3d/HSADHand3D.tsx`：raycast 后的节点解析、高亮和骨骼驱动逻辑；
- `src/components/DeviceHotspotExplorer.tsx`、`src/components/JointMappingBench.tsx`：认识装置页和实验台的选择联动逻辑。

最终模型：`public/models/hsad/hsad_teaching_hand.glb`。模型报告记录其含 16 根骨骼，其中 14 根为检测关节骨骼；另有 14 个检测单元、14 个高亮锚点和 14 个蛇形柔性段。

## 1. 映射原则

关节映射以稳定的语义 ID 和节点名为准，不再使用“数组第几个对象”“场景遍历顺序”或 `Sensor_01` 至 `Sensor_14` 这类易错序号推断。

完整选择链路为：

`Sensor_<JointId>` 被 raycast 命中 → 由节点名解析出 `JointId`（同后缀的 `Highlight_<JointId>` 是高亮/聚焦锚点）→ 产生 `{ type: 'joint', id: JointId }` → UI 更新当前关节 → 波形引擎切换到该关节的两路原始电压及一路差分信号 → 对应 `boneNode` 接收角度并平滑运动。

模型、数据层和 UI 必须共同使用同一个 `JointId`。即使 Blender 中调整对象顺序、合并集合或重新导出 GLB，只要语义节点名不变，网页映射就不应变化。

## 2. 14 个关节、检测单元与通道

| JointId | 中文名称 | boneNode | sensorNode | highlightNode | 原始电压序号 | 差分输出 | UI 选择与联动 |
|---|---|---|---|---|---:|---|---|
| T2 | 拇指指间关节 IP | `Thumb_IP` | `Sensor_T2` | `Highlight_T2` | 1、2 | `D1` | 点击 T2 检测单元后选择 `T2`、启用对应高亮锚点，驱动拇指 IP，并切换到原始 1/2 与 D1 |
| T1 | 拇指掌指关节 MCP | `Thumb_MCP` | `Sensor_T1` | `Highlight_T1` | 3、4 | `D2` | 点击后选择 `T1`，驱动拇指 MCP，并切换到原始 3/4 与 D2 |
| I3 | 食指远端关节 DIP | `Index_DIP` | `Sensor_I3` | `Highlight_I3` | 5、6 | `D3` | 点击后选择 `I3`，驱动食指 DIP，并切换到原始 5/6 与 D3 |
| I2 | 食指近端关节 PIP | `Index_PIP` | `Sensor_I2` | `Highlight_I2` | 7、8 | `D4` | 点击后选择 `I2`，驱动食指 PIP，并切换到原始 7/8 与 D4 |
| I1 | 食指掌指关节 MCP | `Index_MCP` | `Sensor_I1` | `Highlight_I1` | 9、10 | `D5` | 点击后选择 `I1`，驱动食指 MCP，并切换到原始 9/10 与 D5 |
| M3 | 中指远端关节 DIP | `Middle_DIP` | `Sensor_M3` | `Highlight_M3` | 11、12 | `D6` | 点击后选择 `M3`，驱动中指 DIP，并切换到原始 11/12 与 D6 |
| M2 | 中指近端关节 PIP | `Middle_PIP` | `Sensor_M2` | `Highlight_M2` | 13、14 | `D7` | 点击后选择 `M2`，驱动中指 PIP，并切换到原始 13/14 与 D7 |
| M1 | 中指掌指关节 MCP | `Middle_MCP` | `Sensor_M1` | `Highlight_M1` | 15、16 | `D8` | 点击后选择 `M1`，驱动中指 MCP，并切换到原始 15/16 与 D8 |
| R3 | 无名指远端关节 DIP | `Ring_DIP` | `Sensor_R3` | `Highlight_R3` | 17、18 | `D9` | 点击后选择 `R3`，驱动无名指 DIP，并切换到原始 17/18 与 D9 |
| R2 | 无名指近端关节 PIP | `Ring_PIP` | `Sensor_R2` | `Highlight_R2` | 19、20 | `D10` | 点击后选择 `R2`，驱动无名指 PIP，并切换到原始 19/20 与 D10 |
| R1 | 无名指掌指关节 MCP | `Ring_MCP` | `Sensor_R1` | `Highlight_R1` | 21、22 | `D11` | 点击后选择 `R1`，驱动无名指 MCP，并切换到原始 21/22 与 D11 |
| L3 | 小指远端关节 DIP | `Little_DIP` | `Sensor_L3` | `Highlight_L3` | 23、24 | `D12` | 点击后选择 `L3`，驱动小指 DIP，并切换到原始 23/24 与 D12 |
| L2 | 小指近端关节 PIP | `Little_PIP` | `Sensor_L2` | `Highlight_L2` | 25、26 | `D13` | 点击后选择 `L2`，驱动小指 PIP，并切换到原始 25/26 与 D13 |
| L1 | 小指掌指关节 MCP | `Little_MCP` | `Sensor_L1` | `Highlight_L1` | 27、28 | `D14` | 点击后选择 `L1`，驱动小指 MCP，并切换到原始 27/28 与 D14 |

说明：每行的两个原始序号构成一对 PVDF 电压。运行时按 `Udiff = (Vplus - Vminus) / 2` 得到该行的差分输出；实际装置的弯曲正方向仍需通过零点与 `pair_sign` 校准，不应仅凭模型左右或对象顺序猜测极性。

## 3. 蛇形柔性段

最终 GLB 逐关节保留以下节点：

`Serpentine_T2`、`Serpentine_T1`、`Serpentine_I3`、`Serpentine_I2`、`Serpentine_I1`、`Serpentine_M3`、`Serpentine_M2`、`Serpentine_M1`、`Serpentine_R3`、`Serpentine_R2`、`Serpentine_R1`、`Serpentine_L3`、`Serpentine_L2`、`Serpentine_L1`。

节点后缀与 `JointId` 一一对应。它们用于显示对应关节附近的柔性走线，并跨相邻骨骼蒙皮，以便手指运动时保持连续。点击任一 `Serpentine_*` 目前归入器件类别 `serpentine`，用于解释“蛇形段为关节弯曲保留形变余量”；若未来要让点击蛇形段同时切换关节，应显式读取其 JointId 后缀，不可再按数组索引推断。

## 4. FPC 与器件节点

| 数据层类别 | GLB 节点名 | 点击后的教学用途 | 当前运行时解析状态 |
|---|---|---|---|
| `fpc` | `MainFPC` | 高亮手背主柔性板，说明其承载采集电路、连接五指支路 | 已由 `deviceParts.nodeNames` 直接支持 |
| `fpc` | `FingerFPC_Thumb`、`FingerFPC_Index`、`FingerFPC_Middle`、`FingerFPC_Ring`、`FingerFPC_Little` | 高亮对应指部柔性支路，说明检测单元与信号走线的连接关系 | 以 `FingerFPC` 前缀匹配，已支持 |
| `serpentine` | 14 个 `Serpentine_<JointId>` | 说明蛇形走线在屈曲时提供形变余量 | 以 `Serpentine` 前缀匹配，已支持 |
| `acquisition` | `DeviceRoot`、`CircuitModule` | 聚焦手背采集总成，说明采集、控制与无线传输的总体关系 | 已支持 |
| `conditioning` | `SignalConditioning` | 聚焦七组电荷放大/调理区域，说明微弱电荷如何转换为 ADC 可采集电压 | 已支持 |
| `esp32` | `ESP32Module` | 说明 28 路采样协调、数据封装与无线传输 | 已支持 |
| `imu` | `IMUModule` | 说明 Pitch、Yaw、Roll 与 14 个关节角共同组成动作映射输入 | 已支持 |
| `battery` | `BatteryModule` | 说明内置电池供电；模型不得呈现外接拖线电源 | 已支持 |
| `power` | `PowerManagement` | 说明充电、电源管理与稳压区域 | 已支持 |
| — | `AnalogMultiplexerArray` | 说明四个模拟多路复用器如何在 14 个 ADC 端口上切换 28 路原始电压 | 模型已导出，但当前未单列在 `deviceParts.nodeNames`；如需独立点击，应归入 `acquisition` 或新增语义类别 |
| — | `TypeCPort` | 说明充电/串口相关接口；不得误解为工作时必须外接供电 | 模型已导出，但当前未单列在 `deviceParts.nodeNames`；如需独立点击，应归入 `power` |

`SensorGroup` 是 14 个检测单元的语义父组；单个检测单元仍必须通过 `Sensor_<JointId>` 识别，不能把整个组当成某一个关节。

## 5. 两个页面中的选择行为

### 认识装置页

`DeviceHotspotExplorer` 接收模型的 `{ type, id, clientX, clientY }`。点击检测单元后，`type` 为 `joint`，浮框显示关节名称、所属手指、原始通道和差分输出；点击器件后，`type` 为 `part`，浮框显示该器件的核心作用。列表按钮、上一个/下一个和自动讲解也直接写入同一语义 ID，因此与三维点击保持一致。

### 关节信号与动作映射实验台

`JointMappingBench` 只接受 `type: 'joint'` 的模型选择。选择后调用 `selectJoint(id)`：

1. 更新 `selectedId`；
2. 选取 `jointHotspots` 中对应的原始通道和差分通道；
3. 将相应角度写入同一 `JointId` 的状态；
4. `HSADHand3D` 根据该条记录的 `boneNode` 以四元数插值驱动骨骼；
5. 波形引擎以同一 `jointId` 生成/读取该关节的数据。

因此，模型点击、表单选择、关节角、波形和局部高亮必须以 `JointId` 为共同主键。

## 6. 导出与回归检查

每次重新导出 `hsad_teaching_hand.glb` 后至少检查：

- 14 个 `boneNode`、14 个 `Sensor_<JointId>`、14 个 `Highlight_<JointId>` 均存在；
- `MainFPC`、至少一个 `FingerFPC_*`、至少一个 `Serpentine_*`，以及 `CircuitModule`、`SignalConditioning`、`ESP32Module`、`IMUModule`、`BatteryModule`、`PowerManagement` 均存在；
- 点击 `Sensor_I2` 必须选择 I2、显示原始 7/8 与 D4，并只驱动 `Index_PIP`；
- 点击 `Sensor_T2` 必须选择拇指 IP，而不是按数组第一个对象猜测任意关节；
- 调整 Blender collection、对象排序或 GLB 节点顺序后，映射仍保持不变；
- 模型选择、下拉框选择和波形选择产生同一个 `selectedId`；
- 不得恢复使用 `Sensor_01` 至 `Sensor_14` 的序号节点作为业务映射。

## 7. 连续 FPC 结构契约

2026-07-16 修正版在保留上述业务节点名的同时，增加了可自动验证的连接语义：

| 手指 | 连续结构链 |
|---|---|
| 拇指 | `MainFPC -> Serpentine_T1 -> Sensor_T1 -> Serpentine_T2 -> Sensor_T2` |
| 食指 | `MainFPC -> Serpentine_I1 -> Sensor_I1 -> Serpentine_I2 -> Sensor_I2 -> Serpentine_I3 -> Sensor_I3` |
| 中指 | `MainFPC -> Serpentine_M1 -> Sensor_M1 -> Serpentine_M2 -> Sensor_M2 -> Serpentine_M3 -> Sensor_M3` |
| 无名指 | `MainFPC -> Serpentine_R1 -> Sensor_R1 -> Serpentine_R2 -> Sensor_R2 -> Serpentine_R3 -> Sensor_R3` |
| 小指 | `MainFPC -> Serpentine_L1 -> Sensor_L1 -> Serpentine_L2 -> Sensor_L2 -> Serpentine_L3 -> Sensor_L3` |

每条 `Serpentine_*` 节点带有 `connectsFrom`、`connectsTo` 和 `continuityGroup` 元数据。`FingerFPC_Thumb`、`FingerFPC_Index`、`FingerFPC_Middle`、`FingerFPC_Ring`、`FingerFPC_Little` 分别为从掌部桥接区延伸至指端的单一连续背衬网格。

导出验收不得只检查节点存在。还必须在 0°、45°、90°姿态下检查：

- `MainFPC` 与五条 `FingerFPC_*` 的几何重叠；
- `Sensor_*` 与对应 `FingerFPC_*` 的几何接触；
- 每条 `Serpentine_*` 与前后目标的几何接触；
- T1、T2 几何长轴与拇指骨段方向点积不低于 `0.95`；
- 最终 GLB 重新导入空场景后，重复同一组检查。
