// TODO 根据wfs数据的大小分段转换为Cesium可渲染的点线面坐标， 在worker中 进行诸如坐标转换等等功能

function requestWFS(url) {
	fetch(url).then(response => {
		console.log(response)
	})
}

const funcMap = {
	'load': requestWFS
}

self.onmessage = (event) => {
	funcMap[event.data.type](event.data.options)
}