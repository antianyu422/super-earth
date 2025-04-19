import {
  type Camera, Cartesian3, Color,
  Context, CustomDataSource, Framebuffer,
  Intersect, Pass, PixelDatatype, PixelFormat,
  PolylineArrowMaterialProperty,
  type PostProcessStageCollection,
  PrimitiveCollection,
  Scene, ScreenSpaceEventType, Texture,
  View, Viewer, DrawCommand, Globe
} from 'cesium'
import Layer from './Layer/Layer.ts'
import Tianditu from './Layer/Tianditu.ts'

/**
 * 主场景
 */
export default class Earth {
  public viewer: Viewer
  public container: string | HTMLElement
  /**
   * 图层容器
   */
  public layers: Layer[] = []
  public temporaryFramebuffer: Framebuffer

  constructor(container: string | HTMLElement = 'container') {
    this.container = container
    this.init()
  }

  public getDataSource(name: string): CustomDataSource {
    let dataSource = this.viewer.dataSources.getByName(name)[0]
    if (!dataSource) {
      dataSource = new CustomDataSource(name)
      this.viewer.dataSources.add(dataSource).then(() => {}).catch(() => {})
    }
    return dataSource
  }

  /**
   * 添加天地图影像和注记图层到场景中
   * @param token
   */
  public addTianditu(token: string): Promise<Awaited<Tianditu>[]> {
    const img = new Tianditu({
      type: 'img',
      token
    })
    const cia = new Tianditu({
      type: 'cia',
      token
    })
    return Promise.all([img.add(this), cia.add(this)])
  }

  /**
   * 生成帧缓冲区对象
   * @param options
   */
  public createFramebuffer(options?: {
    width?: number
    height?: number
  }): Framebuffer {
    const context = this.context
    const canvas = this.canvas
    const width = options?.width ?? canvas.clientWidth
    const height = options?.height ?? canvas.clientHeight
    return new Framebuffer({
      context,
      colorTextures: [
        new Texture({context, width, height, pixelFormat: PixelFormat.RGBA})
      ],
      depthTexture: new Texture({
        context, width, height,
        pixelFormat: PixelFormat.DEPTH_COMPONENT,
        pixelDatatype: PixelDatatype.UNSIGNED_INT})
    })
  }

  /**
   * 将经过主相机调度后生成的地形和3DTile绘制命令，在自定义相机的姿态下执行
   * <br><strong>适合在主相机的可视范围内做特殊分析</strong></br>
   * <br><strong>无法渲染主相机不可见的事物</strong></br>
   * <br><strong>无需在一帧中二次调度生成绘制命令</strong></br>
   * @see executeGlobeAnd3DTileBySelf 主相机外可见，但会进行额外调度
   * @param camera
   * @param framebuffer
   * @param logDepth
   */
  public executeGlobeAnd3DTile(camera: Camera, framebuffer: Framebuffer, logDepth: boolean): void {
    const context = this.context
    const view = this.view
    const passState = view.passState
    const originalFramebuffer = passState.framebuffer
    const cullingVolume = camera.frustum.computeCullingVolume(
      camera.positionWC,
      camera.directionWC,
      camera.upWC
    )
    context.uniformState.updateCamera(camera)
    passState.framebuffer = framebuffer
    this.clearFramebuffer()

    const frustumCommandsList = view.frustumCommandsList
    const numFrustums = frustumCommandsList.length
    for (let i = 0; i < numFrustums; ++i) {
      const index = numFrustums - i - 1
      const frustumCommands = frustumCommandsList[index]
      const globeCommands = frustumCommands.commands[Pass.GLOBE]
      const globeLength = frustumCommands.indices[Pass.GLOBE]

      for (let j = 0; j < globeLength; ++j) {
        const command = globeCommands[j]
        if (cullingVolume.computeVisibility(command.boundingVolume) !== Intersect.OUTSIDE) {
          if (logDepth) {
            command.derivedCommands.logDepth.command.execute(context, passState)
          } else {
            command.execute(context, passState)
          }
        }
      }

      const tilesetCommands = frustumCommands.commands[Pass.CESIUM_3D_TILE]
      const tilesetLength = frustumCommands.indices[Pass.CESIUM_3D_TILE]

      for (let j = 0; j < tilesetLength; ++j) {
        const command = tilesetCommands[j]
        if (cullingVolume.computeVisibility(command.boundingVolume) !== Intersect.OUTSIDE) {
          if (logDepth) {
            command.derivedCommands.logDepth.command.execute(context, passState)
          } else {
            command.execute(context, passState)
          }
        }
      }
    }
    passState.framebuffer = originalFramebuffer
  }

