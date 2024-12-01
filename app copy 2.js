const express = require('express')
var bodyParser = require('body-parser')
const https = require('https');
const fs = require('fs');
const os = require('os');

var chromeUserDataDir = "/Users/elliott/Library/Application Support/Google/Chrome/Default";

var jsonParser = bodyParser.json()

require('chromedriver');
const webdriver = require('selenium-webdriver');
var chrome = require("selenium-webdriver/chrome");

const app = express()
const port = 3000

var key = fs.readFileSync(__dirname + '/selfsigned.key');
var cert = fs.readFileSync(__dirname + '/selfsigned.crt');
var options = {
  key: key,
  cert: cert
};

var SERVICE_UUID = "0000afd0-0000-1000-8000-00805f9b34fb";

var CHARACTERISTIC_READ_UUID = "0000afd3-0000-1000-8000-00805f9b34fb";
var CHARACTERISTIC_WRITE_UUID = "0000afd1-0000-1000-8000-00805f9b34fb";
var CHARACTERISTIC_NOTIFY_UUID = "0000afd2-0000-1000-8000-00805f9b34fb";

var LIGHTS_ON_STRING = "5BF000B5";
var LIGHTS_OFF_STRING = "5B0F00B5";

var testingMode = true; // New variable to toggle testing mode
var sensitivity = 1; // Default sensitivity value
var rSensitivity = 1; // Default red sensitivity value
var gSensitivity = 1; // Default green sensitivity value
var bSensitivity = 1; // Default blue sensitivity value
var colorPower = 1; // Default color power value

// Default frequency range values
var bassCenterFreq = 100;
var bassWidth = 300;
var midCenterFreq = 1000;
var midWidth = 2000;
var highCenterFreq = 4000;
var highWidth = 5000;

function updateColorBox(r, g, b) {
  const colorBox = document.getElementById("colorBox");
  colorBox.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  document.getElementById("redBox").style.backgroundColor = `rgb(${r}, 0, 0)`; // Update red box
  document.getElementById("greenBox").style.backgroundColor = `rgb(0, ${g}, 0)`; // Update green box
  document.getElementById("blueBox").style.backgroundColor = `rgb(0, 0, ${b})`; // Update blue box
}

function insertLog(msg){
  console.log(msg);
  document.getElementById("log").innerHTML += ("<p>" + msg + "</p>");
}

function byteToUint8Array(byteArray) {
  var uint8Array = new Uint8Array(byteArray.length);
  for(var i = 0; i < uint8Array.length; i++) {
      uint8Array[i] = byteArray[i];
  }

  return uint8Array;
}

function hexStr2Bytes(str) {
  var length = str.length / 2;
  var charArray = str.split('');
  var strArr = [];
  var bArr = [];
  var i = 0;
  for (var i2 = 0; i2 < length; i2++) {
    strArr[i2] = "" + charArray[i] + charArray[i + 1];
    bArr[i2] = parseInt(strArr[i2], 16);
    i += 2;
  }
  return bArr;
}

function getHex(number) {
  number = Math.round(number);
  var hex = number.toString(16);
  if (hex.length == 1) {
    hex = "0" + hex;
  }
  return hex.toUpperCase();
}

function getColorCommand(red, green, blue, brightness) {
  red = Math.min(255, Math.max(0, Math.round(red)));
  green = Math.min(255, Math.max(0, Math.round(green)));
  blue = Math.min(255, Math.max(0, Math.round(blue)));
  brightness = Math.min(100, Math.max(0, Math.round(brightness)));
  
  return "5A0001" + getHex(red) + getHex(green) + getHex(blue) + "00" + getHex(brightness) + "00A5";
}

