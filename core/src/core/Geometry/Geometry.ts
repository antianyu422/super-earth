import {
  CallbackProperty,
  Cartesian3,
  Cartographic,
  Color,
  createGuid,
  CustomDataSource,
  Entity,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer
} from 'cesium'
import Earth from '../Earth'
import Tip from '../Tool/Tip.ts'

/**
 * 几何基类
 */
export default class Geometry {
  protected activePoints: Cartesian3[]
  protected earth: Earth
  protected viewer: Viewer
  // 几何类型
  public type: string
  protected _id: string
  // 几何图形的entity对象
  protected entity: Entity
  protected handler: ScreenSpaceEventHandler
  // entity构造参数，由子类规定
  protected entityConstructorOptions: Entity.ConstructorOptions
  // 几何容器
  protected dataSource: CustomDataSource
  // 几何顶点容器
  protected pointDataSource: CustomDataSource
  // 编辑时被编辑的entity
  protected currentEntity: Entity
  // 编辑时起始坐标
  protected editStartPosition: Cartesian3
  protected pickHeight: number
  protected editHistory: Array<{
    // -1 整体移动
    index: number
    transform?: Cartesian3
    // add edit remove
    type: string
  }> = []
  protected tip: Tip
  protected callback: ((cartesian3: Cartesian3[]) => void) | undefined = undefined
  constructor(earth: Earth) {
    this.activePoints = []
    this.earth = earth
    this.viewer = earth.viewer
    this._id = createGuid()
    this.handler = new ScreenSpaceEventHandler(earth.canvas)
    this.dataSource = earth.getDataSource(createGuid())
    this.pointDataSource = earth.getDataSource(createGuid())
  }

  /**
   * 开始绘制
   */
  public draw(callback?: (cartesian3: Cartesian3[]) => void): void {
    this.callback = callback
    this.start()
  }

  /**
   * 开启/关闭编辑
   * @param status
   */
  public edit(status: boolean): void {
    this.entity.editStatus = status
    this.editHistory = []
  } 
  
  public flyTo(): Promise<boolean> {
    return this.viewer.flyTo(this.entity)
  }
  
  public revoke(): void {
    const edit = this.editHistory.pop()
    if (!edit) return
    const returnEdit = (index: number, transform: Cartesian3): void => {
      Cartesian3.add(this.activePoints[index], transform, this.activePoints[index])
    }
    if (edit.type === 'edit') {
      if (edit.index === -1) {
        this.activePoints.forEach((_, index) => {
          returnEdit(index, edit.transform)
        })
      } else {
        if (edit.type === 'edit') returnEdit(edit.index, edit.transform)
      }
    } else if (edit.type === 'add') {
      this.activePoints.splice(edit.index + 1, 1)
    } else if (edit.type === 'remove') {
      this.activePoints.splice(edit.index, 0, edit.transform)
    }
    this.addPoint()
  }

  public remove(): boolean {
    return this.dataSource.entities.removeById(this.id)
  }
  
  public destroy(): void {
    this.handleEvents(false)
    this.dataSource.entities.remove(this.entity)
    this.tip.destroy()
  }

  public get id(): string {
    return this._id
  }

