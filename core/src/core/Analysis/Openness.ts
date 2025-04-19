import Analysis from './Analysis.ts'
import Earth from '../Earth.ts'
import {
  Camera, Cartesian3, Color,
  ColorGeometryInstanceAttribute,
  EllipsoidGeometry, Framebuffer,
  GeometryInstance, Math as CesiumMath,
  PerInstanceColorAppearance,
  PerspectiveFrustum, Primitive,
  Transforms, VertexFormat, Event,
  PrimitiveCollection, MaterialAppearance,
  Material, Cartographic
} from 'cesium'

/**
 * 开敞度分析
 * 使用六个自定义相机，相机分别指向上下(天地)东西南北
 * 每个相机下对比球形分析区域与地形和tileset的深度，得到六张表示可视/非可视区域的颜色纹理
 * EllipsoidGeometry的纹理坐标规则为: 假设球形中心坐标为坐标原点，则
 * 纹理坐标x值由x轴正方向经y轴正方向最后返回x轴正方向，0 -> 1线性分布
 * 纹理坐标y值由z轴负方向向z轴正方向， 0 -> 1 线性分布
 * 经过东北上矩阵变换后 x轴正方向指向东， y轴正方向指向北，z轴正方向指向上(天)
 * 以此确定各个自定义相机的姿态, 即heading pitch 两个值
 * 将相机远端距离设置为分析半径，减少非必要的绘制命令，不使用对数深度渲染(分析半径不会很大没必要用对数深度，会导致接近相机远端处的深度分布在很小的范围内)
 * 最后将得到的六张纹理的正确映射到球形上
 *
 * 存在的问题
 * 1、需要创建八个帧缓冲区，应该尽量复用
 * 2、glsl中只能使用字面量索引纹理数组，部分glsl代码很怪
 * 3、结果正确性取决于自定义相机的视角下地形和tileset能够正确渲染
 */
export default class Openness extends Analysis {
  private options = {
    center: undefined,
    visibleColor: '#00ff0066',
    hiddenColor: '#ff000066',
    radius: 100
  }
  private color: {
    visible: Color
    hidden: Color
  } = {
      visible: Color.fromCssColorString('#00ff0066'),
      hidden: Color.fromCssColorString('#ff000066')
    }
  private primitives = new PrimitiveCollection()
  private cameras: Camera[] = []
  private geometry: EllipsoidGeometry
  private renderBuffer: Framebuffer
  private geometryBuffer: Framebuffer
  private framebuffers: Framebuffer[] = []
  private removeEvent: Event.RemoveCallback

  /**
   * 添加分析到场景中
   * @param earth
   */
  public add(earth: Earth): void {
    super.add(earth)
    earth.primitives.add(this.primitives)
    for (let i = 0; i < 6; i++) {
      const camera = new Camera(this.earth.scene)
      camera.frustum = new PerspectiveFrustum({
        fov: CesiumMath.PI_OVER_TWO,
        aspectRatio: 1
      })
      this.cameras.push(camera)
      this.framebuffers.push(earth.createFramebuffer())
    }
    this.renderBuffer = earth.createFramebuffer()
    this.geometryBuffer = earth.createFramebuffer()
  }

  /**
   * 开始分析
   * @param options
   */
  public start(options: {
    center: Cartesian3
    visibleColor?: string
    hiddenColor?: string
    radius?: number
  }): void {
    Object.assign(this.options, options)
    const radianCenter = Cartographic.fromCartesian(this.options.center)
    this.options.center = Cartesian3.fromRadians(radianCenter.longitude, radianCenter.latitude, radianCenter.height + 1)
    this.analysis()
  }

  /**
   * 更新分析
   * @param options
   */
  public update(options: {
    center?: Cartesian3
    visibleColor?: string
    hiddenColor?: string
    radius?: number
  }) {
    for (const key in options) {
      if (options[key] !== undefined) this.options[key] = options[key]
    }
    if (!options.center && !options.radius) {
      this.updateColor()
    } else {
      this.analysis()
    }
  }

  /**
   * 清除分析
   */
  public clear(): void {
    this.primitives.removeAll()
  }

  /**
   * 从场景中移除分析
   * @param earth
   */
  public remove(): void {
    super.remove()
    if (this.removeEvent) this.removeEvent()
    this.geometryBuffer.destroy()
    this.renderBuffer.destroy()
    this.framebuffers.forEach(framebuffer => framebuffer.destroy())
    this.earth.primitives.remove(this.primitives)
  }

