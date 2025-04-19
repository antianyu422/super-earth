import {createGuid} from 'cesium'
import Earth from '../Earth.ts'

export default class Analysis {
  public id: string
  protected earth: Earth
  constructor() {
    this.id = createGuid()
  }

  public add(earth: Earth): void {
    this.earth = earth
  }

  public remove(): void {

  }
}