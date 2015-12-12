var path = require('path')
var dragDrop = require('drag-and-drop-files')
var shell = require('shell')
var electron = require('electron')
var ipc = require('ipc')
var fs = require('fs')
var Ractive = require('ractive-toolkit')

var dialog = electron.remote.dialog
var Menu = electron.remote.Menu
var MenuItem = electron.remote.MenuItem

var Client = require('electron-rpc/client')
var client = new Client()
client.request('dats', function (dats) {
  console.log(dats)
  render(dats)
})

var IMG_PATH = path.join(__dirname, 'static', 'images')

function render (dats) {
  Ractive({
    el: '#container',
    template: fs.readFileSync(path.join(__dirname, './templates/list.html')).toString(),
    data: {dats: dats, IMG_PATH: IMG_PATH},
    onrender: function () {
      var self = this

      dragDrop(document.querySelector('#content'), function (files) {
        var file = files[0]
        dats.push(Dat({path: file.path}))
      })

      self.on('stop', function (event, i) {
        client.request('stop', {dat: dats[i]}, function (err, dat) {
          if (err) throw err
          dats[i] = dat
          console.log(dat)
          self.set('dats', dats)
        })
        event.original.preventDefault()
        event.original.stopPropagation()
      })

      self.on('share', function (event, i) {
        client.request('start', {dat: dats[i]}, function (err, dat) {
          if (err) return console.error(err)
          dats[i] = dat
          self.set('dats', dats)
          electron.clipboard.writeText(dat.link)
        })
        event.original.preventDefault()
        event.original.stopPropagation()
      })

      self.on('open', function (event, i) {
        var dat = dats[i]
        shell.openItem(dat.path)
        ipc.send('hide')
      })

      self.on('info', function (event, i) {
        var dat = dats[i]
        console.log(dat)
      })

      var contextMenu = new Menu()
      contextMenu.append(new MenuItem({ label: 'Copy link', click: function () { self.fire('share') } }))
      contextMenu.append(new MenuItem({ label: 'Publish new version', click: function () { self.fire('publish') } }))

      var rows = document.getElementsByClassName('row')
      for (var i = 0; i < rows.length; i++) {
        var item = rows[i]
        item.addEventListener('contextmenu', function (e) {
          e.preventDefault()
          contextMenu.popup(electron.remote.getCurrentWindow())
        })
      }
    }
  })

  Ractive({
    el: '#footer',
    template: fs.readFileSync(path.join(__dirname, './templates/footer.html')).toString(),
    data: {IMG_PATH: IMG_PATH},
    onrender: function () {
      var self = this
      var settings = new Menu()
      settings.append(new MenuItem({ label: 'Debug' }))
      settings.append(new MenuItem({ label: 'Stop sharing and quit', click: function () { ipc.send('terminate') } }))
      self.on('settings', function (event) {
        event.original.preventDefault()
        settings.popup(electron.remote.getCurrentWindow())
      })
      self.on('add', function (event) {
        var opts = { properties: [ 'openFile', 'openDirectory' ] }
        dialog.showOpenDialog(opts, function (files) {
          if (!files) return
          files.map(function (file) {
            var dat = Dat({path: file})
            dats[dat.path] = dat
            self.set('dats', dats)
            self.fire('share', dat.path)
          })
        })
      })
    }
  })
}

function throwError (error) {
  var message = error.stack || error.message || JSON.stringify(error)
  console.error(message)
  window.alert(message)
}

// Throw unhandled javascript errors
window.onerror = function errorHandler (message, url, lineNumber) {
  message = message + '\n' + url + ':' + lineNumber
  throwError(message)
}

function Dat (data) {
  if (!data.path) throw new Error('Path required.')
  return {
    name: data.name || path.basename(data.path),
    path: data.path,
    active: data.active || true,
    date: data.date || Date.now()
  }
}
