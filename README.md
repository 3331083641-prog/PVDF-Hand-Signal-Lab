# PVDF Hand Signal Lab

柔性 PVDF 手部动作信号采集与实时映射教学系统。

[打开在线实验室](https://3331083641-prog.github.io/PVDF-Hand-Signal-Lab/)

## 目录

- ui/ — Vite、React、TypeScript 源码及本地开发入口。
- ui/assets/blender/ — 可编辑的 Blender 模型。
- ui/assets/reference/ — 正面器件参考照片与布局数据。
- ui/tools/blender/ — 建模、参考图轮廓提取和模型导出脚本。
- ui/docs/ — 教学、串口、模型及工程说明。
- 根目录 index.html、assets/、models/、draco/ — GitHub Pages 网页发布文件。

## 本地开发

~~~powershell
cd ui
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1
~~~

完整构建与模型重建步骤见 [UI 项目说明](ui/README.md)。

## 本次模型更新

手背器件按参考照片排列，包含四加三芯片阵列、ESP32 金属罩、贴片器件与铜走线。14 个感应区采用照片比例与镂空蛇形连接，并支持关节弯曲和串口动作映射。照片没有尺寸标尺，器件厚度和离手高度按斜视外观估计。