function onButtonClick(command) {
  let filters = [];
  var timeout = false;
  try {
    timeout = document.getElementById("timeout").innerHTML == "true"
  } catch (error) {
    timeout = false;
  }

  document.getElementById("log").innerHTML = "";

  if (testingMode) {
    // In testing mode, simulate the command execution without connecting to a device
    insertLog('Testing mode: Command sent: ' + command);
    return;
  }

  function promptForDevice(){
    return new Promise(function (resolve, reject){
      let options = {
        filters: [
          {namePrefix: 'KS03'},
          {name: 'KS03~791C47'},
          {services: [SERVICE_UUID]}
        ],
        acceptAllDevices: false,
        optionalServices: [SERVICE_UUID]
      };
      console.log(navigator.bluetooth);

      navigator.bluetooth.requestDevice(options)
      .then(device => {
        insertLog('> Name:             ' + device.name);
        insertLog('> Id:               ' + device.id);
        resolve(device);
      }, reject).catch(reject);
      if (timeout) {
        setTimeout(function(){
          insertLog('Timeout');
          return resolve();
        }, 5000)
      }
    });
  }
  function connectDevice(d){
    return d.gatt.connect().then(server => {
      if (server != undefined) {
        write(server);
      } else {
        insertLog('No device found');
        insertLog(d)
      }
    }).catch(error => {
      if (error.toString().includes('NetworkError: Bluetooth Device is no longer in range')) {
        if (retry == false) {
          retry = true;
          setTimeout(function(){
            insertLog('Device permission failed, retrying...');

            if (command == LIGHTS_ON_STRING) {
              document.getElementById("lightsON").click();
            } else if (command == LIGHTS_OFF_STRING) {
              document.getElementById("lightsOFF").click();
            }

            return Promise.reject(error);
          }, 2000);
        } else {
          insertLog('Device permission failed, no retry.');
          return promptForDevice().then(function(d) {
            return connectDevice(d);
          });
        }
      } else {
        return Promise.reject(error);
      }
    });
  }

  var device;
  if (navigator.bluetooth.getDevices != undefined) {
    insertLog('getDevices found');
    device = navigator.bluetooth.getDevices().then(devices => {
      for(let device of devices) {
        if (device.name == 'KS03~430052') {
          insertLog('Device: ' + device.name);
          insertLog('Device id: ' + device.id);
          return Promise.resolve(device);
        }
      }
      insertLog('No saved device found, prompting for new device...');
      timeout = false;
      return promptForDevice();
    });
    device.then(function(d) {
      if (timeout) {
        promptForDevice().then(function() {
          connectDevice(d);
        });
      } else {
        connectDevice(d);
      }
    })
  } else {
    insertLog('getDevices not found');
  }
  function handleLightStatus(value) {
    if (value instanceof DataView) {
      // Convert DataView to an array of bytes
      const byteArray = new Uint8Array(value.buffer);
      insertLog('Received status bytes: ' + Array.from(byteArray).join(', '));
  
      // Example: Check the first byte to see if the light status is on or off
      if (byteArray[0] === 0x01) {
        insertLog('Light is ON');
        updateColorBox(255, 255, 255); // Example: Set color to white when ON
      } else if (byteArray[0] === 0x00) {
        insertLog('Light is OFF');
        updateColorBox(0, 0, 0); // Example: Set color to black when OFF
      } else {
        insertLog('Unknown light status');
      }
    } else {
      insertLog('Received unexpected value: ' + value);
    }
  }

  function write(server) {
    var onError = function(error) {
      insertLog('Internal! ' + error);
      // server.disconnect();  // Optional: Disconnect if there's an error
    };
  
    insertLog('> Connected:        ' + server.connected);
    insertLog('Getting Services...');
  
    server.getPrimaryService(SERVICE_UUID)
      .then(service => {
        insertLog('Found Service: ' + service.uuid);
        return service.getCharacteristics();
      })
      .then(characteristics => {
        insertLog('Characteristics found:');
        characteristics.forEach(characteristic => {
          insertLog('  ' + characteristic.uuid);
        });
  
        const writeCharacteristic = characteristics.find(c => c.uuid === CHARACTERISTIC_WRITE_UUID);
        if (!writeCharacteristic) {
          throw new Error('Write characteristic not found!');
        }
        insertLog('Found write characteristic: ' + writeCharacteristic.uuid);
  
        var bytecommand = byteToUint8Array(hexStr2Bytes(command));
        insertLog('Sending command: ' + bytecommand);
        return writeCharacteristic.writeValueWithoutResponse(bytecommand);
      })
      .then(() => {
        insertLog('Command sent: ' + command);
        return new Promise(resolve => setTimeout(resolve, 0));  // 500 ms delay
      })
      .catch(onError); 
  }
}

