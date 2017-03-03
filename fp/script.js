var map;
var gasDataUrl = 'fp/gasdata.csv';
var gasData;
var curFrame;
var isPlaying;
var colorMap;

var audioContext;
var freqMap;
var stateTones = {};
var masterGain;

function setup(containerName) {
	//Build map
	map = new Datamap({
        element: document.getElementById(containerName),
        scope: 'usa',
		geographyConfig: {
			highlightOnHover: false
		},
		done: function(datamap) {
			datamap.svg.selectAll('.datamaps-subunit').on('click', onStateClick);
		}
	});
	
	//Build color scaler
	colorMap = d3.scale.linear()
		.domain([0.25, 1.25, 2.25, 3.25, 4.25])
		.range(["blue", "green", "yellow", "orange", "red"]);
		
	//Build audio context
	if (typeof AudioContext !== "undefined") {
		audioContext = new AudioContext();
	} else if (typeof webkitAudioContext !== "undefined") {
		audioContext = new webkitAudioContext();
	} else {
		throw new Error('AudioContext not supported. :(');
	}
	
	//Build frequency scaler
	freqMap = d3.scale.linear()
		.domain([0.4, 4.4])
		.range([100, 1000]);
	
	//Set initial index into data (over time)
	curFrame = 0;
	isPlaying = false;
	
	//Grab data from CSV
	d3.csv(gasDataUrl).get(
		function(error, rows) {
			gasData = rows;
			updateColors();
			initStateTones();
		}
	);
}

function initStateTones() {
	stateTones = {};
	masterGain = audioContext.createGain();
	masterGain.connect(audioContext.destination);
	masterGain.gain.value = 0;
	$.each(gasData[0], function(key, value) {
		//No tones for month/year
		if(key == 'Month' || key == 'Year')
			return;
		
		//Build object
		stateTones[key] = {
			sine: audioContext.createOscillator(),
			gain: audioContext.createGain(),
			isOn: false
		};
		
		//Init freq/gain
		stateTones[key].gain.gain.value = 0;
		stateTones[key].sine.type = "triangle";
		var freq = freqMap(parseFloat(gasData[curFrame][key]));
		stateTones[key].sine.frequency.value = freq;
		
		//Connect oscillators
		stateTones[key].sine.connect(stateTones[key].gain);
		stateTones[key].gain.connect(masterGain);
		
		//Start US as on
		if(key == 'US') {
			stateTones[key].isOn = true;
			stateTones[key].gain.gain.value = 0.1;
		}
		
		//Start oscillators
		stateTones[key].sine.start();
	});
}

//Called when the play button is clicked: plays through the whole thing from the beginning
var intervalId;
function play() {
	if(!isPlaying) {
		if(curFrame >= gasData.length - 1)
			reset();
		isPlaying = true;
		$("#btnPlay").html('Pause');
		audioOn();
		intervalId = setInterval(function() {
			if(curFrame >= gasData.length) {
				curFrame-=2;
				pause();
			}
			updateColors();
			updateAudio();
			curFrame++;
		}, 250);
	}
	else {
		pause();
	}
}

function pause() {
	isPlaying = false;
	$("#btnPlay").html('Play');
	clearInterval(intervalId);
	audioOff();
}

function reset() {
	if(isPlaying)
		pause();
	curFrame = 0;
	updateColors();
	updateAudio();
}

function audioOn() {
	$.each(stateTones, function(key, value) {
		if(value.isOn) {
			var freq = freqMap(parseFloat(gasData[curFrame][key]));
			value.sine.frequency.value = freq;
			masterGain.gain.setValueAtTime(0, audioContext.currentTime);
			masterGain.gain.linearRampToValueAtTime(1, audioContext.currentTime + 0.25);
		}
	});
}

function audioOff() {
	$.each(stateTones, function(key, value) {
		masterGain.gain.setValueAtTime(1.0, audioContext.currentTime);
		masterGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.25);
		//window.setTimeout(function() {
		//	stateTones[key].sine.stop();
		//}, 250);
	});
}

function numOn() {
	var result = 0;
	$.each(stateTones, function(key, value) {
		if(value.isOn)
			result++;
	});
	return result;
}

function updateColors() {
	var data = gasData[curFrame];
	var colorData = {};
	$.each(data, function(key, value) {
		if(key == 'US') {
			$("#spanPrice").text('$' + parseFloat(value).toFixed(3));
		} 
		else if(key == 'Month') {
			var formatter = d3.time.format("%B");
			$("#spanMonth").text(formatter(new Date(2000, value - 1, 1)));
		}
		else if(key == 'Year') {
			$("#spanYear").text(value);
		}
		else {
			//colorData[key] = colorMap(parseFloat(value));
			var stateColor = d3.rgb(colorMap(parseFloat(value)));
			if(key in stateTones && stateTones[key].isOn)
				stateColor = stateColor.brighter();
			else
				stateColor = stateColor.darker();
			colorData[key] = stateColor.toString();
		}
	});
	map.updateChoropleth(colorData);
}

function updateAudio() {
	$.each(stateTones, function(key, value) {
		var freq = freqMap(parseFloat(gasData[curFrame][key]));
		value.sine.frequency.linearRampToValueAtTime(freq, audioContext.currentTime + 0.25);
	});
}

function onStateClick(geography) {
	toggleState(geography.id);
	updateColors();
}

function toggleState(stateId) {
	var wasOn = stateTones[stateId].isOn;
	stateTones[stateId].isOn = !wasOn;
	var targetAmp = wasOn ? 0 : 0.1;
	stateTones[stateId].gain.gain.setValueAtTime(0.1 - targetAmp, audioContext.currentTime);
	stateTones[stateId].gain.gain.linearRampToValueAtTime(targetAmp, audioContext.currentTime + 0.5);
}