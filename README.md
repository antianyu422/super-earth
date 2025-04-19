# 🌍 SuperEarth - 基于 CesiumJS 的 3D 地球可视化组件库

> 这个项目并非通用组件库，而是我在开发 3D 地理可视化项目过程中，对 Cesium 的一些封装实践与特殊处理方法的整理与积累。  
涵盖地形处理、图层加载、分析工具、GLSL 特效等开发中遇到的“非标准”需求或技巧，作为 **开发笔记 + 可复用代码仓库**。

---

## 🚀 技术栈

| 技术                                                        | 用途               |
|-----------------------------------------------------------|------------------|
| [CesiumJS 1.128.0](https://cesium.com/platform/cesiumjs/) | 三维地球引擎           |
| [Vue 3](https://vuejs.org/)                               | 前端 UI 框架         |
| [TypeScript](https://www.typescriptlang.org/)             | 开发语言             |
| [Vite](https://vitejs.dev/)                               | 快速构建工具，支持组件库打包优化 |

---


## 🧭 初衷

- ✅ 快速复用 Cesium 相关模块，减少重复工作
- 🧪 记录处理特殊功能的技术方案

---

## 🌟 项目特色

该库不仅封装常见的 Cesium 模块组件，还包含了一些 **开发过程中总结的高级用法与技巧**，适合二次开发和深入定制需求的项目。安装依赖后在core中使用npm link 命令连接cesium，可以直接修改无需打包。

---

### 🎥 使用自定义相机（虚拟相机）进行离屏渲染

由于Cesium中如tileset或QuadtreeTile由主相机调度生成绘制命令，所以提供如下两种方法

#### 📌 模式一：根据主相机调度

无需修改源码

- [开敞度分析](core/src/core/Analysis/Openness.ts)

#### 📌 模式二：根据自定义相机

需要修改源码并配合Proxy

- [虚拟相机](core/src/core/Other/VirtualCamera.ts)

### 🛡️ 使用 Proxy 拦截 Cesium 默认操作

使用了 **ES6 Proxy** 对象代理模式，对 Cesium 方法调用进行拦截，配合自定义相机或者修改ShaderProgram中glsl代码实现类似Tileset中的CustomShader功能

- [卷帘分析](core/src/core/Analysis)

### 🧩 手动调用生成绘制命令的方法

手动调用Primitive Globe 等等对象的update或render方法，配合Proxy、离屏渲染、Cesium原生渲染事件等实现特殊功能，例如

- [范围线](core/src/core/Layer/Tileset.ts)
