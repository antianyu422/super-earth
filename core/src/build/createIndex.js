import * as fs from 'node:fs'
import * as path from 'node:path'

const input = 'src/core/'
const output = 'src/core/index.ts'

const create = (dir) => {
    fs.readdirSync(dir).forEach(file => {
        const pathName = path.join(dir, file)
        if (fs.statSync(pathName).isDirectory()) {
            if (path.basename(pathName).startsWith('_')) return
            if (path.basename(pathName) === 'types') return
            create(pathName)
        } else {
            const basename = path.basename(pathName, '.ts')
            if (basename === 'index') return
            if (basename.includes('worker.js')) return
            if (basename === 'Utils') {
                return fs.appendFileSync(output, `export * from './${(path.relative('src/core', pathName).replaceAll(path.sep, '/')).replace('.ts', '')}'\n`, {})
            }
            fs.appendFileSync(output, `export { default as ${basename} } from './${(path.relative('src/core', pathName).replaceAll(path.sep, '/')).replace('.ts', '')}'\n`, {})
        }
    })
}

if (fs.existsSync(output)) {
    fs.writeFile(output, '', err => {
        if (err !== null) {
            console.warn(err)
        } else {
            fs.appendFileSync(output, "import * as Cesium from 'cesium'\n")
            fs.appendFileSync(output, "export { Cesium }\n")
            create(input)
        }
    })
} else {
    fs.appendFileSync(output, "import * as Cesium from 'cesium'\n")
    fs.appendFileSync(output, "export { Cesium }\n")
    create(input)
}