function lightsOnClick() {
  onButtonClick(LIGHTS_ON_STRING);
}

function lightsOffClick() {
  onButtonClick(LIGHTS_OFF_STRING);
}

function lightsRedClick() {
  onButtonClick(getColorCommand(255, 0, 0, 100));
}

function lightsGradientClick() {
let brightness = 100; // Set brightness level
let hue = 0; // Initialize hue

function cycleThroughHues() {
  // Convert hue to RGB
  const r = Math.round(Math.sin(hue + 0) * 127 + 128);
  const g = Math.round(Math.sin(hue + 2) * 127 + 128);
  const b = Math.round(Math.sin(hue + 4) * 127 + 128);
  
  // Send the color command
  onButtonClick(getColorCommand(r, g, b, brightness));
  
  // Update the color box
  updateColorBox(r, g, b);
  
  // Increment hue for the next color
  hue += 0.05; // Adjust the increment for speed of cycling
  
  // Call this function again after a delay
  setTimeout(cycleThroughHues, 150); // Change color every 500 ms
}

// Start the hue cycling
cycleThroughHues();

}

function lightsMusicClick() {
  let audioContext;
  let analyser;
  let microphone;
  let isListening = false;
  let lastColors = [0, 0, 0]; // Store last RGB values for smooth transitions

  async function startListening() {
    if (!isListening) {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (!audioContext) {
          throw new Error('AudioContext not supported');
        }

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // Increased for better frequency resolution
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        isListening = true;
        updateColorBasedOnMusic();
      } catch (error) {
        insertLog('Error accessing microphone: ' + error);
        console.error('Microphone error:', error);
      }
    }
  }

  function updateColorBasedOnMusic() {
    if (!isListening || !analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Define frequency ranges with overlap (in Hz)
    const frequencyRanges = {
      bass: { center: bassCenterFreq, width: bassWidth },
      mid: { center: midCenterFreq, width: midWidth },
      high: { center: highCenterFreq, width: highWidth }
    };

    // Helper function to calculate gaussian weight
    function gaussianWeight(freq, center, width) {
      return Math.exp(-Math.pow(freq - center, 2) / (2 * Math.pow(width, 2)));
    }

    // Calculate weighted energy across spectrum
    function getWeightedEnergy() {
      const sampleRate = audioContext.sampleRate;
      const binSize = sampleRate / analyser.fftSize;
      let bassEnergy = 0;
      let midEnergy = 0;
      let highEnergy = 0;
      let bassWeight = 0;
      let midWeight = 0;
      let highWeight = 0;

      for (let i = 0; i < bufferLength; i++) {
        const frequency = i * binSize;
        // Calculate weights for each frequency band
        const bWeight = gaussianWeight(frequency, frequencyRanges.bass.center, frequencyRanges.bass.width);
        const mWeight = gaussianWeight(frequency, frequencyRanges.mid.center, frequencyRanges.mid.width);
        const hWeight = gaussianWeight(frequency, frequencyRanges.high.center, frequencyRanges.high.width);

        // Accumulate weighted energies
        bassEnergy += dataArray[i] * bWeight;
        midEnergy += dataArray[i] * mWeight;
        highEnergy += dataArray[i] * hWeight;

        // Accumulate weights for normalization
        bassWeight += bWeight;
        midWeight += mWeight;
        highWeight += hWeight;
      }

      // Normalize the energies
      return {
        bass: bassWeight > 0 ? bassEnergy / bassWeight : 0,
        mid: midWeight > 0 ? midEnergy / midWeight : 0,
        high: highWeight > 0 ? highEnergy / highWeight : 0
      };
    }

    const energies = getWeightedEnergy();
    
    // Calculate total amplitude (sum of all energies)
    const totalAmplitude = energies.bass + energies.mid + energies.high;
    
    // Calculate relative proportions with power adjustment
    const bassRatio = Math.pow(energies.bass * rSensitivity, colorPower);
    const midRatio = Math.pow(energies.mid * gSensitivity, colorPower);
    const highRatio = Math.pow(energies.high * bSensitivity, colorPower);
    const totalRatio = bassRatio + midRatio + highRatio;

    // Calculate final colors maintaining total brightness but adjusted proportions
    const targetColors = [
      totalRatio > 0 ? Math.round((bassRatio / totalRatio) * totalAmplitude) : 0,
      totalRatio > 0 ? Math.round((midRatio / totalRatio) * totalAmplitude) : 0,
      totalRatio > 0 ? Math.round((highRatio / totalRatio) * totalAmplitude) : 0
    ];

    // Smooth the transition
    lastColors = lastColors.map((last, i) => {
      return Math.round(last * 0.8 + targetColors[i] * 0.2);
    });

    // Ensure values are within valid range
    const finalColors = lastColors.map(v => Math.min(255, Math.max(0, v)));

    // Update lights and color box
    onButtonClick(getColorCommand(finalColors[0], finalColors[1], finalColors[2], 100));
    updateColorBox(finalColors[0], finalColors[1], finalColors[2]);

    requestAnimationFrame(updateColorBasedOnMusic);
  }

  startListening();
}

