import Earth from '../Earth.ts'
import {
  Camera,
  Framebuffer,
  DrawCommand,
  PrimitiveType,
  ShaderProgram,
  Geometry,
  GeometryAttribute,
  ComponentDatatype,
  VertexArray,
  BufferUsage,
  Scene
} from 'cesium'

/**
 * 虚拟相机
 */
export default class VirtualCamera {
  private earth: Earth
  private framebuffer: Framebuffer
  constructor() {
  }

  public add(earth: Earth): void {
    this.earth = earth
    this.framebuffer = earth.createFramebuffer()
  }

  public setCamera(camera: Camera): void {
    const command = this.createDrawCommand()
    const earth = this.earth
    const scene: Scene = earth.scene
    const context = earth.context
    const view = earth.view
    const passState = view.passState

    earth.executeGlobeAnd3DTileBySelf(camera, this.framebuffer, false)

    scene.postRender.addEventListener(() => {
      command.execute(context, passState)
      passState.framebuffer = this.framebuffer
      earth.clearFramebuffer()
    })
  }

  public remove(): void {
    this.framebuffer.destroy()
  }

  private createDrawCommand(): DrawCommand {
    const context = this.earth.context
    const viewportQuadAttributeLocations = {
      position: 0,
      textureCoordinates: 1,
    }
    const geometry = new Geometry({
      attributes: {
        position: new GeometryAttribute({
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 2,
          values: [0.6, 0.6, 1.0, 0.6, 1.0, 1.0, 0.6, 1.0],
        }),
        textureCoordinates: new GeometryAttribute({
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 2,
          values: [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0],
        }),
      } as any,
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      primitiveType: PrimitiveType.TRIANGLES,
    })
    return new DrawCommand({
      vertexArray: VertexArray.fromGeometry({
        context,
        geometry: geometry,
        attributeLocations: viewportQuadAttributeLocations,
        bufferUsage: BufferUsage.STATIC_DRAW,
        interleave: true,
      }),
      primitiveType: PrimitiveType.TRIANGLES,
      shaderProgram: ShaderProgram.fromCache({
        context,
        vertexShaderSource: `
          in vec4 position;
          in vec2 textureCoordinates;
          out vec2 v_textureCoordinates;
          void main() {
            gl_Position = position;
            v_textureCoordinates = textureCoordinates;
          }`,
        fragmentShaderSource: `
          in vec2 v_textureCoordinates;
          uniform sampler2D colorTexture;
          void main() {
            out_FragColor = texture(colorTexture, v_textureCoordinates);
          }
        `,
        attributeLocations: viewportQuadAttributeLocations
      }),
      uniformMap: {
        colorTexture: () => this.framebuffer.getColorTexture(0)
      }
    })
  }
}