  /**
   * 几何图形的geoJSON形式
   * @param cartesian3
   * @param type
   */
  public static toGeoJSON(cartesian3: Cartesian3 | Cartesian3[], type: string): string {
    const coordinates = []
    if (type === 'Point') {
      if (!Array.isArray(cartesian3)) {
        const cartographic = Cartographic.fromCartesian(cartesian3)
        coordinates.push(CesiumMath.toDegrees(cartographic.longitude))
        coordinates.push(CesiumMath.toDegrees(cartographic.latitude))
      }
    } else if (type === 'Polyline') {
      if (Array.isArray(cartesian3)) {
        cartesian3.forEach(position => {
          const cartographic = Cartographic.fromCartesian(position)
          coordinates.push([CesiumMath.toDegrees(cartographic.longitude), CesiumMath.toDegrees(cartographic.latitude)])
        })
      }
    } else if (type === 'Polygon') {
      if (Array.isArray(cartesian3)) {
        coordinates.push([])
        cartesian3.forEach(position => {
          const cartographic = Cartographic.fromCartesian(position)
          coordinates[0].push([CesiumMath.toDegrees(cartographic.longitude), CesiumMath.toDegrees(cartographic.latitude)])
        })
      } else {
        throw new Error('需要cartesian3数组')
      }
    }
    const json = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            coordinates: coordinates,
            type: type === 'Polyline' ? 'LineString' : type
          }
        }
      ]
    }
    return JSON.stringify(json)
  }

  protected start(): void {
    this.activePoints = []
    this.handleEvents()
    this.tip = new Tip(this.earth.container)
    // this.tip.setContent('')
  }

  protected end(): void {
    console.log(123)
    this.handleEvents(false)
    this.callback(this.activePoints.map(point => Cartesian3.clone(point)))
    this.tip.destroy()
  }

  protected handleEvents(status: boolean = true): void {
    if (status) {
      this.handler.setInputAction(this.onLeftClick.bind(this), ScreenSpaceEventType.LEFT_CLICK)
      this.handler.setInputAction(this.onRightClick.bind(this), ScreenSpaceEventType.RIGHT_CLICK)
      this.handler.setInputAction(this.onMove.bind(this), ScreenSpaceEventType.MOUSE_MOVE)
      this.handler.setInputAction(this.onDoubleClick.bind(this), ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    } else {
      this.handler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK)
      this.handler.removeInputAction(ScreenSpaceEventType.RIGHT_CLICK)
      this.handler.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE)
      this.handler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    }
  }

  protected onLeftClick(ev: ScreenSpaceEventHandler.PositionedEvent | boolean): void {
    if (typeof ev === 'boolean') return
    const position = this.earth.scene.pickPosition(ev.position)
    if (!position) return
    this.activePoints.push(position)
  }

  protected onRightClick(ev: ScreenSpaceEventHandler.PositionedEvent | boolean): void {
    if (typeof ev === 'boolean') return
    if (this.activePoints.length === 1) {
      this.activePoints.pop()
      this.tip.show(ev.position, '单击开始')
    } else if (this.activePoints.length === 2) {
      this.activePoints.pop()
      this.activePoints.pop()
      this.tip.show(ev.position, '单击开始')
    }else if (this.activePoints.length > 1) {
      this.activePoints.splice(this.activePoints.length - 2, 1)
    }
  }

  protected onMove(ev: ScreenSpaceEventHandler.MotionEvent | boolean): void {
    if (typeof ev === 'boolean') return
    if (this.activePoints.length === 0) {
      this.tip.show(ev.endPosition, '单击开始')
      return
    }
    const position = this.earth.scene.pickPosition(ev.endPosition)
    if (!position) return
    this.tip.show(ev.endPosition, '右键删除，双击结束')
    if (this.activePoints.length === 1) {
      this.activePoints.push(position)
    } else {
      this.activePoints.pop()
      this.activePoints.push(position)
    }
  }

  protected onDoubleClick(): void {
    this.end()
  }

  /**
   * 开启或关闭编辑功能
   * @param status
   */
  protected editEvent(status: boolean): void {
    if (status) {
      this.handler.setInputAction(this.onLeftDown.bind(this), ScreenSpaceEventType.LEFT_DOWN)
      this.handler.setInputAction(this.onLeftUp.bind(this), ScreenSpaceEventType.LEFT_UP)
      this.handler.setInputAction(this.onEditRightClick.bind(this), ScreenSpaceEventType.RIGHT_CLICK)
    } else {
      this.handler.removeInputAction(ScreenSpaceEventType.LEFT_DOWN)
      this.handler.removeInputAction(ScreenSpaceEventType.LEFT_UP)
      this.handler.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE)
      this.handler.removeInputAction(ScreenSpaceEventType.RIGHT_CLICK)
      this.earth.scene.screenSpaceCameraController.enableRotate = true
    }
  }

  /**
   * 编辑时左键按住事件
   * @param ev
   * @protected
   */
  protected onLeftDown(ev: ScreenSpaceEventHandler.PositionedEvent | boolean): void {
    if (typeof ev === 'boolean') return
    const feature = this.earth.scene.pick(ev.position)
    if (feature && feature.id instanceof Entity) {
      if ((feature.id.polygon || feature.id.polyline) && feature.id.id !== this.id) return
      if (feature.id.point && feature.id.id.split('_')[1] !== this.id) return
      this.currentEntity = feature.id.entityCollection.owner.entities.getById(feature.id.id)
      // 禁止鼠标拖拽移动视角
      this.earth.scene.screenSpaceCameraController.enableRotate = false
      this.handler.setInputAction(this.onDrag.bind(this), ScreenSpaceEventType.MOUSE_MOVE)

      this.pickHeight = Cartographic.fromCartesian(this.earth.scene.pickPosition(ev.position)).height

      let index: number
      if (this.currentEntity.point) {
        index = Number(this.currentEntity.id.split('_')[3])
      } else if (this.currentEntity.polygon || this.currentEntity.polyline) {
        index = -1
      }
      this.editHistory.push({
        index,
        type: 'edit',
        transform: Cartesian3.clone(index === -1 ? this.activePoints[0] : this.activePoints[index])
      })
    }
  }

  /**
   * 编辑时左键抬起事件
   * @protected
   */
  protected onLeftUp(): void {
    this.handler.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE)
    this.earth.scene.screenSpaceCameraController.enableRotate = true
    this.currentEntity = null
    this.pickHeight = null
    this.editStartPosition = null
    const edit = this.editHistory.at(-1)
    if (!edit) return
    const index = edit.index === -1 ? 0 : edit.index
    if (Cartesian3.equals(this.activePoints[index], edit.transform)) {
      this.editHistory.pop()
    } else {
      Cartesian3.subtract(edit.transform, this.activePoints[index], edit.transform )
    }
  }

  /**
   * 编辑拖动事件
   * @protected
   * @param ev
   */
  protected onDrag(ev: ScreenSpaceEventHandler.MotionEvent | boolean) {
    if (typeof ev === 'boolean') return
    if (this.currentEntity === null) return
    if (this.pickHeight === null) return

    const posOnEarth = this.earth.camera.pickEllipsoid(ev.endPosition)

    const radian = Cartographic.fromCartesian(posOnEarth)
    const posHeight = Cartesian3.fromRadians(radian.longitude, radian.latitude, this.pickHeight)

    const changePosition = (index: number, moveVector: Cartesian3) => {
      const position = this.activePoints[index]
      const height = Cartographic.fromCartesian(position).height
      Cartesian3.add(position, moveVector, position)
      const radian = Cartographic.fromCartesian(position)
      this.activePoints[index] = Cartesian3.fromRadians(radian.longitude, radian.latitude, height)
    }

    if (this.editStartPosition) {
      const moveVector = Cartesian3.subtract(posHeight, this.editStartPosition, new Cartesian3())
      if (this.currentEntity.point) {
        const index = Number(this.currentEntity.id.split('_')[3])
        changePosition(index, moveVector)
      } else if (this.currentEntity.polygon || this.currentEntity.polyline) {
        this.activePoints.forEach((_, index) => {
          changePosition(index, moveVector)
        })
      }
    }
    this.editStartPosition = posHeight
  }

  /**
   * 编辑时右键点击事件，右键点击新增点，或者删除点
   * @protected
   * @param ev
   */
  protected onEditRightClick(ev: ScreenSpaceEventHandler.PositionedEvent | boolean): void {
    if (typeof ev === 'boolean') return
    const feature = this.earth.scene.pick(ev.position)
    const position = this.earth.scene.pickPosition(ev.position)
    if (feature && feature.id instanceof Entity) {
      const index = Number(feature.id.id.split('-')[3])
      const remove = this.activePoints.splice(index, 1)
      this.editHistory.push({
        index,
        type: 'remove',
        transform: Cartesian3.clone(remove[0])
      })
    } else {
      // 垂直距离
      let verticalDistance = Number.POSITIVE_INFINITY
      // 斜边距离
      let hypotenuseDistance = Number.POSITIVE_INFINITY
      let verticalIndex = 0
      let hypotenuseIndex = 0
      for (let i = 0; i < this.activePoints.length;i++) {
        const vectorLeft = Cartesian3.subtract(position, this.activePoints[i], new Cartesian3())
        const vectorRight = Cartesian3.subtract(this.activePoints[i + 1] ?? this.activePoints[0], this.activePoints[i], new Cartesian3())

        // 只计算同向矢量
        if (Cartesian3.dot(vectorLeft, vectorRight) > 0) {
          const cos = Cartesian3.dot(
            Cartesian3.normalize(vectorLeft, new Cartesian3()),
            Cartesian3.normalize(vectorRight, new Cartesian3())
          )
          const vectorLeftLength = Cartesian3.distance(position, this.activePoints[i])
          const distance = Math.sqrt(
            1 - Math.pow(cos, 2)
          ) * vectorLeftLength
          // 得到垂直距离最小的点的索引
          if (distance < verticalDistance) {
            verticalDistance = distance
            verticalIndex = i
          }
          // 得到斜边距离最小的点的索引
          if (vectorLeftLength < hypotenuseDistance) {
            hypotenuseDistance = vectorLeftLength
            hypotenuseIndex = i
          }
        }
      }
      let index = 0
      // 如果垂直距离最小和斜边距离最小的点不是同一个点，选择斜边距离最小的点
      if (verticalIndex !== hypotenuseIndex) {
        index = Cartesian3.distance(position, this.activePoints[verticalIndex]) < Cartesian3.distance(position, this.activePoints[hypotenuseIndex]) ?
          verticalIndex : hypotenuseIndex
      } else {
        index = verticalIndex
      }
      this.activePoints.splice(index + 1, 0, position)
      this.editHistory.push({
        index,
        type: 'add'
      })
    }
    this.addPoint()
  }

  /**
   * 获取proxy的entity对象
   * @protected
   * @description 通过Proxy拦截对editStatus属性的设置，判断开启/关闭编辑功能
   */
  protected getEntity(): Entity {
    const entity = new Proxy(new Entity(this.entityConstructorOptions), {
      set: (obj, prop, value): boolean => {
        // 拦截editStatus属性设置，开启/关闭编辑功能
        if (prop === 'editStatus' && obj.editStatus !== undefined && obj.editStatus !== value) {
          // 开启编辑功能
          if (value === true) {
            // 开启编辑相关事件
            this.editEvent(true)
            // 添加顶点
            this.addPoint()
            this.editOpen()
            // 关闭编辑功能
          } else if (value === false) {
            // 关闭编辑相关事件
            this.editEvent(false)
            // 删除顶点
            this.pointDataSource.entities.removeAll()
            this.editClose()
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (obj as any)[prop] = value
        return true
      }
    })
    entity.editStatus = false
    return entity
  }

  private addPoint(): void {
    this.pointDataSource.entities.removeAll()
    this.activePoints.forEach((_cartesian3: Cartesian3, index: number) => {
      this.pointDataSource.entities.add({
        id: `$_${this.id}_edit_${index}`,
        position: new CallbackProperty(() => {
          return this.activePoints[index]
        }, false) as unknown as Cartesian3,
        point: {
          color: new Color(1, 1, 0),
          pixelSize: 10
        }
      })
    })
  }

  /**
   * 编辑开始时子类的行为，此处为空，由子类决定
   * @protected
   */
  protected editOpen(): void {}

  /**
   * 编辑关闭时子类的行为，此处为空，由子类决定
   * @protected
   */
  protected editClose(): void {}
}