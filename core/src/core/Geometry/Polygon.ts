import {CallbackProperty, Cartesian3, Color, JulianDate, PolygonHierarchy, Cartographic, Rectangle, ScreenSpaceEventHandler, ScreenSpaceEventType} from 'cesium'
import Earth from '../Earth'
import Geometry from './Geometry'
import {FeatureCollection, Polygon as geoJSONPolygon, Position} from 'geojson'
import Tip from '../Tool/Tip.ts'

/**
 * 多边形几何类
 */
export default class Polygon extends Geometry {
  protected originPosition: Cartesian3[] = []
  constructor(earth: Earth) {
    super(earth)
    this.type = 'Polygon'
    this.entityConstructorOptions = {
      id: this.id,
      polygon: {
        material: new Color(0, 1, 1).withAlpha(0.4)
      },
      polyline: {
        material: new Color(0, 1, 1)
      }
    }
    this.entity = this.dataSource.entities.add(this.getEntity())
  }

  /**
   * 通过笛卡尔坐标生成几何图形
   * @param cartesian3 笛卡尔坐标数组 
   * @returns 几何图形
   */
  public fromCartesian3(cartesian3: Cartesian3[]): Polygon  {
    if (cartesian3.length < 3) throw new Error('不能少于3点')
    this.activePoints = cartesian3
    this.originPosition = cartesian3.map(position => position.clone())
    return this.generate()
  }

  /**
   * 通过经纬度坐标生成几何图形
   * @param degrees 经纬度数组 [[longitude, latitude, height], [longitude, latitude, height]]
   * @returns 几何图形
   */
  public fromDegree(degrees: number[][]): Polygon {
    if (degrees.length < 3) throw new Error('不能少于3点')
    const cartesian3: Cartesian3[] = []
    degrees.forEach(degree => {
      cartesian3.push(Cartesian3.fromDegrees(degree[0], degree[1], degree[2] ?? 0))
    })
    this.activePoints = cartesian3
    this.originPosition = cartesian3.map(position => position.clone())
    return this.generate()
  }

  /**
   * 通过geoJSON生成几何图形
   * @param jsonString geoJSON字符串
   * @description 多个要素只会解析第一个要素
   * @returns 几何图形
   */
  public fromGeoJSON(jsonString: string): Polygon {
    const cartesian3: Cartesian3[] = []
    const json: FeatureCollection<geoJSONPolygon> = JSON.parse(jsonString)
    if (json.features.length > 0 && json.features[0].geometry.type === this.type) {
      const coordinates = json.features[0].geometry.coordinates[0]
      if (coordinates.length < 3) {
        throw new Error('不能少于3点')
      } else {
        coordinates.forEach((position: Position) => {
          cartesian3.push(Cartesian3.fromDegrees(position[0], position[1], position[2] ?? 0))
        })
      }
    } else {
      throw new Error('geoJSON无法正常解析')
    }
    this.activePoints = cartesian3
    this.originPosition = cartesian3.map(position => position.clone())
    return this.generate()
  }

  /**
   * 将几何图形坐标输出为geoJSON字符串
   * @returns geoJSON字符串
   */
  public toGeoJSON(): string {
    if (!this.entity.polygon || !this.entity.polygon.hierarchy) throw new Error('当前几何图形为空')
    return Polygon.toGeoJSON(this.entity.polygon.hierarchy.getValue(new JulianDate()).positions, this.type)
  }

  /**
   * 绘制图形
   */
  public draw(callback?: (cartesian3: Cartesian3[]) => void): void {
    super.draw(callback)
    this.entity.polygon!.hierarchy = new CallbackProperty(() => {
      return new PolygonHierarchy(this.activePoints)
    }, false)
    this.entity.polyline!.positions = new CallbackProperty(() => {
      // 线首尾相连
      return [...this.activePoints, this.activePoints[0]]
    }, false)
  }

  public drawRect(callback?: (cartesian3: Cartesian3[]) => void): void {
    this.callback = callback
    this.startRect()
    this.entity.polygon.hierarchy = new CallbackProperty(() => {
      return new PolygonHierarchy(this.fromRect())
    }, false)
    this.entity.polyline.positions = new CallbackProperty(() => {
      const cartesian3 = this.fromRect()
      return [...cartesian3, cartesian3[0]]
    }, false)
  }

  public reset(): void {
    this.activePoints = this.originPosition.map(position => position.clone())
    this.generate()
  }

  public clear(): void {
    this.originPosition = this.activePoints.map(position => position.clone())
    this.activePoints = []
    this.generate()
  }

