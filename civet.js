// Based on Meteor's CoffeeScript compiler implementation:
// https://github.com/meteor/meteor/blob/devel/packages/non-core/coffeescript-compiler/coffeescript-compiler.js
// and the compiler plugin registration pattern:
// https://github.com/meteor/meteor/blob/devel/packages/non-core/coffeescript/compile-coffeescript.js

const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')
const Module = require('module')
const { Babel, BabelCompiler } = require('meteor/babel-compiler')
const { SourceMapConsumer, SourceMapGenerator } = require('source-map')
const { convertToOSPath } = Plugin

// Resolve peer NPM dependency relative to the app's package.json,
// which is generally assumed to be in the current working directory; see
// https://github.com/meteor/meteor/blob/devel/packages/babel-compiler/babel-compiler.js
const appRequire = createRequire(path.join(process.cwd(), 'package.json'))

function peerRequire(name) {
  try {
    return { module: appRequire(name) }
  } catch (error) {
    // Meteor 2 uses an older Node.js that does not support modern JS syntax
    // used by Civet, such as `??=`. In this case, transpile with Babel.
    if (error instanceof SyntaxError) {
      try {
        const resolvedPath = appRequire.resolve(name)
        const source = fs.readFileSync(resolvedPath, 'utf8')
        const babelOptions = Babel.getDefaultOptions({
          nodeMajorVersion: parseInt(process.versions.node, 10)
        })
        babelOptions.filename = resolvedPath
        babelOptions.sourceMaps = false
        const compiled = Babel.compile(source, babelOptions)
        // Build module from transpiled code
        const compiledModule = new Module(resolvedPath, module.parent)
        compiledModule.filename = resolvedPath
        compiledModule.paths = Module._nodeModulePaths(path.dirname(resolvedPath))
        compiledModule._compile(compiled.code, resolvedPath)
        return { module: compiledModule.exports }
      } catch (transpileError) {
        return {
          error: `edemaine:civet failed to transpile ${name} with Babel: ${transpileError.message}`
        }
      }
    }

    if (name === civetName) {
      return {
        error: `${error.message}
ERROR: edemaine:civet is missing the peer NPM dependency ${civetName}
ERROR: Install it in your app via: meteor npm install --save-dev ${civetName}
ERROR: Then restart meteor
`
      }
    }

    return {
      error: `edemaine:civet failed to load ${name}: ${error.message}`
    }
  }
}

let Civet, CivetConfig, CivetError
const civetName = '@danielx/civet'

Plugin.registerCompiler({
  extensions: ['civet']
}, () => {
  ({module: Civet, error: CivetError} = peerRequire(civetName))

  if (Civet) {
    let error
    ({module: CivetConfig, error} = peerRequire(`${civetName}/config`))
    if (error) console.warn(`Failed to load ${civetName}/config: ${error}`)
  } else {
    console.error(CivetError)
  }

  return new CachedCivetCompiler()
})

class CachedCivetCompiler extends CachingCompiler {
  constructor(options = {}) {
    super({
      compilerName: 'civet',
      defaultCacheSize: 1024 * 1024 * 10
    })

    this.civetCompiler = new CivetCompiler(options)
  }

  getCacheKey(inputFile) {
    return [
      inputFile.getArch(),
      inputFile.getSourceHash(),
      inputFile.getDeclaredExports(),
      inputFile.getPathInPackage(),
      this.civetCompiler.getVersion(),
      this.civetCompiler.getConfigCacheKey(inputFile)
    ]
  }

  async processFilesForTarget(inputFiles) {
    await this.civetCompiler.updateConfigs(inputFiles)

    return super.processFilesForTarget(inputFiles)
  }

  compileOneFileLater(inputFile, getResult) {
    inputFile.addJavaScript({
      path: this.civetCompiler.outputFilePath(inputFile),
      sourcePath: inputFile.getPathInPackage(),
      bare: inputFile.getFileOptions().bare
    }, async () => {
      const result = await getResult()
      return result && {
        data: result.source,
        sourceMap: result.sourceMap,
      }
    })
  }

  compileOneFile(inputFile) {
    return this.civetCompiler.compileOneFile(inputFile)
  }

  setDiskCacheDirectory(cacheDir) {
    this.civetCompiler.setDiskCacheDirectory(cacheDir)
    return super.setDiskCacheDirectory(cacheDir)
  }

  addCompileResult(inputFile, sourceWithMap) {
    inputFile.addJavaScript({
      path: this.civetCompiler.outputFilePath(inputFile),
      sourcePath: inputFile.getPathInPackage(),
      data: sourceWithMap.source,
      sourceMap: sourceWithMap.sourceMap,
      bare: inputFile.getFileOptions().bare,
    })
  }

  compileResultSize(sourceWithMap) {
    return sourceWithMap.source.length +
      this.sourceMapSize(sourceWithMap.sourceMap)
  }
}

class CivetCompiler {
  constructor() {
    this.babelCompiler = new BabelCompiler({
      runtime: false,
      react: true
    })
    this.configCache = new Map()
  }

  getVersion() {
    return Civet?.version
  }

  outputFilePath(inputFile) {
    return inputFile.getPathInPackage()
  }

  getCompileOptions(inputFile) {
    const configOptions = this.getConfigOptions(inputFile)
    return {
      ...configOptions,
      parseOptions: configOptions.parseOptions
        ? { ...configOptions.parseOptions }
        : undefined,
      filename: inputFile.getDisplayPath(),
      outputFilename: '/' + this.outputFilePath(inputFile),
      sourceMap: true,
      js: true,
    }
  }

