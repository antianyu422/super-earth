import Geometry from './Geometry'
import Earth from '../Earth.ts'
import {CallbackProperty, Cartesian3, Color, JulianDate} from 'cesium'
import {FeatureCollection, Position, LineString} from 'geojson'

/**
 * 折线几何类
 */
export default class Polyline extends Geometry {
  private originPosition: Cartesian3[] = []
  constructor(earth: Earth) {
    super(earth)
    this.type = 'Polyline'
    this.entityConstructorOptions = {
      id: this.id,
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
  public fromCartesian3(cartesian3: Cartesian3[]): Polyline {
    if (cartesian3.length < 2) throw new Error('不能少于两个点')
    this.activePoints = cartesian3
    this.originPosition = cartesian3.map(position => position.clone())
    return this.generate()
  }

  /**
   * 通过经纬度坐标生成几何图形
   * @param degrees 经纬度数组 [[longitude, latitude, height], [longitude, latitude, height]]
   * @returns 几何图形
   */
  public fromDegree(degrees: number[][]): Polyline {
    if (degrees.length < 2) throw new Error('不能少于两个点')
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
  public fromGeoJSON(jsonString: string): Polyline {
    const cartesian3: Cartesian3[] = []
    const json: FeatureCollection<LineString> = JSON.parse(jsonString)
    if (json.features.length > 0 && json.features[0].geometry.type === this.type) {
      const coordinates = json.features[0].geometry.coordinates
      if (coordinates.length < 2) {
        throw new Error('不能少于两个点')
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
    if (!this.entity.polyline || !this.entity.polyline.positions) throw new Error('当前几何图形为空')
    return Polyline.toGeoJSON(this.entity.polyline.positions.getValue(new JulianDate()), this.type)
  }

  /**
   * 绘制图形
   */
  public draw(callback?: (cartesian3: Cartesian3[]) => void): void {
    super.draw(callback)
    this.entity.polyline!.positions = new CallbackProperty(() => {
      // 线首尾相连
      return this.activePoints
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

  /**
   * 双击结束绘制事件
   * @protected
   */
  protected onDoubleClick(): void {
    this.activePoints.pop()
    this.activePoints.pop()
    if (this.activePoints.length > 1) {
      this.generate()
      super.onDoubleClick()
    }
  }

  /**
   * 生成最终几何图形
   * @param cartesian3
   */
  private generate(cartesian3 = this.activePoints): Polyline {
    this.entity.polyline!.positions = cartesian3 as never
    return this
  }

  /**
   * 编辑开启
   * @protected
   */
  protected editOpen(): void {
    super.editOpen() 
    if (this.entity.polyline === undefined) return
    // 重新将几何图形坐标设为CallbackProperty， 保证移动连贯
    this.entity.polyline.positions = new CallbackProperty(() => {
      return this.activePoints
    }, false)

    // 改变线的颜色
    this.entity.polyline.material = new Color(1, 1, 0) as never
  }

  /**
   * 编辑关闭
   * @protected
   */
  protected editClose(): void {
    super.editClose()
    if (this.entity.polyline === undefined) return
    // 改变线的颜色
    this.entity.polyline.material = new Color(0, 1, 1) as never
    // 设置为普通坐标
    this.generate()
  }
}