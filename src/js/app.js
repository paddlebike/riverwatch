var weatherRequested = false;
var riverRequested = false;
var locationOptions = { "timeout": 15000, "maximumAge": 60000 }; 
var CONFIGURATION_URL  = 'http://paddlebike.github.io/riverwatch-config.html';
var heightParam = "00065";
var dischargeParam = "00060";
var tempParam   = "00010";
var playLow = -1;
var playOK = 0;
var playHigh = 1;

var Global = {
  maxRetry:   3,
  retryWait:  500, // ms
  config: {
    debugEnabled:   false,
    batteryEnabled: true,
    gaugeID:       '01646500',
    tempScale:     'C',
    riverScale:    'FT',
    playMinCFS:    6500,
    playMaxCFS:    20000,
  },
  cache: {
    temp:          999,
    condition:     'UNK',
    height:        'UNK',
    discharge:     'UNK',
    h2temp:        999,
    play:          0,
    sDate:         'UNK'
  }
};

function saveConfiguration(){
  var configStr = JSON.stringify(Global.config);
  console.log('saveConfiguration - configuration: ' + configStr);
  localStorage.setItem('mainConfig', configStr);
}

function loadConfiguration(){
  var configStr = localStorage.getItem('mainConfig');
  console.log('loadConfiguration - configuration: ' + configStr);
  if (configStr !== null) {
    console.log('we have a config!');
    Global.config = JSON.parse(configStr);
  }
}

function loadWaterData(){
  var cacheStr = localStorage.getItem('waterCache');
  console.log('loadWaterData - waterData: ' + cacheStr);
  if (cacheStr !== null) {
    console.log('we have a cache!');
    Global.cache = JSON.parse(cacheStr);
    sendCache();
  }
}

function saveWaterData(){
  var cacheStr = JSON.stringify(Global.cache);
  console.log('saveWaterData - cache: ' + cacheStr);
  localStorage.setItem('waterCache', cacheStr);
}


function sendCache(){

  var fahrenheit = 0;
  if (Global.config.tempScale == 'F') {
    fahrenheit = 1;
    console.log("Temp scale      : Fahrenheit");
  } else {
    console.log("Temp scale      : Centegrade");
  }
  console.log("Last Height     : " + Global.cache.height);
  console.log("Last Discharge  : " + Global.cache.discharge);
  console.log("Last updated at : " + Global.cache.sDate);
  console.log("Last Water Temp : " + Global.cache.h2temp);
  console.log("InPlay          : " + Global.cache.play);
  console.log("Temp            : " + Global.cache.temp);
  console.log("Conditions      : " + Global.cache.condition);
  
  var flow = Global.cache.height;
  if (Global.config.riverScale == 'CFS')
    flow = Global.cache.discharge;
 
  // Require the keys' numeric values.
  var keys = require('message_keys');
  console.log('keys: ' + JSON.stringify(keys));
  
  var dict = {};
  dict[keys.fahrenheit]  = fahrenheit;
  dict[keys.descr]       = Global.cache.condition;
  dict[keys.temperature] = Global.cache.temp;
  dict[keys.r_height]    = flow;
  dict[keys.r_temp]      = Global.cache.h2temp;
  dict[keys.gaugeTime]   = Global.cache.sDate;
  dict[keys.play]        = Global.cache.play;

  Pebble.sendAppMessage(dict, function() {
  console.log('Message sent successfully: ' + JSON.stringify(dict));
              }, function(e) {
                console.log('Message failed: ' + JSON.stringify(e));
              });
}

function getJson(url, callback) {
  try {
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.onload = function(e) {
      if (req.readyState == 4) {
        console.log('Got status ' + req.status);
        if(req.status == 200) {
          try {
            console.log(req.responseText);
            var response = JSON.parse(req.responseText);
            callback(null, response);
          } catch (ex) {
            callback(ex.message);
          }
        } else {
          callback("Error request status not 200, status: "+req.status);
        }
      }
    };
    req.send(null);
  } catch(ex) {
    callback("Unable to GET JSON: "+ex.message);
  }
}

