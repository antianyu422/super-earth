import {Cartesian2} from 'cesium'

export default class Tip {
  private container: HTMLElement
  private tip: HTMLElement
  constructor(container: HTMLElement | string) {
    this.container = typeof container === 'string' ? document.getElementById(container) : container
    this.init()
  }

  private init(): void {
    this.tip = document.createElement('div')
    const style = document.createElement('style')
    document.head.appendChild(style)
    style.textContent = `
      .earth-tip {
        display: inline-block; 
        position: absolute;
        width: fit-content;
        top: 0;
        left: 0;
        font-size: 14px;
        color: #fff;
        padding: 10px
        border-radius: 4px;
        visibility: hidden;
        background-color: rgba(0, 0, 0, 1);
        cursor: none;
      }
    `

    this.tip.className = 'earth-tip'
    this.tip.style.position = 'absolute'
    this.container.appendChild(this.tip)
  }

  public show(position: Cartesian2, content: string): void {
    if (!this.tip) return
    const x = Math.round(position.x + 10)
    const y = Math.round(position.y - this.tip.offsetHeight / 2)
    this.tip.style.cssText = `
      transform: translate3d(${x}px, ${y}px, 0);
    `
    this.tip.innerHTML = content
    this.tip.style.visibility = 'visible'
  }

  public hide(): void {
    if (!this.tip) return
    this.tip.style.visibility = 'hidden'
  }

  public destroy(): void {
    if (!this.tip) return
    this.container.removeChild(this.tip)
    this.tip = undefined
  }
}