const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const ORIGIN = process.env.TEST_ORIGIN
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'dist/preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  })
  await win.loadURL(ORIGIN + '/login')
  await new Promise((r) => setTimeout(r, 2500))
  try {
    const m = await win.webContents.executeJavaScript(
      'JSON.stringify({ k: typeof window.mimirDesktop, keys: window.mimirDesktop ? Object.keys(window.mimirDesktop) : null })',
    )
    console.log('AT_LOGIN=' + m)
  } catch (e) {
    console.log('ERR ' + e.message)
  }
  app.quit()
})