function parseWaterData(waterdata){
  var waterDB = {};
  var ts = waterdata.value.timeSeries;
  for(var i = 0; i < ts.length; i++){
    var entry = ts[i];
    var valList = entry.values[0].value;
    var valEnd = valList.length - 1;
    var parts = entry.name.split(":");
    var gaugeID = parts[1];
    var param = parts[2];
    console.log('Gauge:' + gaugeID + ' Param:' + param);
    
    var gDate = new Date(valList[valEnd].dateTime);
    var sDate = (gDate.getMonth() + 1) + "/" + gDate.getDate() + " " + gDate.getHours() + ":" + gDate.getMinutes();

    var gaugeParam = {
      'dateTime': sDate,
      'value':valList[valEnd].value 
    };
    
   if (waterDB[gaugeID] === undefined){
     /* Gauge does not yet exist so add it and the param */
     var siteName = entry.sourceInfo.siteName;
     waterDB[gaugeID] = {name:siteName};
     waterDB[gaugeID][param] = gaugeParam;
     console.log("Added gauge to waterDB for " + waterDB[gaugeID]);
    } else {
      /* Just add the Param */
      console.log("Just adding param to waterDB");
      waterDB[gaugeID][param] = gaugeParam;
    }
/*    
    console.log("WaterDB:");
    console.log(JSON.stringify(waterDB) + "\n\n");
    console.log(' Value:' + waterDB[gauge][param].value);
    console.log(' Date:'  + waterDB[gauge][param].dateTime); 
*/
  }
  return(waterDB);
}

function fetchWater() {
  var gaugeID = Global.config.gaugeID; //'01646500';
  console.log("fetchWater called with gaugeID " + gaugeID);
  var nwis_url = 'http://waterservices.usgs.gov/nwis/iv/?period=P1D&format=json&parameterCd=00065,00060,00010&sites=' + gaugeID;
  getJson(nwis_url, function(err, response){
   /* console.log("Got condition: " + JSON.stringify(response.value.timeSeries)); */

    try 
    {
      if (err) {
        console.warn("Error in response: " + err);
        throw err;
      }

      var waterDB = parseWaterData(response);

      var site_name = waterDB[gaugeID].name;
      console.log(site_name);
      
      if (Global.cache.sDate != waterDB[gaugeID][heightParam].dateTime){
        
        console.log('We have an updated value');
        
        if (waterDB[gaugeID][heightParam] !== undefined){
          Global.cache.height = waterDB[gaugeID][heightParam].value + 'ft';
          Global.cache.sDate = waterDB[gaugeID][heightParam].dateTime;
        }
        
        if (waterDB[gaugeID][dischargeParam] !== undefined){
          Global.cache.discharge = waterDB[gaugeID][dischargeParam].value;
          Global.cache.sDate = waterDB[gaugeID][dischargeParam].dateTime;
          var discharge = parseInt(Global.cache.discharge);
          console.log('Comparing discarge of ' + discharge  + ' with min ' + Global.config.playMinCFS + ' and max ' + Global.config.playMaxCFS);
          Global.cache.play = playLow;
          if (discharge > Global.config.playMinCFS)
            Global.cache.play = playOK;
          if (discharge > Global.config.playMaxCFS)
            Global.cache.play = playHigh;
        }
        
        if (waterDB[gaugeID][tempParam] !== undefined){
          Global.cache.h2temp = parseInt(waterDB[gaugeID][tempParam].value);
        }
  
        
        if (Global.cache.play == playOK) {
          console.log('We are in Play');
          var title = 'Guage Update'; // waterDB[gaugeID].name;
          var text = 'Time   : ' + waterDB[gaugeID][tempParam].dateTime   + '\n' +
                     'Height : ' + waterDB[gaugeID][heightParam].value    + '\n'  +
                     'Dscg   : ' + waterDB[gaugeID][dischargeParam].value + '\n';
          if (waterDB[gaugeID][tempParam] !== undefined){
            text = text + 'Temp   : ' + waterDB[gaugeID][tempParam].value + '\n';
          }
          // Show the notification
          console.log('sending the notification');
          Pebble.showSimpleNotificationOnPebble(title, text);
        } else {
          console.log('we are not in play.  No notification');
        }
        
        saveWaterData();
        sendCache();      
      } else {
        console.log('Update is old');
      }
    }
    catch (ex) {
      console.warn("Could not find USGS data in response: " + ex.message);
    }

    riverRequested = false;
  });
  riverRequested = true;
  console.log("River Request Completed");
}