  public get center(): Cartesian3 {
    return this.options.center
  }

  public set center(value: Cartesian3) {
    this.options.center = value
    this.clear()
    this.analysis()
  }

  public get radius(): number {
    return this.options.radius
  }

  public set radius(value: number) {
    this.options.radius = value
    this.clear()
    this.analysis()
  }

  public get visibleColor(): string {
    return this.options.visibleColor
  }

  public set visibleColor(value: string) {
    this.options.visibleColor = value
    this.updateColor()
  }

  public get hiddenColor(): string {
    return this.options.hiddenColor
  }

  public set hiddenColor(value: string) {
    this.options.hiddenColor = value
    this.updateColor()
  }

  /**
   * 开始分析
   * @private
   */
  private analysis(): void {
    this.primitives.removeAll()
    this.createGeometry()
    this.computeCamera()
    this.computeTexture()
    this.addGeometry()
  }

  private updateColor(): void {
    this.color.visible = Color.fromCssColorString(this.options.visibleColor)
    this.color.hidden = Color.fromCssColorString(this.options.hiddenColor)
  }

  /**
   * 添加表示开敞度结果的球形到场景中
   * @private
   */
  private addGeometry(): void {
    const uniforms = {
      colorTextures: []
    }
    this.framebuffers.forEach(framebuffer => {
      uniforms.colorTextures.push(framebuffer.getColorTexture(0))
    })
    const primitive = this.primitives.add(new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: this.geometry,
        modelMatrix: Transforms.eastNorthUpToFixedFrame(this.options.center)
      }),
      appearance: new MaterialAppearance({
        material: new Material({
          fabric: {
            source: `
            uniform sampler2D colorTextures[6];
            
            czm_material czm_getMaterial(czm_materialInput materialInput) {
              czm_material material = czm_getDefaultMaterial(materialInput);
              vec4 color;
              // 设球形半径 = 1 球心为坐标原点
              
              // 纹理坐标转到球坐标系下
              // x方向上的弧度
              float phi = materialInput.st.x * 2.0 * czm_pi;
              // y方向上的弧度
              float theta = (1.0 - materialInput.st.y) * czm_pi;
              
              // 球坐标系转笛卡尔坐标系
              vec3 ballCartesian3 = vec3(
                0.5 * sin(theta) * cos(phi),
                0.5 * sin(theta) * sin(phi),
                0.5 * cos(theta)
              );
              vec3 normal = normalize(ballCartesian3);
              
              // x, y, z轴
              vec3[] axis = vec3[](
                vec3(0.5, 0.0, 0.0), vec3(0.0, 0.5, 0.0), vec3(0.0, 0.0, 0.5)
              );
              
              // 归一化后的x, y, z轴
              vec3[] axisNormal = vec3[](
                vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0) 
              );
             
              vec3[] normals = vec3[](
                normal, normal * vec3(-1.0, 1.0, 1.0), normal
              );
              // 用于索引vec3的两个分量
              ivec2[] index = ivec2[](ivec2(1, 2), ivec2(0, 2), ivec2(0, 1));
              // x y z轴正负方向纹理的索引 例如x 轴正方向纹理索引为 0 负方向为 0 + 2 
              ivec2[] textureIndex = ivec2[](ivec2(0, 2), ivec2(1, 2), ivec2(4, 1));
              
              // 判断点在x y z 轴的正负方向上
              // 即判断computeCamera求出的各个相机视锥的可视区域内
              // 目的是求出点在某视锥经过computeTexture方法得到的纹理对应点的纹理坐标
              for (int i = 0; i < 3; i++) {
                // 与x y z轴的角度的余弦值
                float cosAngle = dot(axisNormal[i], normals[i]);
                // 轴为三角形临边，求球心到视锥远端面的斜边
                vec3 s = 0.5 / cosAngle * normals[i];
                // 求对边，即相对于视锥远端中心的偏移
                vec3 b = s - axis[i];
                // x y z 轴三种情况下，需要使用的对边b的x y z分量不同，index
                vec2 st = vec2(b[index[i].x], b[index[i].y]) + vec2(0.5);
                // 判断在x y z轴的正负方向 oneOrZero = 1.0 | 0.0
                float oneOrZero = 1.0 - step(0.0, normal[i]);
                st.y = oneOrZero - (oneOrZero - 0.5) * 2.0 * st.y;
                if (st.x >= 0.0 && st.x <= 1.0 && st.y >= 0.0 && st.y <= 1.0) {
                  int index = textureIndex[i].x + textureIndex[i].y * int(oneOrZero);
                
                  // 纹理数组只能用字面量索引
                  if (index == 0) {
                    color = texture(colorTextures[0], st);
                  } else if (index == 1) {
                    color = texture(colorTextures[1], st);
                  } else if (index == 2) {
                    color = texture(colorTextures[2], st);
                  } else if (index == 3) {
                    color = texture(colorTextures[3], st);
                  } else if (index == 4) {
                    color = texture(colorTextures[4], st);
                  } else if (index == 5) {
                    color = texture(colorTextures[5], st);
                  }
                  
                  material.diffuse = color.rgb;
                  material.alpha = color.a;
                  break;
                }
              }
              
              return material;
            }
            `
          }
        })
      }),
      asynchronous: false
    }))
    primitive.appearance.uniforms = uniforms
  }

  /**
   * 生成球形geometry
   * @private
   */
  private createGeometry(): void {
    this.geometry = new EllipsoidGeometry({
      radii: Cartesian3.unpack(new Array(3).fill(this.options.radius)),
      vertexFormat: VertexFormat.POSITION_AND_ST
    })
  }

  /**
   * 计算生成开敞度纹理
   * @private
   */
  private computeTexture(): void {
    const earth = this.earth
    const scene = this.earth.scene
    const context = this.earth.scene.context
    const view = scene.view
    const passState = view.passState
    const frameState = scene.frameState
    const cameras = this.cameras

    const primitive: any = new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: this.geometry,
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.RED)
        },
        modelMatrix: Transforms.eastNorthUpToFixedFrame(this.options.center)
      }),
      appearance: new PerInstanceColorAppearance({
        translucent: false
      }),
      asynchronous: false
    })

    this.updateColor()
    this.removeEvent = scene.postRender.addEventListener(() => {
      frameState.commandList = []
      primitive.update(frameState)
      cameras.forEach((camera, index) => {
        passState.framebuffer = this.geometryBuffer
        earth.clearFramebuffer()
        context.uniformState.updateCamera(camera)
        frameState.commandList.forEach(command => {
          command.execute(context, passState)
        })
        earth.executeGlobeAnd3DTile(camera, this.renderBuffer, false)

        passState.framebuffer = this.framebuffers[index]
        earth.clearFramebuffer()
        context.createViewportQuadCommand(`
          in vec2 v_textureCoordinates;
          uniform sampler2D renderDepth;
          uniform sampler2D geometryDepth;
          uniform vec4 visibleColor;
          uniform vec4 hiddenColor;
         
          void main() {
            // 左右翻转，因为该纹理是由求内看向求外得到的，使用时相反
            vec2 st = vec2(1.0 - v_textureCoordinates.x, v_textureCoordinates.y);
            if (texture(renderDepth, st).r >= texture(geometryDepth, st).r) {
              out_FragColor = visibleColor;
            } else {
              out_FragColor = hiddenColor;
            }
          }
        `, {
          uniformMap: {
            renderDepth: () => this.renderBuffer.depthTexture,
            geometryDepth: () => this.geometryBuffer.depthTexture,
            visibleColor: () => this.color.visible,
            hiddenColor: () => this.color.hidden,
          }
        }).execute(context, passState)
      })
    })
  }

  /**
   * 计算覆盖球形区域的八个相机的姿态
   * @private
   */
  private computeCamera(): void {
    this.cameras.forEach((camera, index) => {
      if (index < 4) {
        camera.setView({
          destination: this.options.center,
          orientation: {
            heading: CesiumMath.PI_OVER_TWO * (index - 1) * -1,
            pitch: 0
          }
        })
      } else {
        camera.setView({
          destination: this.options.center,
          orientation: {
            heading: index === 4 ? CesiumMath.PI : 0,
            pitch: (index === 4 ? 1 : -1) * CesiumMath.PI_OVER_TWO
          }
        })
      }
      camera.frustum.far = this.options.radius
      camera.frustum.near = 1
    })
  }
}