  /**
   * 通过自定义相机调度后生成的地形和3DTile绘制命令，在自定义相机的姿态下执行
   * <br><strong>适合在主相机的可视范围外做特殊分析</strong></br>
   * <br><strong>可以渲染主相机不可见的事物</strong></br>
   * <br><strong>会在一帧中进行额外的调度</strong></br>
   * @see executeGlobeAnd3DTile 不进行额外调度，但主相机外不可见
   * @param camera
   * @param framebuffer
   * @param logDepth
   */
  public executeGlobeAnd3DTileBySelf(camera: Camera, framebuffer: Framebuffer, logDepth: boolean): void {
    const scene = this.scene
    const context = this.context
    const view = this.view
    const frameState = scene.frameState
    const passState = view.passState

    const renderFunc = (commands) => {
      const originalFramebuffer = passState.framebuffer
      context.uniformState.updateCamera(camera)
      passState.framebuffer = framebuffer

      commands.forEach(command => {
        if (logDepth) {
          if (command instanceof DrawCommand) {
            if (command?.derivedCommands?.logDepth?.command) scene.updateDerivedCommands(command)
            command.derivedCommands.logDepth.command.execute(context, passState)
          }
        } else {
          if (command instanceof DrawCommand) command.execute(context, passState)
        }
      })
      passState.framebuffer = originalFramebuffer
    }
    scene.globe.render = new Proxy(Globe.prototype.render, {
      apply(target, thisArg) {
        target.call(thisArg, frameState, camera, renderFunc)
      }
    })

    scene.primitives.update = new Proxy(PrimitiveCollection.prototype.update, {
      apply(target, thisArg) {
        target.call(thisArg, frameState, camera, renderFunc)
      }
    })
  }

  public clearFramebuffer(): void {
    const scene = this.scene
    const passState = scene.view.passState
    const context = this.context
    scene._clearColorCommand.execute(context, passState)
    scene._depthClearCommand.execute(context, passState)
  }

  public get scene(): Scene {
    return this.viewer.scene
  }

  public get view(): View {
    return this.scene.view
  }

  public get camera(): Camera {
    return this.viewer.camera
  }

  public get context(): Context {
    return this.scene.context
  }

  public get canvas(): HTMLCanvasElement {
    return this.viewer.scene.canvas
  }

  public get primitives(): PrimitiveCollection {
    return this.viewer.scene.primitives
  }

  public get postProcessStages(): PostProcessStageCollection {
    return this.viewer.scene.postProcessStages
  }
 
  /**
   * 初始化方法
   */
  private init(): void {
    this.viewer = new Viewer(this.container, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      timeline: false,
      selectionIndicator: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false
    })
    this.viewer.scene.globe.depthTestAgainstTerrain = true
    this.viewer.imageryLayers.removeAll()
    // 双击entity会定位到entity 禁用
    this.viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    this.temporaryFramebuffer = this.createFramebuffer()
  }

  /**
   * ECEF坐标系坐标轴
   * @param status
   * @private
   */
  private debugGlobeAxis(status: boolean): void {
    if (status) {
      const dataSource = this.getDataSource('debugGlobeAxis')
      dataSource.entities.add({
        polyline: {
          positions: Cartesian3.fromDegreesArrayHeights([0, 0, 0, 0, 0, 10000000]),
          width: 10,
          material: new PolylineArrowMaterialProperty(
            new Color(1, 0, 0)
          )
        },
        position: Cartesian3.fromDegrees(0, 0, 10500000),
        label: {
          text: 'X',
          fillColor: new Color(1, 0, 0),
          font: '12px'
        }
      })
      dataSource.entities.add({
        polyline: {
          positions: Cartesian3.fromDegreesArrayHeights([90, 0, 0, 90, 0, 10000000]),
          width: 10,
          material: new PolylineArrowMaterialProperty(
            new Color(0, 1, 0)
          )
        },
        position: Cartesian3.fromDegrees(90, 0, 10500000),
        label: {
          text: 'Y',
          fillColor: new Color(0, 1, 0),
          font: '12px'
        }
      })
      dataSource.entities.add({
        polyline: {
          positions: Cartesian3.fromDegreesArrayHeights([0, 90, 0, 0, 90, 10000000]),
          width: 10,
          material: new PolylineArrowMaterialProperty(
            new Color(0, 0, 1)
          )
        },
        position: Cartesian3.fromDegrees(0, 90, 10500000),
        label: {
          text: 'Z',
          fillColor: new Color(0, 0, 1),
          font: '12px'
        }
      })
    } else {
      this.getDataSource('debugGlobeAxis').entities.removeAll()
    }
  }
}
