// Global variables
let retry = false;
let testingMode = false;
let sensitivity = 0.8;
let rSensitivity = 1.0;
let gSensitivity = 1.15;
let bSensitivity = 1.35;
let colorPower = 3.9;
let bassCenterFreq = 50;
let bassWidth = 25;
let midCenterFreq = 500;
let midWidth = 200;
let highCenterFreq = 1500;
let highWidth = 800;
let currentDevice = null; // Store the current Bluetooth device

// Constants
const SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb"; //"0000afd0-0000-1000-8000-00805f9b34fb";
const CHARACTERISTIC_READ_UUID = "0000fff3-0000-1000-8000-00805f9b34fb"; //"0000afd3-0000-1000-8000-00805f9b34fb";
const CHARACTERISTIC_WRITE_UUID = "0000fff3-0000-1000-8000-00805f9b34fb"; // "0000afd1-0000-1000-8000-00805f9b34fb";
const CHARACTERISTIC_NOTIFY_UUID = "0000fff3-0000-1000-8000-00805f9b34fb"; // "0000afd2-0000-1000-8000-00805f9b34fb";
const LIGHTS_ON_STRING = "7E0404F00101FF00EF"; // "5BF000B5";
const LIGHTS_OFF_STRING = "7E0404100100FF00EF"; // "5B0F00B5";

/**
 * Converts RGB values to a hexadecimal color string
 * @param {number} red - Red value (0-255)
 * @param {number} green - Green value (0-255)
 * @param {number} blue - Blue value (0-255)
 * @returns {string} Hex color string (e.g. "#ff0000")
 */
function toHexEncoding(red, green, blue) {
  let hexString = red.toString(16);
  let hexString2 = green.toString(16);
  let hexString3 = blue.toString(16);

  if (hexString.length === 1) {
    hexString = "0" + hexString;
  }
  if (hexString2.length === 1) {
    hexString2 = "0" + hexString2;
  }
  if (hexString3.length === 1) {
    hexString3 = "0" + hexString3;
  }

  return "#" + hexString + hexString2 + hexString3;
}

// Utility functions
function updateColorBox(r, g, b) {
  const colorBox = document.getElementById("colorBox");
  colorBox.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  document.getElementById("redBox").style.backgroundColor = `rgb(${r}, 0, 0)`;
  document.getElementById("greenBox").style.backgroundColor = `rgb(0, ${g}, 0)`;
  document.getElementById("blueBox").style.backgroundColor = `rgb(0, 0, ${b})`;
}

function insertLog(msg) {
  console.log(msg);
  const logElement = document.getElementById("log");
  logElement.innerHTML += `<p>${msg}</p>`;
  logElement.scrollTop = logElement.scrollHeight;
}

function byteToUint8Array(byteArray) {
  var uint8Array = new Uint8Array(byteArray.length);
  for (var i = 0; i < uint8Array.length; i++) {
    uint8Array[i] = byteArray[i];
  }
  return uint8Array;
}

function hexStr2Bytes(str) {
  var length = str.length / 2;
  var charArray = str.split("");
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

  return "7E070503" + toHexEncoding(red, green, blue).replace("#", "") + "00EF";
}

// Bluetooth functions
async function onButtonClick(command) {
  document.getElementById("log").innerHTML = "";

  if (testingMode) {
    insertLog("Testing mode: Command sent: " + command);
    return;
  }

  try {
    if (!currentDevice) {
      currentDevice = await requestDevice();
    }
    if (currentDevice) {
      await connectAndWrite(currentDevice, command);
    } else {
      insertLog("No device found");
    }
  } catch (error) {
    handleBluetoothError(error);
  }
}

async function requestDevice() {
  const options = {
    filters: [
      { namePrefix: "KS03" },
      { name: "KS03-791C47" },
      { services: [SERVICE_UUID] },
    ],
    acceptAllDevices: false,
    optionalServices: [SERVICE_UUID],
  };

  try {
    const device = await navigator.bluetooth.requestDevice(options);
    device.addEventListener("gattserverdisconnected", handleDisconnection);
    insertLog("> Name: " + device.name);
    insertLog("> Id: " + device.id);
    return device;
  } catch (error) {
    throw error;
  }
}

function handleDisconnection() {
  insertLog("Device disconnected");
  currentDevice = null; // Clear the current device when disconnected
}

