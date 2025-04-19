import {
  Cartesian3, Color,
  Cesium3DTileset,
  Matrix3,
  Matrix4,
  Transforms,
  Math as CesiumMath,
  UniformSpecifier,
  VaryingType, defined, CustomShader, Cesium3DTileFeature, Framebuffer,
  DrawCommand, Model3DTileContent
} from 'cesium'
import Earth from '../Earth.ts'
import Layer from './Layer.ts'
import Outline from '../Glsl/Outline.ts'

interface CustomShaderOptions {
  id: string
  uniforms?: Record<string, UniformSpecifier>
  varyings?: Record<string, VaryingType>
  vertexShaderText?: string
  fragmentShaderText?: string
}

/**
 * 3DTiles图层
 *
 * 3DTile在Cesium中的层级 Tileset -> tile -> content -> feature
 * 是否存在feature取决于数据生产，在1.0版本中取决于是否 b3dm i3dm 中是否存在batchTable
 * 每个content生成一次绘制命令，即一个DrawCommand，即gpu绘制一次
 * content中可能存在若干个feature，通过一张纹理存储各feature对应的id以对每个feature进行操作
 * 例如scene.pick点选， Cesium3DTilesetStyle设置样式。feature.show设置显隐等等
 */
export default class Tileset extends Layer {
  public model: Cesium3DTileset
  public options: {
    url: string
  }
  private customShaders: CustomShaderOptions[] = []
  private framebuffer: Framebuffer
  private removeEvent: () => void
  private outlineColor: Color
  constructor(options: {
    url: string
  }) {
    super()
    this.options = options
  }

  /**
   * 添加tileset到场景
   * @param earth
   */
  public add(earth: Earth): Promise<Tileset> {
    this.earth = earth
    return new Promise((resolve, reject) => {
      const layerIndex = this.layerIndex(earth)
      if (layerIndex !== -1) {
        reject(new Error('该图层已经存在与场景中'))
      } else {
        Cesium3DTileset.fromUrl(this.options.url).then(value => {
          earth.primitives.add(value)
          earth.layers.push(this)
          this.model = value
          value.owner = this
          resolve(this)
        }).catch(reject)
      }
    })
  }

  /**
   * 从场景中移除tileset
   */
  public remove(): void {
    const layerIndex = this.layerIndex(this.earth)
    if (layerIndex !== -1) {
      if (this.removeEvent) this.removeEvent()
      if (this.framebuffer) this.framebuffer.destroy()
      this.earth.primitives.remove(this.model)
      this.earth.layers.splice(layerIndex, 1)
    }
  }

  /**
   * 定位到图层
   */
  public flyTo(): Promise<boolean> {
    super.flyTo()
    return this.earth.viewer.flyTo(this.model)
  }

  /**
   * 为整个3DTile设置轮廓线
   * @param color
   */
  public setOutline(color?: string): void {
    const viewer = this.earth.viewer
    const scene = viewer.scene
    const context = scene.context
    const view = scene.view
    const passState = view.passState
    const frameState = scene.frameState
    if (!color) {
      if (this.removeEvent) this.removeEvent()
      if (this.framebuffer) this.framebuffer.destroy()
      this.framebuffer = undefined
      return
    }
    if (!this.framebuffer) this.framebuffer = this.earth.createFramebuffer()
    this.outlineColor = Color.fromCssColorString(color)
    if (this.removeEvent) return
    this.removeEvent = this.earth.scene.postRender.addEventListener(() => {
      const mainFramebuffer = passState.framebuffer
      const mainCommand = frameState.commandList
      passState.framebuffer = this.framebuffer
      this.earth.clearFramebuffer()
      frameState.commandList = []
      this.model.update(frameState)
      frameState.commandList.forEach(command => {
        if (command instanceof DrawCommand) {
          scene.updateDerivedCommands(command)
          command.derivedCommands.logDepth.command.execute(context, passState)
        }
      })

      passState.framebuffer = mainFramebuffer
      frameState.commandList = mainCommand
      context.createViewportQuadCommand(Outline, {
        uniformMap: {
          colorTexture: () => this.framebuffer.depthTexture,
          outlineColor: () => this.outlineColor
        }
      }).execute(context, passState)
    })
  }

