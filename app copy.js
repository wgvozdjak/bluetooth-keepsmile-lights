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

function updateColorBox(r, g, b) {
  const colorBox = document.getElementById("colorBox");
  colorBox.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
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
  let lastUpdate = 0;
  const UPDATE_INTERVAL = 50;
  let lastDominantRange = null;
  let energyHistory = [];
  const ENERGY_HISTORY_SIZE = 20;

  // Define frequency ranges outside the update function
  const FREQUENCY_RANGES = {
    subBass: { 
      start: 0, 
      end: 3, 
      color: [148, 0, 211]  // Deep Purple
    },
    bass: { 
      start: 4, 
      end: 8, 
      color: [255, 0, 0]    // Red
    },
    lowMids: { 
      start: 9, 
      end: 15, 
      color: [255, 165, 0]  // Orange
    },
    mids: { 
      start: 16, 
      end: 30, 
      color: [0, 255, 0]    // Green
    },
    highMids: { 
      start: 31, 
      end: 50, 
      color: [0, 255, 255]  // Cyan
    },
    highs: { 
      start: 51, 
      end: 100, 
      color: [0, 0, 255]    // Blue
    }
  };
  
  async function startListening() {
    if (!isListening) {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (!audioContext) {
          throw new Error('AudioContext not supported');
        }

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.2;
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        isListening = true;
        updateColors();
      } catch (error) {
        insertLog('Error accessing microphone: ' + error);
        console.error('Microphone error:', error);
      }
    }
  }

  function updateColors() {
    if (!isListening || !analyser) return;

    const now = Date.now();
    if (now - lastUpdate < UPDATE_INTERVAL) {
      requestAnimationFrame(updateColors);
      return;
    }
    lastUpdate = now;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Calculate energy for each range
    const rangeEnergies = {};
    for (const [name, range] of Object.entries(FREQUENCY_RANGES)) {
      rangeEnergies[name] = averageRange(dataArray, range.start, range.end);
    }

    // Find dominant range
    let maxEnergy = 0;
    let dominantRange = null;
    for (const [name, energy] of Object.entries(rangeEnergies)) {
      if (energy > maxEnergy) {
        maxEnergy = energy;
        dominantRange = name;
      }
    }

    // Calculate total energy for beat detection
    const currentEnergy = Object.values(rangeEnergies).reduce((a, b) => a + b, 0);
    energyHistory.push(currentEnergy);
    if (energyHistory.length > ENERGY_HISTORY_SIZE) {
      energyHistory.shift();
    }

    // Beat detection
    const averageEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
    const energyVariance = Math.sqrt(
      energyHistory.reduce((a, b) => a + Math.pow(b - averageEnergy, 2), 0) / energyHistory.length
    );
    const isBeat = currentEnergy > averageEnergy + (energyVariance * 0.5);

    // Get base color from dominant range
    let [r, g, b] = FREQUENCY_RANGES[dominantRange]?.color || [255, 255, 255];

    // Find second strongest frequency for color blending
    let secondaryRange = null;
    let secondMaxEnergy = 0;
    for (const [name, energy] of Object.entries(rangeEnergies)) {
      if (name !== dominantRange && energy > secondMaxEnergy) {
        secondMaxEnergy = energy;
        secondaryRange = name;
      }
    }

    // Blend with secondary color if it's strong enough
    if (secondaryRange && secondMaxEnergy > maxEnergy * 0.6) {
      const [sr, sg, sb] = FREQUENCY_RANGES[secondaryRange].color;
      const blendRatio = secondMaxEnergy / maxEnergy * 0.3; // Max 30% influence
      r = Math.round(r * (1 - blendRatio) + sr * blendRatio);
      g = Math.round(g * (1 - blendRatio) + sg * blendRatio);
      b = Math.round(b * (1 - blendRatio) + sb * blendRatio);
    }

    // Dynamic brightness calculation
    let brightness;
    if (isBeat) {
      brightness = 100; // Full brightness on beats
    } else {
      // Calculate brightness based on energy level
      const normalizedEnergy = currentEnergy / (255 * Object.keys(FREQUENCY_RANGES).length);
      brightness = Math.round(40 + (normalizedEnergy * 60)); // Range from 40-100
    }

    // Ensure values are within bounds
    brightness = Math.max(40, Math.min(100, brightness));
    
    // Send the color command
    onButtonClick(getColorCommand(r, g, b, brightness));

    // Update the color box
    updateColorBox(r, g, b);

    // Store current dominant range for next comparison
    lastDominantRange = dominantRange;

    requestAnimationFrame(updateColors);
  }

  function averageRange(array, start, end) {
    let sum = 0;
    for (let i = start; i <= end && i < array.length; i++) {
      sum += array[i];
    }
    return sum / (end - start + 1);
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

var variables = `var retry = false; var CHARACTERISTIC_READ_UUID = "${CHARACTERISTIC_READ_UUID}";var CHARACTERISTIC_WRITE_UUID = "${CHARACTERISTIC_WRITE_UUID}";var CHARACTERISTIC_NOTIFY_UUID = "${CHARACTERISTIC_NOTIFY_UUID}"; var SERVICE_UUID = "${SERVICE_UUID}"; var LIGHTS_ON_STRING = "${LIGHTS_ON_STRING}";var LIGHTS_OFF_STRING = "${LIGHTS_OFF_STRING}"; var testingMode = ${testingMode}; ${updateColorBox.toString()};`;

var formHtml = "<form onsubmit=\"return false\">" +
  "<button id=\"lightsON\" style=\"width:50vw;height:5vh;margin-bottom:5vh;\" onclick=\"lightsOnClick()\">Lights ON</button>" +
  "<button id=\"lightsOFF\" style=\"width:50vw;height:5vh;\" onclick=\"lightsOffClick()\">Lights OFF</button>" +
  "<button id=\"lightsRED\" style=\"width:50vw;height:5vh;\" onclick=\"lightsRedClick()\">Lights RED</button>" +
  "<button id=\"lightsGradient\" style=\"width:50vw;height:5vh;\" onclick=\"lightsGradientClick()\">Lights Gradient</button>" +
  "<button id=\"lightsMusic\" style=\"width:50vw;height:5vh;\" onclick=\"lightsMusicClick()\">Listen to Music</button>" +
  "<button id=\"toggleTesting\" style=\"width:50vw;height:5vh;\" onclick=\"toggleTestingMode()\">Toggle Testing Mode</button>" + // Button to toggle testing mode
"</form>" +
"<div id=\"colorBox\" style=\"width: 100px; height: 100px; border: 1px solid black;\"></div>" + // Color box added
"<script>" + hexStr2Bytes.toString() + byteToUint8Array.toString() + variables + lightsOffClick.toString() + lightsOnClick.toString() + lightsRedClick.toString() + lightsGradientClick.toString() + lightsMusicClick.toString() + getColorCommand.toString() + getHex.toString() + onButtonClick.toString() + insertLog.toString() + "function toggleTestingMode() { testingMode = !testingMode; insertLog('Testing mode: ' + (testingMode ? 'ON' : 'OFF')); };" + eventListener.toString() + ";eventListener();</script>";

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
