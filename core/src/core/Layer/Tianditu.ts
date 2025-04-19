import Layer from './Layer.ts'
import {GeographicTilingScheme, ImageryLayer, WebMapTileServiceImageryProvider} from 'cesium'
import Earth from '../Earth.ts'

/**
 * 天地图WMTS图层
 */
export default class Tianditu extends Layer {
  public layer: ImageryLayer
  public options: {
    type: string
    token: string
  }
  constructor(options: { 
    type: string
    token: string
  }) {
    super()
    this.options = options
    this.init()
  }

  /**
   * 添加图层到场景
   * @param earth
   */
  public add(earth: Earth): Promise<Tianditu> {
    this.earth = earth
    return new Promise((resolve, reject) => {
      const layerIndex = this.layerIndex(earth)
      if (layerIndex !== -1) {
        reject(new Error('该图层已经存在与场景中'))
      } else {
        earth.viewer.imageryLayers.add(this.layer)
        earth.layers.push(this)
        resolve(this)
      }
    })
  }

  /**
   * 从场景中移除图层
   */
  public remove(): void {
    const layerIndex = this.layerIndex(this.earth)
    if (layerIndex !== -1) {
      this.earth.viewer.imageryLayers.remove(this.layer)
      this.earth.layers.splice(layerIndex, 1)
    }
  }

  public flyTo(): Promise<boolean> {
    super.flyTo()
    return this.earth.viewer.flyTo(this.layer)
  }

  /**
   * 设置图层可见性
   * @param value
   */
  public set show(value: boolean) {
    this.layer.show = value
  }

  /**
   * 初始化天地图图层
   * @private
   */
  private init(): void {
    const matrixIds = new Array(18)
    for (let i = 0; i < 18; i++) {
      matrixIds[i] = String(i + 1)
    }
    this.layer = new ImageryLayer(
      new WebMapTileServiceImageryProvider({
        url: `http://{s}.tianditu.gov.cn/${this.options.type}_c/wmts?service=wmts&request=GetTile&version=1.0.0&LAYER=${this.options.type}&tileMatrixSet=c&TileMatrix={TileMatrix}&TileRow={TileRow}&TileCol={TileCol}&tk=${this.options.token}`,
        layer: this.options.type,
        style: 'default',
        tileMatrixLabels: matrixIds,
        tileMatrixSetID: 'c',
        tilingScheme: new GeographicTilingScheme(),
        format: 'tiles',
        subdomains: ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']
      }),
      {}
    )
  }
}