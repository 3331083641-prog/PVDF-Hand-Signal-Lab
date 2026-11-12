# HSAD Teaching UI

柔性 PVDF 手部动作信号采集与实时映射教学系统。包含教学总控、装置探索、PVDF 机理和关节信号实验台。

## 启动与构建

在本目录运行 Node.js 24 和 npm。

~~~powershell
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1
npm.cmd run build
~~~

本地入口为 http://127.0.0.1:5173/。在 GitHub Pages 子路径下构建时运行：

~~~powershell
npm.cmd run build -- --base=/PVDF-Hand-Signal-Lab/
~~~

## 模型与交互

- 当前网页模型为 public/models/hsad/hsad_reference_device.glb。
- 可编辑工程为 assets/blender/hsad_reference_device.blend。
- assets/reference/hsad_fpc_front.png 是器件布局和纹理参考。
- assets/reference/fpc_layout.json 保存照片轮廓与器件区域。
- 14 个关节的通道与节点定义位于 src/data/jointHotspots.ts。
- 串口采集支持实物输入，教学模式支持固定种子的信号推演。

## 模型重建

使用本机 Blender 后台运行，工作目录设为本项目目录：

~~~powershell
blender -b assets/blender/hsad_glove.blend --python-exit-code 1 -P tools/blender/build_reference_device.py -- assets/reference/fpc_layout.json
~~~

如需重新提取参考照片的布局，Python 环境需要 OpenCV、NumPy 和 Shapely 2.1：

~~~powershell
python tools/blender/trace_reference_fpc.py assets/reference/fpc_layout.json
~~~

build_reference_device.py 会生成新的 Blend 和 GLB。hsad_glove.blend 是构建输入，需保留。

## 数据说明

教学信号采用 80 Hz、1.65 V 双通道基线、(V+−V−)/2、二阶 6 Hz 滤波、0.006 V 阈值和积分角度恢复。14 个 Cj 为可替换的教学标定值，物理复现实验应使用实测校准。

照片复刻保持正面器件比例。参考图没有尺寸标尺，器件厚度与离手高度按斜视图估计。