function fetchOWMWeather(latitude, longitude){
  
  var url = 'http://api.openweathermap.org/data/2.5/weather?lat=' +
      latitude + '&lon=' + longitude + '&appid=9074a4be3ea0765aaa0f1a4873e80c99';
  console.log('owm-weather: Location success. Contacting OpenWeatherMap.org...');
  console.log(url);

  getJson(url, function(err, response){
    try 
    {
      if (err) {
        throw err;
      }
      console.log("Got condition: " + JSON.stringify(response.weather[0]));
      Global.cache.condition =  response.weather[0].description;
      Global.cache.temp =  parseInt(response.main.temp) - 273;      
      var locale      = response.name;
      if (locale === null) {
        locale = response.name;
      }
      if (locale === null) {
        locale = 'unknown';
      }
      console.log(locale);
      console.log(Global.cache.temp);
      console.log(Global.cache.condition);
      sendCache();
      
    }
    catch (ex) {
      console.warn("Could not find Open Weather Map weather data in response: " + ex.message);
    }
    weatherRequested = false;
  });
  weatherRequested = true;
}


function locationSuccess(pos) {
  var coordinates = pos.coords;
  console.log("Got coordinates: " + JSON.stringify(coordinates));
  fetchOWMWeather(coordinates.latitude, coordinates.longitude);
}

function locationError(err) {
  console.warn('location error (' + err.code + '): ' + err.message);
  Pebble.sendAppMessage({"temperature":"N/A"});
}

function fetchWeather(){
  navigator.geolocation.getCurrentPosition(locationSuccess, locationError, locationOptions);
}

function do_update(){
  if (riverRequested === true){
      setTimeout(function () {
          console.log("do_update river timeout completed");
          do_update();
      }, 5000);
  }
  fetchWater();
  
  if (weatherRequested === true){
      setTimeout(function () {
          console.log("do_update weather timeout completed");
          do_update();
      }, 5000);
  }
  fetchWeather();
  
}

function startup(){
  console.log("startup - START!");
  loadConfiguration();
  loadWaterData();
  
    if (weatherRequested !== true){
    fetchWeather();
  }
  
  if (riverRequested !== true){
    fetchWater();
  }
  
}


Pebble.addEventListener("ready", function(e) {
  console.log("Event ready - START!");
  console.log(e.type);
  startup();
});

Pebble.addEventListener("appmessage", function(e) {
  console.log("Event appmessage - START!");
  console.log('appmessage: ' + JSON.stringify(e.payload));
  do_update();
  console.log("Event appmessage - DONE!");
});


/**
 * This is the reason for the Global.config variable - I couldn't think of a way (short of asking Pebble)
 * for the latest config settings. So I persist them in a rather ugly Global variable. 
 */
Pebble.addEventListener("showConfiguration", function (e) {
    var options = {
      'tempScale'     : Global.config.tempScale,
      'riverScale'    : Global.config.riverScale,
      'batteryEnabled': Global.config.batteryEnabled ? 'on' : 'off',
      'debugEnabled'  : Global.config.debugEnabled  ?  'on' : 'off',
      'gaugeID'       : Global.config.gaugeID,
      'playMinCFS'    : Global.config.playMinCFS,
      'playMaxCFS'    : Global.config.playMaxCFS
    };
    var url = CONFIGURATION_URL+'?'+encodeURIComponent(JSON.stringify(options));
    console.log('Configuration requested using url: '+url);
    Pebble.openURL(url);
});


Pebble.addEventListener("webviewclosed", function(e) {
  console.log("Event webview closed- START");
  console.log(e.type);
  //console.log(e.response);
  // webview closed
  //Using primitive JSON validity and non-empty check
  // {"text-gaugeID":"016567400","batteryEnabled":"on","debugEnabled":"on","radioF":true,"radioC":false,"radioFT":true,"radioCFS":false}
  if (e.response.charAt(0) == "{" && e.response.slice(-1) == "}" && e.response.length > 5) {
    var options = JSON.parse(decodeURIComponent(e.response));
    console.log("Options = " + JSON.stringify(options));
    Global.config.gaugeID        = options.gaugeID;
    Global.config.playMinCFS     = parseInt(options.playMinCFS);
    Global.config.playMaxCFS     = parseInt(options.playMaxCFS);
    Global.config.riverScale     = options.radioCFS ? 'CFS' : 'FT';
    Global.config.tempScale      = options.radioC   ? 'C' : 'F';

    Global.config.debugEnabled   = true; //options.debugEnabled   === 'true';
    Global.config.batteryEnabled = false; //options.batteryEnabled === 'on';

    console.log("Configuration complete for " + Global.config);
    saveConfiguration();
    //do_update();
  } else {
    console.log("Cancelled");
  }
});
