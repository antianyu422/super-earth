import Earth from '../Earth.ts'
import {createGuid} from 'cesium'

/**
 * 图层基类
 */
export default class Layer {
  public id: string
  private _show: boolean = true
  protected earth: Earth
  constructor() {
    this.id = createGuid()
  }

  /** 
   * 定位到图层
   */
  public flyTo(): void {}

  /**
   * 获取图层是否可见
   */
  public get show(): boolean {
    return this._show
  }

  /**
   * 设置图层是否可见
   * @param value
   */
  public set show(value: boolean) {}

  /**
   * 图层在场景中的索引
   * @param earth
   * @protected
   */
  protected layerIndex(earth: Earth): number {
    return earth.layers.findIndex(item => item.id === this.id)
  }
}