function eventListener() {
  console.log('Adding event listener...');
  window.document.addEventListener('onadvertisementreceived', console.log);
  window.addEventListener('storage', console.log);
  window.addEventListener('load', console.log);
  window.addEventListener('open', console.log);
}

var variables = `var retry = false; var CHARACTERISTIC_READ_UUID = "${CHARACTERISTIC_READ_UUID}";var CHARACTERISTIC_WRITE_UUID = "${CHARACTERISTIC_WRITE_UUID}";var CHARACTERISTIC_NOTIFY_UUID = "${CHARACTERISTIC_NOTIFY_UUID}"; var SERVICE_UUID = "${SERVICE_UUID}"; var LIGHTS_ON_STRING = "${LIGHTS_ON_STRING}";var LIGHTS_OFF_STRING = "${LIGHTS_OFF_STRING}"; var testingMode = ${testingMode}; var sensitivity = ${sensitivity}; var rSensitivity = ${rSensitivity}; var gSensitivity = ${gSensitivity}; var bSensitivity = ${bSensitivity}; var colorPower = ${colorPower}; var bassCenterFreq = ${bassCenterFreq}; var bassWidth = ${bassWidth}; var midCenterFreq = ${midCenterFreq}; var midWidth = ${midWidth}; var highCenterFreq = ${highCenterFreq}; var highWidth = ${highWidth}; ${updateColorBox.toString()};`;

