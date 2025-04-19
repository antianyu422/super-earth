import Geometry from './Geometry'
import Earth from '../Earth'
import {Cartesian3, Color, Entity, JulianDate, ScreenSpaceEventHandler, ScreenSpaceEventType} from 'cesium'
import {FeatureCollection, Point as geoJSONPoint} from 'geojson'

export default class Point extends Geometry {
  private originPosition: Cartesian3 = new Cartesian3()
  constructor(earth: Earth) {
    super(earth)
    this.type = 'Point'
    this.entityConstructorOptions = {
      id: this.id,
      point: {
        pixelSize: 15,
        color: new Color(0, 1, 1)
      }
    }
    this.entity = this.dataSource.entities.add(this.getEntity())
  }

  /**
   * 通过笛卡尔坐标生成几何图形
   * @param cartesian3 笛卡尔坐标
   * @returns 几何图形
   */
  public fromCartesian3(cartesian3: Cartesian3): Point {
    this.entity.position = cartesian3 as never
    this.originPosition = cartesian3.clone()
    return this
  }

  /**
   * 通过经纬度坐标生成几何图形
   * @param degrees 经纬度数组 [longitude, latitude, height]
   * @returns 几何图形
   */
  public fromDegree(degrees: number[]): Point {
    const cartesian3 = Cartesian3.fromDegrees(degrees[0], degrees[1], degrees[2] ?? 0)
    this.entity.position = cartesian3 as never
    this.originPosition = cartesian3.clone()
    return this
  }

  /**
   * 通过geoJSON生成几何图形
   * @param jsonString geoJSON字符串
   * @description 多个要素只会解析第一个要素
   * @returns 几何图形
   */
  public fromGeoJSON(jsonString: string): Point {
    const json: FeatureCollection<geoJSONPoint> = JSON.parse(jsonString)
    if (json.features.length > 0 && json.features[0].geometry.type === this.type) {
      const coordinates = json.features[0].geometry.coordinates
      const cartesian3 = Cartesian3.fromDegrees(coordinates[0], coordinates[1], coordinates[2])
      this.entity.position = cartesian3 as never
      this.originPosition = cartesian3.clone()
    } else {
      throw new Error('geoJSON无法正常解析')
    }
    return this
  }

  public toGeoJSON(): string {
    if (!this.entity.position) throw new Error('当前几何图形为空')
    return Point.toGeoJSON(this.entity.position.getValue(new JulianDate())!, this.type)
  }

  public revoke(): void {
    const edit = this.editHistory.pop()
    if (!edit) return
    Cartesian3.add(this.activePoints[0], edit.transform, this.activePoints[0])
    this.entity.position = this.activePoints as never
  }

  public reset(): void {
    this.entity.position = this.originPosition as never
  }

  public clear(): void {
    this.entity.position = new Cartesian3(0, 0, 0) as never
  }

  protected getEntity(): Entity {
    const entity = new Proxy(new Entity(this.entityConstructorOptions), {
      set: (obj, prop, value): boolean => {
        if (prop === 'editStatus' && obj.editStatus !== undefined && obj.editStatus !== value) {
          if (value === true) {
            // 开启编辑相关事件
            this.editEvent(true)
            this.editOpen()
          } else if (value === false) {
            // 关闭编辑相关事件
            this.editEvent(false)
            // 删除顶点
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

  protected editOpen() {
    super.editOpen()
    if (this.entity.point === undefined) return
    this.entity.point.color = new Color(1, 1, 0) as never
  }

  protected editClose() {
    super.editClose()
    if (this.entity.point === undefined) return
    this.entity.point.color = new Color(0, 1, 1) as never
  }

  protected handleEvents(status: boolean = true) {
    if (status) {
      this.handler.setInputAction(this.onLeftClick.bind(this), ScreenSpaceEventType.LEFT_CLICK)
      this.handler.setInputAction(this.onMove.bind(this), ScreenSpaceEventType.MOUSE_MOVE)
    } else {
      this.handler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK)
      this.handler.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE)
    }
  }

  protected onLeftClick(ev: ScreenSpaceEventHandler.PositionedEvent | boolean) {
    if (typeof ev === 'boolean') return
    const position = this.earth.scene.pickPosition(ev.position)
    if (!position) return
    this.entity.position = position as never
    this.activePoints.push(position)
    this.end()
  }

  protected onMove(ev: ScreenSpaceEventHandler.MotionEvent | boolean): void {
    if (typeof ev === 'boolean') return
    if (ev) this.tip.show(ev.endPosition, '单击绘制')
  }

  protected onLeftDown(ev: ScreenSpaceEventHandler.PositionedEvent | boolean) {
    if (typeof ev === 'boolean') return
    const feature = this.earth.scene.pick(ev.position)
    if (feature && feature.id instanceof Entity) {
      if (feature.id.point && feature.id.id !== this.id) return
      this.currentEntity = feature.id.entityCollection.owner.entities.getById(feature.id.id)
      this.earth.scene.screenSpaceCameraController.enableRotate = false
      this.handler.setInputAction(this.onDrag.bind(this), ScreenSpaceEventType.MOUSE_MOVE)
      this.editHistory.push({
        index: 0,
        type: 'edit',
        transform: this.activePoints[0].clone()
      })
    }
  }

  protected onLeftUp() { 
    this.handler.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE)
    this.earth.scene.screenSpaceCameraController.enableRotate = true
    this.currentEntity = null
    this.editStartPosition = null
    const edit = this.editHistory.at(-1)
    if (!edit) return
    if (Cartesian3.equals(this.activePoints[0], edit.transform)) {
      this.editHistory.pop()
    } else {
      Cartesian3.subtract(edit.transform, this.activePoints[0], edit.transform)
    }
  }

  protected onDrag(ev: ScreenSpaceEventHandler.MotionEvent | boolean) {
    if (typeof ev === 'boolean') return
    if (this.currentEntity === null) return
    const position = this.earth.scene.pickPosition(ev.endPosition)
    if (this.editStartPosition) {
      // 移动矢量
      const moveVector = Cartesian3.subtract(position, this.editStartPosition, new Cartesian3())
      Cartesian3.add(this.activePoints[0], moveVector, this.activePoints[0])
      this.currentEntity.position = this.activePoints[0] as never
    }

    // 重置起始点坐标
    this.editStartPosition = position
  }

  protected onEditRightClick() {}
}