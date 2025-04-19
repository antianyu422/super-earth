import Analysis from './Analysis.ts'
import Earth from '../Earth.ts'
import {Cartesian3, Matrix3, Matrix4, Rectangle, Transforms, UniformType} from 'cesium'
import Tileset from '../Layer/Tileset.ts'

/**
 * 压平分析
 */
export default class Flatten extends Analysis {
  private positions: Cartesian3[]
  private flattened: Tileset[] = []
  constructor() {
    super()
  }

  /**
   * 添加到场景
   * @param earth
   */
  public add(earth: Earth) {
    super.add(earth)
  }

  /**
   * 开始分析
   * @param positions
   */
  public start(positions: Cartesian3[]): void {
    this.positions = positions.map(position => position.clone())
    this.positions.push(this.positions[0])
    this.analysis()
  }

  /**
   * 清楚分析
   */
  public clear(): void {
    this.flattened.forEach((item) => {
      item.removeCustomShader(this.id)
    })
    this.flattened = []
  }

  /**
   * 从场景中移除
   */
  public remove() {
    this.clear()
    super.remove()
  }

  /**
   * 压平
   * @private
   */
  private analysis(): void {
    const positions = []
    const uniforms = {}
    this.positions.forEach((position, index) => {
      uniforms[`drawPosition_${index}`] = {
        type: UniformType.VEC3,
        value: position
      }
      positions.push(`drawPosition_${index}`)
    })
    this.earth.layers.forEach(layer => {
      if (layer instanceof Tileset && this.tilesetInPolygon(layer)) {
        let halfHeight = 0
        if (layer.model.root?.boundingVolume?.boundingVolume?.halfAxes) {
          halfHeight = Cartesian3.distance(
            new Cartesian3(),
            Matrix3.getColumn(layer.model.root.boundingVolume.boundingVolume.halfAxes, 2, new Cartesian3())
          )
        }
        const found = this.flattened.find(item => item.id === layer.id)
        if (found) return
        this.flattened.push(layer)
        uniforms['ENUMatrix'] = {
          type: UniformType.MAT4,
          value: Transforms.eastNorthUpToFixedFrame(layer.model.boundingSphere.center)
        }
        uniforms['inverseENUMatrix'] = {
          type: UniformType.MAT4,
          value: Matrix4.inverse(Transforms.eastNorthUpToFixedFrame(layer.model.boundingSphere.center), new Matrix4())
        }

        // 压平到tileset的最低点(box region) sphere会压平到包围盒中心的位置
        uniforms['transform'] = {
          type: UniformType.MAT4,
          value: new Matrix4(
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 0.0, -halfHeight,
            0.0, 0.0, 0.0, 1.0,
          )
        }
        layer.addCustomShader({
          id: this.id,
          uniforms,
          vertexShaderText: `
            bool pointInPolygon(in vec4 positionMC) {
              bool inPolygon = false;
              vec3 positions[] = vec3[](${positions.toString()});
              for (int i = 0; i < ${positions.length - 1}; i++) {
                vec2 point = vec2((inverseENUMatrix * czm_model * positionMC).xy);
                vec2 start = (inverseENUMatrix * vec4(positions[i + 1], 1.0)).xy;
                vec2 end = (inverseENUMatrix * vec4(positions[i], 1.0)).xy;
                
                start.y -= point.y;
                end.y -= point.y;
                
                float lineCrossX = 
                  (0.0 - start.y) /
                  (end.y - start.y) *
                  (end.x - start.x) +
                  start.x;
                  
                if (start.y * end.y < 0.0 && lineCrossX < point.x) {
                  inPolygon = !inPolygon;
                }
              }
              return inPolygon;
            }
            
            void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
              vec4 positionMC = vec4(vsOutput.positionMC, 1.0);
              if (pointInPolygon(positionMC)) {
                vsOutput.positionMC = (czm_inverseModel * ENUMatrix * transform * inverseENUMatrix * czm_model * positionMC).xyz;
              }
            }
          `
        })
      }
    })
  }

  /**
   * tileset是否在面内
   * @param tileset
   * @private
   */
  private tilesetInPolygon(tileset: Tileset): boolean {
    const polygonRect = Rectangle.fromCartesianArray(this.positions)
    const tilesetRect = Rectangle.fromBoundingSphere(tileset.model.boundingSphere)
    return !!Rectangle.intersection(polygonRect, tilesetRect)
  }
}