var formHtml = "<form onsubmit=\"return false\">" +
  "<button id=\"lightsON\" style=\"width:50vw;height:5vh;margin-bottom:5vh;\" onclick=\"lightsOnClick()\">Lights ON</button>" +
  "<button id=\"lightsOFF\" style=\"width:50vw;height:5vh;\" onclick=\"lightsOffClick()\">Lights OFF</button>" +
  "<button id=\"lightsRED\" style=\"width:50vw;height:5vh;\" onclick=\"lightsRedClick()\">Lights RED</button>" +
  "<button id=\"lightsGradient\" style=\"width:50vw;height:5vh;\" onclick=\"lightsGradientClick()\">Lights Gradient</button>" +
  "<button id=\"lightsMusic\" style=\"width:50vw;height:5vh;\" onclick=\"lightsMusicClick()\">Listen to Music</button>" +
  "<button id=\"toggleTesting\" style=\"width:50vw;height:5vh;\" onclick=\"toggleTestingMode()\">Toggle Testing Mode</button>" +
  "<div style='margin: 10px 0;'>" +
    "<label for='sensitivity'>Sound Sensitivity: <span id='sensitivityValue'>1</span></label>" +
    "<input type='range' id='sensitivity' min='0.25' max='4' value='1' step='0.05' onchange='updateSensitivity(this.value)'>" +
  "</div>" +
  "<div style='margin: 10px 0;'>" +
    "<label for='rSensitivity'>Red Sensitivity: <span id='rSensitivityValue'>1</span></label>" +
    "<input type='range' id='rSensitivity' min='0.25' max='4' value='1' step='0.05' onchange='updateRSensitivity(this.value)'>" +
  "</div>" +
  "<div style='margin: 10px 0;'>" +
    "<label for='gSensitivity'>Green Sensitivity: <span id='gSensitivityValue'>1</span></label>" +
    "<input type='range' id='gSensitivity' min='0.25' max='4' value='1' step='0.05' onchange='updateGSensitivity(this.value)'>" +
  "</div>" +
  "<div style='margin: 10px 0;'>" +
    "<label for='bSensitivity'>Blue Sensitivity: <span id='bSensitivityValue'>1</span></label>" +
    "<input type='range' id='bSensitivity' min='0.25' max='4' value='1' step='0.05' onchange='updateBSensitivity(this.value)'>" +
  "</div>" +
  "<div style='margin: 10px 0;'>" +
    "<label for='colorPower'>Color Power: <span id='colorPowerValue'>1</span></label>" +
    "<input type='range' id='colorPower' min='1' max='5' value='1' step='0.2' onchange='updateColorPower(this.value)'>" +
  "</div>" +
  "<div style='margin: 10px 0;'>" +
    "<label for='bassCenterFreq'>Bass Center Frequency: <span id='bassCenterFreqValue'>100</span> Hz</label>" +
    "<input type='range' id='bassCenterFreq' min='20' max='500' value='100' step='10' onchange='updateBassCenterFreq(this.value)'>" +
  "</div>" +
  "<div style='margin: 10px 0;'>" +
    "<label for='bassWidth'>Bass Width: <span id='bassWidthValue'>300</span> Hz</label>" +
    "<input type='range' id='bassWidth' min='50' max='1000' value='300' step='50' onchange='updateBassWidth(this.value)'>" +
  "</div>" +
  "<div style='margin: 10px 0;'>" +
    "<label for='midCenterFreq'>Mid Center Frequency: <span id='midCenterFreqValue'>1000</span> Hz</label>" +
    "<input type='range' id='midCenterFreq' min='200' max='2000' value='1000' step='100' onchange='updateMidCenterFreq(this.value)'>" +
  "</div>" +
  "<div style='margin: 10px 0;'>" +
    "<label for='midWidth'>Mid Width: <span id='midWidthValue'>2000</span> Hz</label>" +
    "<input type='range' id='midWidth' min='200' max='4000' value='2000' step='100' onchange='updateMidWidth(this.value)'>" +
  "</div>" +
  "<div style='margin: 10px 0;'>" +
    "<label for='highCenterFreq'>High Center Frequency: <span id='highCenterFreqValue'>4000</span> Hz</label>" +
    "<input type='range' id='highCenterFreq' min='1000' max='8000' value='4000' step='200' onchange='updateHighCenterFreq(this.value)'>" +
  "</div>" +
  "<div style='margin: 10px 0;'>" +
    "<label for='highWidth'>High Width: <span id='highWidthValue'>5000</span> Hz</label>" +
    "<input type='range' id='highWidth' min='400' max='10000' value='5000' step='200' onchange='updateHighWidth(this.value)'>" +
  "</div>" +