  public destroy() {
    this.handleRectEvents(false)
    super.destroy()
  }

  private startRect(): void {
    this.activePoints = []
    this.handleRectEvents()
    this.tip = new Tip(this.earth.container)
  }

  private fromRect(): Cartesian3[] {
    if (this.activePoints.length < 2) return []
    const rect = Rectangle.fromCartesianArray(this.activePoints)
    const height = (Cartographic.fromCartesian(this.activePoints[0]).height + Cartographic.fromCartesian(this.activePoints[0]).height) / 2
    const northeast = Rectangle.northeast(rect)
    const southeast = Rectangle.southeast(rect)
    const southwest = Rectangle.southwest(rect)
    const northwest = Rectangle.northwest(rect)
    return [
      Cartesian3.fromRadians(northeast.longitude, northeast.latitude, height),
      Cartesian3.fromRadians(southeast.longitude, southeast.latitude, height),
      Cartesian3.fromRadians(southwest.longitude, southwest.latitude, height),
      Cartesian3.fromRadians(northwest.longitude, northwest.latitude, height)
    ]
  }

  protected handleRectEvents(status: boolean = true): void {
    if (status) {
      this.handler.setInputAction(this.onRectLeftClick.bind(this), ScreenSpaceEventType.LEFT_CLICK)
      this.handler.setInputAction(this.onRightClick.bind(this), ScreenSpaceEventType.RIGHT_CLICK)
      this.handler.setInputAction(this.onMove.bind(this), ScreenSpaceEventType.MOUSE_MOVE)
      this.handler.setInputAction(this.onRectDoubleClick.bind(this), ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    } else {
      this.handler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK)
      this.handler.removeInputAction(ScreenSpaceEventType.RIGHT_CLICK)
      this.handler.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE)
      this.handler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
    }
  }

  protected onRectLeftClick(ev: ScreenSpaceEventHandler.PositionedEvent | boolean): void {
    if (typeof ev === 'boolean') return
    const position = this.earth.scene.pickPosition(ev.position)
    if (!position) return
    if (this.activePoints.length === 0) {
      this.activePoints.push(position)
    }
  }

  protected onRectDoubleClick(): void {
    if (this.activePoints.length >= 2) {
      const cartesian3 = this.fromRect()
      this.entity.polygon.hierarchy = new PolygonHierarchy(cartesian3) as never
      this.entity.polyline.positions = [...cartesian3, cartesian3[0]] as never
      this.activePoints = cartesian3
      this.originPosition = cartesian3.map(position => position.clone())
      this.handleRectEvents(false)
      this.end()
    }
  }

  /**
   * 双击结束绘制事件
   * @protected
   */
  protected onDoubleClick(): void {
    this.activePoints.pop()
    this.activePoints.pop()
    if (this.activePoints.length > 2) {
      this.generate()
      super.onDoubleClick()
    }
  }

  /**
   * 生成最终几何图形
   * @param cartesian3 生成最终几何图形
   */
  private generate(cartesian3 = this.activePoints): Polygon {
    this.entity.polygon!.hierarchy = new PolygonHierarchy(cartesian3) as never
    this.entity.polyline!.positions = [...cartesian3, cartesian3[0]] as never
    return this
  }

  /**
   * 编辑开启
   * @protected
   */
  protected editOpen(): void {
    super.editOpen()
    if (this.entity.polygon === undefined || this.entity.polyline === undefined) return
    // 重新将几何图形坐标设为CallbackProperty， 保证移动连贯
    this.entity.polygon.hierarchy = new CallbackProperty(() => {
      return new PolygonHierarchy(this.activePoints)
    }, false)
    this.entity.polyline.positions = new CallbackProperty(() => {
      return [...this.activePoints, this.activePoints[0]]
    }, false)

    // 改变面的颜色
    ;(this.entity.polygon.material as unknown as Color) = new Color(1, 1, 0).withAlpha(0.3)
    // 改变线的颜色
    ;(this.entity.polyline.material as unknown as Color) = new Color(1, 1, 0)
  }

  /**
   * 编辑关闭
   * @protected
   */
  protected editClose(): void {
    super.editClose()
    if (this.entity.polygon === undefined || this.entity.polyline === undefined) return
    // 改变面的颜色
    ;(this.entity.polygon.material as unknown as Color) = new Color(0, 1, 1).withAlpha(0.3)
    // 改变线的颜色
    ;(this.entity.polyline.material as unknown as Color) = new Color(0, 1, 1)
    // 设置为普通坐标
    this.generate()
  }
}