  /**
   * 添加customShader
   * 参数在原生custonShader的构造参数的基础上添加一个id，用于管理
   * 将原生的customShader分解成为多个customShader的组合，防止不同功能之间互相覆盖customShader设置
   * @param customShader
   * @param index
   */
  public addCustomShader(customShader: CustomShaderOptions, index?: number): void {
    const shaderIndex = this.customShaders.findIndex(item => item.id === customShader.id)
    if (shaderIndex !== -1) {
      this.customShaders.splice(shaderIndex, 1, customShader)
    } else {
      if (defined(index)) {
        if (index < 0 || index > this.customShaders.length) return
        this.customShaders.splice(index, 0, customShader)
      } else {
        this.customShaders.push(customShader)
      }
    }
    this.combineShader()
  }

  /**
   * 移除customShader
   * @param id
   */
  public removeCustomShader(id: string): void {
    const index = this.customShaders.findIndex(item => item.id === id)
    if (index !== -1) {
      this.customShaders.splice(index, 1)
      this.combineShader()
    }
  }

  /** 
   * 根据提供的坐标修改tileset的位置和姿态
   * @param model
   * @param options
   */
  public static transformMatrix(model: Tileset, options: {
    longitude: number
    latitude: number
    height: number,
    rotationX?: number
    rotationY?: number
    rotationZ?: number
  }): Matrix4 {
    const tileset = model.model
    // 包围盒上下(天地)方向上的半轴长
    // 3DTile数据包围盒有 box region sphere 三种
    // sphere无法计算为OBB包围盒，半周长为0
    let halfHeight = 0
    if (tileset.root?.boundingVolume?.boundingVolume?.halfAxes) {
      halfHeight = Cartesian3.distance(
        new Cartesian3(),
        Matrix3.getColumn(tileset.root.boundingVolume.boundingVolume.halfAxes, 2, new Cartesian3())
      )
    }

    tileset.modelMatrix = Matrix4.IDENTITY

    options.rotationX = options.rotationX ?? 0
    options.rotationY = options.rotationY ?? 0
    options.rotationZ = options.rotationZ ?? 0

    const center = tileset.boundingSphere.center
    const inverseTransformMatrix = Matrix4.inverse(
      Transforms.eastNorthUpToFixedFrame(
        Cartesian3.subtract(
          center,
          Cartesian3.multiplyByScalar(Cartesian3.normalize(center, new Cartesian3()), halfHeight, new Cartesian3()),
          new Cartesian3()
        )
      ), new Matrix4()
    )
    const rotateX = Matrix4.fromRotation(Matrix3.fromRotationX(CesiumMath.toRadians(options.rotationX)))
    const rotateY = Matrix4.fromRotation(Matrix3.fromRotationY(CesiumMath.toRadians(options.rotationY)))
    const rotateZ = Matrix4.fromRotation(Matrix3.fromRotationZ(CesiumMath.toRadians(options.rotationZ)))

    Matrix4.multiply(tileset.modelMatrix, Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(options.longitude, options.latitude, options.height)), tileset.modelMatrix)
    Matrix4.multiply(tileset.modelMatrix, rotateX, tileset.modelMatrix)
    Matrix4.multiply(tileset.modelMatrix, rotateY, tileset.modelMatrix)
    Matrix4.multiply(tileset.modelMatrix, rotateZ, tileset.modelMatrix)
    Matrix4.multiply(tileset.modelMatrix, inverseTransformMatrix, tileset.modelMatrix)

