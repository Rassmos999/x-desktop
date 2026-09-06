
const { app } = require('electron');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-sandbox');

console.log('==> Testing X Desktop Electron runtime...');
console.log('Electron Version:', process.versions.electron);
console.log('Chrome Version:', process.versions.chrome);
console.log('Node Version:', process.versions.node);

app.whenReady().then(async () => {
  console.log('✅ Electron app.whenReady fired successfully.');
  console.log('✅ X Desktop Electron runtime test passed.');
  app.quit();
});