async function connectAndWrite(device, command) {
  try {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const characteristic = await service.getCharacteristic(
      CHARACTERISTIC_WRITE_UUID
    );
    const bytes = hexStr2Bytes(command);
    console.log("----------------", command);
    await characteristic.writeValue(byteToUint8Array(bytes));
    insertLog("Command sent successfully");
  } catch (error) {
    throw error;
  }
}

function handleBluetoothError(error) {
  if (
    error
      .toString()
      .includes("NetworkError: Bluetooth Device is no longer in range")
  ) {
    if (!retry) {
      retry = true;
      insertLog("Device permission failed, retrying...");
      setTimeout(() => {
        if (command === LIGHTS_ON_STRING) {
          document.getElementById("lightsON").click();
        } else if (command === LIGHTS_OFF_STRING) {
          document.getElementById("lightsOFF").click();
        }
      }, 2000);
    } else {
      insertLog("Device permission failed, no retry.");
    }
  } else {
    insertLog("Error: " + error);
  }
}

// Chart initialization
let combinedChart;

function initializeChart() {
  const ctx = document.getElementById("combinedChart").getContext("2d");
  const maxDataPoints = 200; // Increased from 50 to 200 for longer history

  combinedChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: Array(maxDataPoints).fill(""),
      datasets: [
        {
          label: "Bass",
          data: Array(maxDataPoints).fill(0),
          borderColor: "rgb(255, 0, 0)",
          tension: 0.4,
          fill: false,
        },
        {
          label: "Mid",
          data: Array(maxDataPoints).fill(0),
          borderColor: "rgb(0, 255, 0)",
          tension: 0.4,
          fill: false,
        },
        {
          label: "High",
          data: Array(maxDataPoints).fill(0),
          borderColor: "rgb(0, 0, 255)",
          tension: 0.4,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 255, // Changed to match RGB max value
          ticks: {
            stepSize: 25, // Smaller steps for better granularity
          },
          grid: {
            color: "rgba(0, 0, 0, 0.1)", // Lighter grid lines
          },
        },
        x: {
          grid: {
            display: false, // Hide x-axis grid for cleaner look
          },
        },
      },
      elements: {
        point: {
          radius: 0, // Hide points for better performance
        },
      },
    },
  });
}

function updateCharts(bass, mid, high) {
  combinedChart.data.datasets[0].data.push(bass);
  combinedChart.data.datasets[0].data.shift();
  combinedChart.data.datasets[1].data.push(mid);
  combinedChart.data.datasets[1].data.shift();
  combinedChart.data.datasets[2].data.push(high);
  combinedChart.data.datasets[2].data.shift();
  combinedChart.update();
}

// Music and gradient mode functions
function startGradientMode() {
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
    setTimeout(cycleThroughHues, 150); // Change color every 150 ms
  }

  // Start the hue cycling
  cycleThroughHues();
}