"</form>" +
"<div id=\"colorBox\" style=\"width: 100px; height: 100px; border: 1px solid black;\"></div>" +
"<div id=\"redBox\" style=\"width: 100px; height: 100px; border: 1px solid black;\"></div>" +
"<div id=\"greenBox\" style=\"width: 100px; height: 100px; border: 1px solid black;\"></div>" +
"<div id=\"blueBox\" style=\"width: 100px; height: 100px; border: 1px solid black;\"></div>" +
"<script>" + hexStr2Bytes.toString() + byteToUint8Array.toString() + variables + lightsOffClick.toString() + lightsOnClick.toString() + lightsRedClick.toString() + lightsGradientClick.toString() + lightsMusicClick.toString() + getColorCommand.toString() + getHex.toString() + onButtonClick.toString() + insertLog.toString() + 
"function toggleTestingMode() { testingMode = !testingMode; insertLog('Testing mode: ' + (testingMode ? 'ON' : 'OFF')); };" + 
"function updateSensitivity(value) { sensitivity = value; document.getElementById('sensitivityValue').textContent = value; insertLog('Sensitivity set to: ' + value); };" + 
"function updateRSensitivity(value) { rSensitivity = value; document.getElementById('rSensitivityValue').textContent = value; insertLog('Red Sensitivity set to: ' + value); };" + 
"function updateGSensitivity(value) { gSensitivity = value; document.getElementById('gSensitivityValue').textContent = value; insertLog('Green Sensitivity set to: ' + value); };" + 
"function updateBSensitivity(value) { bSensitivity = value; document.getElementById('bSensitivityValue').textContent = value; insertLog('Blue Sensitivity set to: ' + value); };" +
"function updateColorPower(value) { colorPower = Number(value); document.getElementById('colorPowerValue').textContent = value; insertLog('Color Power set to: ' + value); };" +
"function updateBassCenterFreq(value) { bassCenterFreq = Number(value); document.getElementById('bassCenterFreqValue').textContent = value; insertLog('Bass Center Frequency set to: ' + value + ' Hz'); };" +
"function updateBassWidth(value) { bassWidth = Number(value); document.getElementById('bassWidthValue').textContent = value; insertLog('Bass Width set to: ' + value + ' Hz'); };" +
"function updateMidCenterFreq(value) { midCenterFreq = Number(value); document.getElementById('midCenterFreqValue').textContent = value; insertLog('Mid Center Frequency set to: ' + value + ' Hz'); };" +
"function updateMidWidth(value) { midWidth = Number(value); document.getElementById('midWidthValue').textContent = value; insertLog('Mid Width set to: ' + value + ' Hz'); };" +
"function updateHighCenterFreq(value) { highCenterFreq = Number(value); document.getElementById('highCenterFreqValue').textContent = value; insertLog('High Center Frequency set to: ' + value + ' Hz'); };" +
"function updateHighWidth(value) { highWidth = Number(value); document.getElementById('highWidthValue').textContent = value; insertLog('High Width set to: ' + value + ' Hz'); };" +
eventListener.toString() + ";eventListener();</script>";

var outputHtml = "<div id=\"output\" class=\"output\">" +
  "<div id=\"content\"></div>" +
  "<div id=\"status\"></div>" +
  "<pre id=\"log\"></pre>" +
"</div>";

function openChrome(command) {
  var options = new chrome.Options();

  options.addArguments('--ignore-ssl-errors=yes');
  options.addArguments('--ignore-certificate-errors');

  options.addArguments("user-data-dir=" + chromeUserDataDir);

  var driver = new webdriver.Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  driver.get('https://localhost:3000');

  var query = driver.wait(webdriver.until.elementLocated(webdriver.By.id(command)));

  driver.executeScript("var timeout = document.createElement('div'); timeout.id = 'timeout'; timeout.innerHTML = 'true'; document.body.append(timeout);");

  query.click().then(function() {

    setTimeout(function() {
      driver.findElement(webdriver.By.id('log')).then(function(element) {
        element.getAttribute('innerHTML').then(function(text) {
          if(text.includes(command)) {
            driver.quit();
          }
        });
      });
    }, 10000);
  });
}

app.get('/', (req, res) => {
  res.send(formHtml + outputHtml);
});

app.post('/', jsonParser, (req, res) => {
  console.log('POST request received');
  console.log(req.body);
  openChrome(req.body.command);

  res.send("OK");
});

var server = https.createServer(options, app);

server.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
  //print hostname ip addresses
  console.log(Object.values(require('os').networkInterfaces()).reduce((r, list) => r.concat(list.reduce((rr, i) => rr.concat(i.family==='IPv4' && !i.internal && i.address || []), [])), []));
});
