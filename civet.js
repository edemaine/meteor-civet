const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')
const Module = require('module')
const { Meteor } = require('meteor/meteor')
const { Babel, BabelCompiler } = require('meteor/babel-compiler')
const { SourceMapConsumer, SourceMapGenerator } = require('source-map')
const { convertToOSPath } = Plugin

// Resolve peer NPM dependency relative to the app's package.json,
// which is generally assumed to be in the current working directory; see
// https://github.com/meteor/meteor/blob/devel/packages/babel-compiler/babel-compiler.js
const appRequire = createRequire(path.join(process.cwd(), 'package.json'))

// Returns { $error: errorObject } on failure.
// (This will break if the package has its own $error field.)
function peerRequire(name) {
  try {
    return appRequire(name)
  } catch (error) {
    // Meteor 2 uses an older Node.js that does not support modern JS syntax
    // used by Civet, such as `??=`. In this case, transpile with Babel.
    if (error instanceof SyntaxError) {
      let resolvedPath, transpiled
      try {
        resolvedPath = appRequire.resolve(name)
        const source = fs.readFileSync(resolvedPath, 'utf8')
        const babelOptions = Babel.getDefaultOptions({
          nodeMajorVersion: parseInt(process.versions.node, 10)
        })
        babelOptions.filename = resolvedPath
        babelOptions.sourceMaps = false
        transpiled = Babel.compile(source, babelOptions)
      } catch (error) {
        console.error(`
edemaine:civet failed to transpile ${name} with Babel:
${error.message}
`)
        return { $error: error }
      }
      try {
        // Build module from transpiled code
        const compiledModule = new Module(resolvedPath, module.parent)
        compiledModule.filename = resolvedPath
        compiledModule.paths = Module._nodeModulePaths(path.dirname(resolvedPath))
        if (require.cache) {
          require.cache[resolvedPath] = compiledModule
        } else if (Module._cache) {
          Module._cache[resolvedPath] = compiledModule
        }
        compiledModule._compile(transpiled.code, resolvedPath)
        return compiledModule.exports
      } catch (error) {
        console.error(`
edemaine:civet failed to load transpiled ${name}:
${error.message}
`)
        return { $error: error }
      }
    }

    console.error(`
edemaine:civet failed to load module ${name}:
${error.message}
`)
    return { $error: error }
  }
}

const civetName = '@danielx/civet'
let Civet = peerRequire(civetName), CivetConfig, CivetVersion
if (Civet.$error) {
  if (Civet.$error.code === "MODULE_NOT_FOUND") {
    console.error(
`ERROR: edemaine:civet is missing the peer NPM dependency ${civetName}
ERROR: Install it in your app via: meteor npm install --save-dev ${civetName}
ERROR: Then restart meteor
ERROR: (Meanwhile, .civet files will not compile.)
`)
    Civet = undefined
  }
} else {
  CivetConfig = peerRequire(`${civetName}/config`)
  if (CivetConfig.$error) CivetConfig = undefined

  try {
    const civetPackage = appRequire(`${civetName}/package.json`)
    CivetVersion = civetPackage.version
  } catch (error) {
    console.error(`
edemaine:civet failed to load version from ${civetName}/package.json:
${error.message}
`)
  }

  Plugin.registerCompiler({
    extensions: ['civet']
  }, () => {
    return new CachedCivetCompiler()
  })
}

// Based on Meteor's CoffeeScript compiler implementation:
// https://github.com/meteor/meteor/blob/devel/packages/non-core/coffeescript-compiler/coffeescript-compiler.js
// and CachedCoffeeScriptCompiler:
// https://github.com/meteor/meteor/blob/devel/packages/non-core/coffeescript/compile-coffeescript.js

class CachedCivetCompiler extends CachingCompiler {
  constructor() {
    super({
      compilerName: 'civet',
      defaultCacheSize: 1024 * 1024 * 10,
    })

    this.civetCompiler = new CivetCompiler()
  }

  getCacheKey(inputFile) {
    return [
      inputFile.getArch(),
      inputFile.getSourceHash(),
      inputFile.getDeclaredExports(),
      inputFile.getPathInPackage(),
      this.civetCompiler.getVersion(),
      this.civetCompiler.getBabelFeaturesCacheKey(),
      ...this.civetCompiler.getConfigCacheKey(inputFile),
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
    const babelFeatures = {
      runtime: false,
      ...(Meteor.babelFeatures || { react: true }),
    }

    this.babelFeaturesCacheKey = JSON.stringify(babelFeatures)
    this.babelCompiler = new BabelCompiler(babelFeatures, (babelOptions, inputFile) => {
      if (Meteor.modifyBabelConfig) {
        Meteor.modifyBabelConfig(babelOptions, inputFile)
      }
    })

    this.configCache = new Map()
  }

  getBabelFeaturesCacheKey() {
    return this.babelFeaturesCacheKey
  }

  getVersion() {
    return CivetVersion
  }

  outputFilePath(inputFile) {
    return inputFile.getPathInPackage()
  }

  async compileOneFile(inputFile) {
    const source = inputFile.getContentsAsString()

    const configEntry = this.getConfigEntry(inputFile)
    const configOptions = configEntry?.options
    const compileOptions = {
      ...configOptions,
      parseOptions: {
        // Allow comptime by default
        comptime: true,
        ...configOptions.parseOptions,
      },
      filename: inputFile.getDisplayPath(),
      outputFilename: '/' + this.outputFilePath(inputFile),
      sourceMap: true,
      js: true,
    }

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
        inputFile,
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
    this.babelCompiler.setDiskCacheDirectory(cacheDir)
  }

  renderSourceMap(sourceMap, inputFile, compileOptions) {
    if (!sourceMap) return null

    return sourceMap.json(
      inputFile.getDisplayPath(),
      compileOptions.outputFilename
    )
  }

  mergeSourceMaps(babelSourceMap, civetSourceMap, inputFile) {
    if (!babelSourceMap) return civetSourceMap
    if (!civetSourceMap) return babelSourceMap

    const normalizedBabelMap = {
      ...babelSourceMap,
      sources: [...babelSourceMap.sources],
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
      message: error?.message ? error.message : String(error)
    })
  }

  getConfigCacheKey(inputFile) {
    const configEntry = this.getConfigEntry(inputFile)
    if (!configEntry) return null
    return [
      configEntry.path,
      configEntry.hash,
    ]
  }

  getConfigEntry(inputFile) {
    const baseDir = this.getConfigBaseDir(inputFile)
    return this.configCache.get(baseDir)
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
      console.error(`
Error finding Civet config in ${baseDir}:
${error.message}
`)
      configEntry.error = error
    }

    if (configPath) {
      try {
        const configFile = inputFile.readAndWatchFileWithHash(configPath)
        configEntry.hash = configFile.hash
        configEntry.path = configPath
        configEntry.options = await CivetConfig.loadConfig(configPath)
      } catch (error) {
        console.error(`
Error loading Civet config ${configPath}:
${error.message}
`)
        configEntry.error = error
      }
    }

    this.configCache.set(baseDir, configEntry)
  }
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}