function lightsMusicClick(inputType = "microphone") {
  let audioContext;
  let analyser;
  let audioSource;
  let isListening = false;
  let lastColors = [0, 0, 0]; // Store last RGB values for smooth transitions

  async function startListening() {
    if (!isListening) {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (!audioContext) {
          throw new Error("AudioContext not supported");
        }

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // Increased for better frequency resolution

        if (inputType === "microphone") {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          audioSource = audioContext.createMediaStreamSource(stream);
        } else if (inputType === "computer") {
          try {
            // First, show a helpful message
            insertLog(
              "Please select a window/tab and enable 'Share system audio' in the dialog"
            );

            const stream = await navigator.mediaDevices.getDisplayMedia({
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              },
              video: {
                width: 1,
                height: 1,
              },
            });

            // Check if we got an audio track
            const audioTrack = stream.getAudioTracks()[0];
            if (!audioTrack) {
              throw new Error(
                "No audio track available - did you enable 'Share system audio'?"
              );
            }

            audioSource = audioContext.createMediaStreamSource(stream);

            // Stop any video track since we don't need it
            stream.getVideoTracks().forEach((track) => track.stop());
          } catch (err) {
            insertLog("Failed to capture system audio. Error: " + err.message);
            throw err;
          }
        }

        audioSource.connect(analyser);
        isListening = true;
        updateColorBasedOnMusic();
      } catch (error) {
        insertLog("Error accessing audio: " + error);
        console.error("Audio error:", error);
      }
    }
  }

  /**
   * Updates the color of the lights based on the current music input.
   * This function analyzes the audio spectrum, calculates energy in different frequency bands,
   * and maps these energies to RGB color values.
   */
  function updateColorBasedOnMusic() {
    if (!isListening || !analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Define frequency ranges with overlap (in Hz)
    const frequencyRanges = {
      bass: { center: bassCenterFreq, width: bassWidth },
      mid: { center: midCenterFreq, width: midWidth },
      high: { center: highCenterFreq, width: highWidth },
    };

    /**
     * Calculates the exponential Gaussian weight for a given frequency.
     * @param {number} freq - The frequency to calculate the weight for.
     * @param {number} center - The center frequency of the band.
     * @param {number} width - The width of the frequency band (proportional to center).
     * @returns {number} The calculated exponential Gaussian weight.
     */
    function gaussianWeight(freq, center, width) {
      const sigma = width / center;
      const normalizationFactor = 1 / (sigma * Math.sqrt(2 * Math.PI));
      return (
        normalizationFactor *
        Math.exp(
          -Math.pow(Math.log(freq / center), 2) / (2 * Math.pow(sigma, 2))
        )
      );
    }

    /**
     * Calculates the weighted energy across the audio spectrum.
     * Uses a Gaussian weighting function to emphasize frequencies near the center of each band.
     * @returns {Object} An object containing the normalized energy for bass, mid, and high frequency bands.
     */
    function getWeightedEnergy() {
      const sampleRate = audioContext.sampleRate;
      const binSize = sampleRate / analyser.fftSize;
      let bassEnergy = 0,
        midEnergy = 0,
        highEnergy = 0;
      let bassWeight = 0,
        midWeight = 0,
        highWeight = 0;

      for (let i = 0; i < bufferLength; i++) {
        const frequency = i * binSize;
        // Calculate weights for each frequency band
        const bWeight = gaussianWeight(
          frequency,
          frequencyRanges.bass.center,
          frequencyRanges.bass.width
        );
        const mWeight = gaussianWeight(
          frequency,
          frequencyRanges.mid.center,
          frequencyRanges.mid.width
        );
        const hWeight = gaussianWeight(
          frequency,
          frequencyRanges.high.center,
          frequencyRanges.high.width
        );

        // Accumulate weighted energies and weights
        bassEnergy += dataArray[i] * bWeight;
        midEnergy += dataArray[i] * mWeight;
        highEnergy += dataArray[i] * hWeight;
        bassWeight += bWeight;
        midWeight += mWeight;
        highWeight += hWeight;
      }

      // Normalize the energies
      return {
        bass: bassWeight > 0 ? bassEnergy / bassWeight : 0,
        mid: midWeight > 0 ? midEnergy / midWeight : 0,
        high: highWeight > 0 ? highEnergy / highWeight : 0,
      };
    }

    const energies = getWeightedEnergy();

    // Calculate total amplitude (sum of all energies) and apply sensitivity
    const totalAmplitude =
      (energies.bass + energies.mid + energies.high) * sensitivity;

    // Calculate relative proportions with power adjustment
    const bassRatio = Math.pow(energies.bass * rSensitivity, colorPower);
    const midRatio = Math.pow(energies.mid * gSensitivity, colorPower);
    const highRatio = Math.pow(energies.high * bSensitivity, colorPower);
    const totalRatio = bassRatio + midRatio + highRatio;

    // Calculate final colors maintaining total brightness but adjusted proportions
    const targetColors = [
      totalRatio > 0
        ? Math.round((bassRatio / totalRatio) * totalAmplitude)
        : 0,
      totalRatio > 0 ? Math.round((midRatio / totalRatio) * totalAmplitude) : 0,
      totalRatio > 0
        ? Math.round((highRatio / totalRatio) * totalAmplitude)
        : 0,
    ];

    // Smooth the transition using exponential moving average
    lastColors = lastColors.map((last, i) =>
      Math.round(last * 0.83 + targetColors[i] * 0.17)
    );

    // Ensure values are within valid range (0-255)
    const finalColors = lastColors.map((v) => Math.min(255, Math.max(0, v)));

    // Update lights, color box, and charts
    onButtonClick(
      getColorCommand(finalColors[0], finalColors[1], finalColors[2], 100)
    );
    updateColorBox(finalColors[0], finalColors[1], finalColors[2]);
    updateCharts(finalColors[0], finalColors[1], finalColors[2]);

    // Continue updating if still listening
    if (isListening) {
      requestAnimationFrame(updateColorBasedOnMusic);
    }
  }

  // Start the audio processing
  startListening();
}

