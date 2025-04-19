import Layer from './Layer.ts'
import Earth from '../Earth.ts'

export default class WFS extends Layer {
  public options: {
    url: string
  }
  constructor(options: {
    url: string
  }) {
    super()
    this.options = options
  }

  public add(earth: Earth): Promise<WFS> {
    const worker = new Worker(new URL('../Worker/wfs.worker.js', import.meta.url), {
      type: 'module'
    })
    worker.postMessage({
      type: 'load',
      url: this.options
    })
    return new Promise((resolve, reject) => {

    })
  }

  public remove(): void {

  }
}