    return tileset.modelMatrix
  }

  /**
   * 读取batchTable中的数据
   * @param feature
   * @param key
   */
  public static getProperty(feature: Cesium3DTileFeature, key: string): any {
    const featureId = feature.featureId
    const content = feature.content
    const batchTable = content.batchTable
    return batchTable.getProperty(featureId, key)
  }

  /**
   * 为feature设置轮廓线
   * @param earth
   * @param feature
   * @param color
   */
  public static outlineForFeature(earth: Earth, feature: Cesium3DTileFeature, color: string): () => void {
    const viewer = earth.viewer
    const scene = viewer.scene
    const context = scene.context
    const view = scene.view
    const passState = view.passState
    const frameState = scene.frameState
    const outlineColor = Color.fromCssColorString(color)
    return scene.postRender.addEventListener(() => {
      const mainFramebuffer = passState.framebuffer
      const mainCommand = frameState.commandList
      passState.framebuffer = earth.temporaryFramebuffer
      earth.clearFramebuffer()
      frameState.commandList = []
      // 隐藏其他feature
      for (let i = 0; i < feature.content.featuresLength; i++) {
        if (feature.content.getFeature(i).featureId !== feature.featureId) {
          feature.content.getFeature(i).show = false
        }
      }
      feature.content.update(feature.tileset, frameState)
      frameState.commandList.forEach(command => {
        if (command instanceof DrawCommand) {
          scene.updateDerivedCommands(command)
          command.derivedCommands.logDepth.command.execute(context, passState)
        }
      })
      // 还原feature
      for (let i = 0; i < feature.content.featuresLength; i++) {
        feature.content.getFeature(i).show = true
      }
      passState.framebuffer = mainFramebuffer
      frameState.commandList = mainCommand
      context.createViewportQuadCommand(Outline, {
        uniformMap: {
          colorTexture: () => earth.temporaryFramebuffer.depthTexture,
          outlineColor: () => outlineColor
        }
      }).execute(context, passState)
    })
  }

  /**
   * 为content设置轮廓线
   * @param earth
   * @param content
   * @param color
   */
  public static outlineForContent(earth: Earth, content: Model3DTileContent, color: string): () => void {
    const viewer = earth.viewer
    const scene = viewer.scene
    const context = scene.context
    const view = scene.view
    const passState = view.passState
    const frameState = scene.frameState
    const outlineColor = Color.fromCssColorString(color)
    return scene.postRender.addEventListener(() => {
      const mainFramebuffer = passState.framebuffer
      const mainCommand = frameState.commandList
      passState.framebuffer = earth.temporaryFramebuffer
      earth.clearFramebuffer()
      frameState.commandList = []
      content.update(content.tileset, frameState)
      frameState.commandList.forEach(command => {
        if (command instanceof DrawCommand) {
          scene.updateDerivedCommands(command)
          command.derivedCommands.logDepth.command.execute(context, passState)
        }
      })
      passState.framebuffer = mainFramebuffer
      frameState.commandList = mainCommand
      context.createViewportQuadCommand(Outline, {
        uniformMap: {
          colorTexture: () => earth.temporaryFramebuffer.depthTexture,
          outlineColor: () => outlineColor
        }
      }).execute(context, passState)
    })
  }

  /**
   * 组合customShader
   * @private
   */
  private combineShader() {
    if (this.customShaders.length === 0) {
      this.model.customShader = undefined
      return
    }
    const uniforms = {}
    const varyings = {}
    let vertexMain = ''
    let fragmentMain = ''
    let vertexFunc = ''
    let fragmentFunc = ''

    this.customShaders.forEach((customShader, index) => {
      Object.assign(uniforms, customShader.uniforms)
      Object.assign(varyings, customShader.varyings)
      const vertexShaderText = customShader.vertexShaderText
      const fragmentShaderText = customShader.fragmentShaderText

      if (defined(vertexShaderText)) {
        const main = `customVertex_${index}`
        vertexMain += `${main}(vsInput, vsOutput);\n`
        vertexFunc += vertexShaderText.replace('vertexMain', main)
      }

      if (defined(fragmentShaderText)) {
        const main = `customFragment_${index}`
        fragmentMain += `${main}(fsInput, material);\n`
        fragmentFunc += fragmentShaderText.replace('fragmentMain', main)
      }
    })
    this.model.customShader = new CustomShader({
      uniforms,
      varyings,
      vertexShaderText: `
        ${vertexFunc}
        void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
          ${vertexMain}
        }
      `,
      fragmentShaderText: `
        ${fragmentFunc}
        void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
          ${fragmentMain}
        }
      `
    })
  }
}