function handleRgbColorInput() {
  const r = parseInt(document.getElementById("redInput").value) || 0;
  const g = parseInt(document.getElementById("greenInput").value) || 0;
  const b = parseInt(document.getElementById("blueInput").value) || 0;

  // Ensure values are within valid range
  const red = Math.min(255, Math.max(0, r));
  const green = Math.min(255, Math.max(0, g));
  const blue = Math.min(255, Math.max(0, b));

  onButtonClick(getColorCommand(red, green, blue, 100));
  updateColorBox(red, green, blue);
}

// Event listeners
document
  .getElementById("lightsON")
  .addEventListener("click", () => onButtonClick(LIGHTS_ON_STRING));
document
  .getElementById("lightsOFF")
  .addEventListener("click", () => onButtonClick(LIGHTS_OFF_STRING));
document
  .getElementById("lightsComputerMode")
  .addEventListener("click", () => lightsMusicClick("computer"));
document
  .getElementById("lightsGradient")
  .addEventListener("click", startGradientMode);
document
  .getElementById("lightsMicMode")
  .addEventListener("click", () => lightsMusicClick("microphone"));
document
  .getElementById("setRgbColor")
  .addEventListener("click", handleRgbColorInput);

// Add input validation
const rgbInputs = ["redInput", "greenInput", "blueInput"];
rgbInputs.forEach((id) => {
  document.getElementById(id).addEventListener("input", (e) => {
    let value = parseInt(e.target.value);
    if (value > 255) e.target.value = 255;
    if (value < 0) e.target.value = 0;
  });
});

// Settings update functions
function toggleTestingMode() {
  testingMode = !testingMode;
  const statusElement = document.getElementById("testingModeStatus");
  statusElement.textContent = testingMode ? "ON" : "OFF";
  insertLog("Testing mode: " + (testingMode ? "ON" : "OFF"));
}

function updateSensitivity(value) {
  sensitivity = parseFloat(value);
  document.getElementById("sensitivityValue").textContent = value;
  insertLog("Sensitivity set to: " + value);
}

function updateRSensitivity(value) {
  rSensitivity = parseFloat(value);
  document.getElementById("rSensitivityValue").textContent = value;
  insertLog("Red Sensitivity set to: " + value);
}

function updateGSensitivity(value) {
  gSensitivity = parseFloat(value);
  document.getElementById("gSensitivityValue").textContent = value;
  insertLog("Green Sensitivity set to: " + value);
}

function updateBSensitivity(value) {
  bSensitivity = parseFloat(value);
  document.getElementById("bSensitivityValue").textContent = value;
  insertLog("Blue Sensitivity set to: " + value);
}

function updateBassCenter(value) {
  bassCenterFreq = parseInt(value);
  document.getElementById("bassCenterValue").textContent = value;
  insertLog("Bass Center Frequency set to: " + value + "Hz");
}

function updateMidCenter(value) {
  midCenterFreq = parseInt(value);
  document.getElementById("midCenterValue").textContent = value;
  insertLog("Mid Center Frequency set to: " + value + "Hz");
}

function updateHighCenter(value) {
  highCenterFreq = parseInt(value);
  document.getElementById("highCenterValue").textContent = value;
  insertLog("High Center Frequency set to: " + value + "Hz");
}

function updateColorPower(value) {
  colorPower = parseFloat(value);
  document.getElementById("colorPowerValue").textContent = value;
}

function updateBassWidth(value) {
  bassWidth = parseFloat(value);
  document.getElementById("bassWidthValue").textContent = value;
}

function updateMidWidth(value) {
  midWidth = parseFloat(value);
  document.getElementById("midWidthValue").textContent = value;
}

function updateHighWidth(value) {
  highWidth = parseFloat(value);
  document.getElementById("highWidthValue").textContent = value;
}

// Initialize chart when the page loads
initializeChart();
