import {Cartesian3, Cartographic} from 'cesium'

export function setPositionHeight(position: Cartesian3, height: number): Cartesian3 {
  const radian = Cartographic.fromCartesian(position)
  return Cartesian3.fromRadians(
    radian.longitude,
    radian.latitude,
    height
  )
}

export function addPositionHeight(position: Cartesian3, height: number): Cartesian3 {
  const radian = Cartographic.fromCartesian(position)
  return Cartesian3.fromRadians(
    radian.longitude,
    radian.latitude,
    radian.height + height
  )
}