var spawn = require('cross-spawn-async')
  , WritableBuffer = require('stream-buffers').WritableStreamBuffer
  , fs = require('fs')
  , path = require('path')

try {
  fs.mkdirSync(__dirname+'/.temp')
}catch(e) {}

function pandoc(args) {
  return spawn('pandoc', args)
}

const features = {
  importTypes: {
    'text/markdown': 'markdown'
  , 'text/x-markdown': 'markdown'
  , 'application/x-latex': 'latex'
  , 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
  , 'application/vnd.oasis.opendocument.text': 'odt'
  , 'application/docbook+xml': 'docbook'
  , 'application/epub+zip': 'epub'
  }
, exportTypes: {
    'text/markdown': 'markdown'
  , 'text/x-markdown': 'markdown'
  , 'application/x-latex': 'latex'
  , 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
  , 'application/vnd.oasis.opendocument.text': 'odt'
  , 'application/docbook+xml': 'docbook'
  , 'application/epub+zip': 'epub'
  }
}

module.exports = setup
module.exports.consumes = ['importexport']
function setup(plugin, imports, register) {
  var ie = imports.importexport
  
  Object.keys(features.importTypes)
  .forEach(importType => {
    ie.registerImportProvider('text/html', importType, function*(document, user, data) {
      var tempFile = path.join(__dirname,'.temp', 'import-'+Math.random()+'.bin')
      yield function (cb) {
        fs.writeFile(tempFile, data, cb)
      }
      
      try {
        // convert input to html
        var buffer = yield function(cb) {
          var child = pandoc(['--from='+features.importTypes[importType], '--to=html', tempFile])
          child.on('error', cb)
          var bufferStream = new WritableBuffer()
          var errBufferStream = new WritableBuffer()
          child.stdout.pipe(bufferStream)
          child.on('exit', (code) => {
            if(code) {
              if(errBufferStream.getContents()) {
                return cb(new Error('Pandoc exited with '+code+':'+errBufferStream.getContents().toString('utf8')))
              }else{
                return cb(new Error('Pandoc exited with '+code))
              }
            }
            cb(null, bufferStream.getContents())
          })
          child.stderr.pipe(errBufferStream)
        }
      }catch(e) {
        fs.unlink(tempFile)
        throw e
      }
      
      fs.unlink(tempFile)

      // delegate to the html importer
      yield ie.import(document.id, user, 'text/html', buffer)
    })
  })
  
  Object.keys(features.exportTypes)
  .forEach(exportType => {
    ie.registerExportProvider('text/html', exportType, function* (document, snapshot) {
      // convert snapshot to html
      var html = yield ie.export(snapshot.id, 'text/html')
      
      var tempFile = path.join(__dirname,'.temp', 'export-'+Math.random()+'.bin')
      
      yield function(cb) {
        var child = pandoc(['--from=html', '--to='+features.exportTypes[exportType], '-o', tempFile])
        child.on('error', cb)
        var errBufferStream = new WritableBuffer()
        child.on('exit', (code) => {
          if(code) {
              if(errBufferStream.getContents()) {
                return cb(new Error('Pandoc exited with '+code+':'+errBufferStream.getContents().toString('utf8')))
              }else{
                return cb(new Error('Pandoc exited with '+code))
              }
            }
          cb()
        })
        child.stderr.pipe(errBufferStream)
        child.stdin.end(html)
      }
      
      var buffer = yield function(cb) {
        fs.readFile(tempFile, cb)
      }
      
      fs.unlink(tempFile)
      
      return buffer
    })
  })
  
  register()
}