  async compileOneFile(inputFile) {
    if (CivetError) {
      inputFile.error({ message: CivetError })
      return null
    }

    const configError = this.getConfigError(inputFile)
    if (configError) {
      inputFile.error({ message: configError })
      return null
    }

    if (this.configError) {
      inputFile.error({ message: this.configError })
      return null
    }

    const source = inputFile.getContentsAsString()
    const compileOptions = this.getCompileOptions(inputFile)

    let output
    try {
      output = await Civet.compile(source, compileOptions)
    } catch (error) {
      this.reportCompileError(inputFile, error)
      return null
    }

    const civetSourceMap =
      this.renderSourceMap(output.sourceMap, inputFile, compileOptions)

    const babelResult = this.babelCompiler.processOneFileForTarget(
      inputFile,
      output.code,
    )

    if (babelResult && babelResult.data != null) {
      const mergedSourceMap = this.mergeSourceMaps(
        babelResult.sourceMap,
        civetSourceMap,
        inputFile
      )
      return {
        source: babelResult.data,
        sourceMap: mergedSourceMap
      }
    }

    return {
      source: output.code,
      sourceMap: civetSourceMap,
    }
  }

  setDiskCacheDirectory(cacheDir) {
    if (this.babelCompiler && this.babelCompiler.setDiskCacheDirectory) {
      this.babelCompiler.setDiskCacheDirectory(cacheDir)
    }
  }

  renderSourceMap(sourceMap, inputFile, compileOptions) {
    if (!sourceMap) {
      return null
    }

    return sourceMap.json(
      inputFile.getDisplayPath(),
      compileOptions.outputFilename
    )
  }

  mergeSourceMaps(babelSourceMap, civetSourceMap, inputFile) {
    if (!babelSourceMap) {
      return civetSourceMap
    }

    if (!civetSourceMap) {
      return babelSourceMap
    }

    const normalizedBabelMap = {
      ...babelSourceMap,
      sources: [...babelSourceMap.sources]
    }
    normalizedBabelMap.sources[0] = '/' + this.outputFilePath(inputFile)

    const sourceMapGenerator = SourceMapGenerator.fromSourceMap(
      new SourceMapConsumer(normalizedBabelMap)
    )
    sourceMapGenerator.applySourceMap(new SourceMapConsumer(civetSourceMap))
    return sourceMapGenerator.toJSON()
  }

  reportCompileError(inputFile, error) {
    if (Civet?.isCompileError?.(error)) {
      const firstError = Array.isArray(error.errors) ? error.errors[0] : error
      const line = toNumber(firstError.line)
      const column = toNumber(firstError.column)
      inputFile.error({
        message: firstError.message || firstError.header || 'Civet compile error',
        line,
        column,
      })
      return
    }

    inputFile.error({
      message: error && error.message ? error.message : String(error)
    })
  }

  getConfigCacheKey(inputFile) {
    const baseDir = this.getConfigBaseDir(inputFile)
    const configEntry = this.configCache.get(baseDir)
    return configEntry || null
  }

  getConfigOptions(inputFile) {
    const configEntry = this.getConfigEntry(inputFile)
    return configEntry.options || {}
  }

  getConfigError(inputFile) {
    const configEntry = this.getConfigEntry(inputFile)
    return configEntry.error
  }

  getConfigEntry(inputFile) {
    const baseDir = this.getConfigBaseDir(inputFile)
    return this.configCache.get(baseDir) || { options: {}, path: null, hash: null, error: null }
  }

  getConfigBaseDir(inputFile) {
    const packageJsonPath = inputFile.findControlFile('package.json')
    if (packageJsonPath) {
      return convertToOSPath(Plugin.path.dirname(packageJsonPath))
    }

    const sourceRoot = inputFile.getSourceRoot(true)
    if (sourceRoot) {
      const sourcePath = Plugin.path.join(
        sourceRoot,
        inputFile.getPathInPackage()
      )
      return convertToOSPath(Plugin.path.dirname(sourcePath))
    }

    return process.cwd()
  }

  async updateConfigs(inputFiles) {
    if (!CivetConfig || !CivetConfig.findInDir || !CivetConfig.loadConfig) return

    // Load config for each unique base directory
    const roots = new Set()
    for (const inputFile of inputFiles) {
      const baseDir = this.getConfigBaseDir(inputFile)
      if (!roots.has(baseDir)) {
        await this.updateConfig(baseDir, inputFile)
        roots.add(baseDir)
      }
    }
  }

  async updateConfig(baseDir, inputFile) {
    const configEntry = {
      options: {},
      path: null,
      hash: null,
      error: null,
    }

    let configPath
    try {
      configPath = await CivetConfig.findInDir(baseDir)
    } catch (error) {
      configEntry.error = `Error finding Civet config: ${error.message}`
      this.configCache.set(baseDir, configEntry)
      return
    }

    if (configPath) {
      try {
        const configFile = inputFile.readAndWatchFileWithHash(configPath)
        configEntry.hash = configFile.hash
        configEntry.path = configPath
        configEntry.options = await CivetConfig.loadConfig(configPath)
      } catch (error) {
        configEntry.error = `Error loading Civet config ${configPath}: ${error.message}`
      }
    }

    this.configCache.set(baseDir, configEntry)
  }
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}
