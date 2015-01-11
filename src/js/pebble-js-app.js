var weatherRequested = false;
var riverRequested = false;
var locationOptions = { "timeout": 15000, "maximumAge": 60000 }; 
var CONFIGURATION_URL  = 'http://paddlebike.github.io/riverwatch-config.html';
var heightParam = "00065";
var tempParam   = "00010";

var Global = {
  maxRetry:          3,
  retryWait:         500, // ms
  config: {
    debugEnabled:   false,
    batteryEnabled: true,
    riverTemp:      true,
    riverGauge:     '01646500',
    weatherScale:   'C',
    riverScale:     'CFS'
  },
};

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
    var gauge = parts[1];
    var param = parts[2];
    console.log('Gauge:' + gauge + ' Param:' + param);
    
    var gDate = new Date(valList[valEnd].dateTime);
    var sDate = (gDate.getMonth() + 1) + "/" + gDate.getDate() + " " + gDate.getHours() + ":" + gDate.getMinutes();

    var gaugeParam = {
      'dateTime': sDate,
      'value':valList[valEnd].value 
    };
    
   if (waterDB[gauge] === undefined){
     /* Gauge does not yet exist so add it and the param */
     var siteName = entry.sourceInfo.siteName;
     waterDB[gauge] = {name:siteName};
     waterDB[gauge][param] = gaugeParam;
     console.log("Added gauge to waterDB for " + waterDB[gauge].name);
    } else {
      /* Just add the Param */
      console.log("Just adding param to waterDB");
      waterDB[gauge][param] = gaugeParam;
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


function fetchYahooWeather(latitude, longitude){
  var subselect = 'SELECT woeid FROM geo.placefinder WHERE text="'+latitude+','+longitude+'" AND gflags="R"';
  var neighbor  = 'SELECT * FROM geo.placefinder WHERE text="'+latitude+','+longitude+'" AND gflags="R";';
  var query     = 'SELECT * FROM weather.forecast WHERE woeid IN ('+subselect+') AND u="c";';
  var multi     = "SELECT * FROM yql.query.multi WHERE queries='"+query+" "+neighbor+"'";
  var url       = "https://query.yahooapis.com/v1/public/yql?format=json&q="+encodeURIComponent(multi)+"&nocache="+new Date().getTime();
  console.log(url);
  getJson(url, function(err, response){
    try 
    {
      if (err) {
        throw err;
      }
      console.log("Got condition: " + JSON.stringify(response.query.results.results[0].channel.item.condition));
      var descr       =  response.query.results.results[0].channel.item.condition.text;
      var temperature =  response.query.results.results[0].channel.item.condition.temp;      
      var locale      = response.query.results.results[1].Result.neighborhood;
      if (locale === null) {
        locale = response.query.results.results[1].Result.city;
      }
      if (locale === null) {
        locale = 'unknown';
      }
      console.log(locale);
      console.log(temperature);
      console.log(descr);
      Pebble.sendAppMessage({"descr":descr,"temperature":temperature + "\u00B0C"});
    }
    catch (ex) {
      console.warn("Could not find Yahoo weather data in response: " + ex.message);
    }
    weatherRequested = false;
  });
  weatherRequested = true;
}

function fetchWater(gauge) {
  console.log("fetchWater called with gauge " + gauge);
  var nwis_url = 'http://waterservices.usgs.gov/nwis/iv/?period=P1D&format=json&parameterCd=00065,00010&sites=' + gauge;
  getJson(nwis_url, function(err, response){
   /* console.log("Got condition: " + JSON.stringify(response.value.timeSeries)); */

    try 
    {
      if (err) {
        throw err;
      }

      var waterDB = parseWaterData(response);
      var height = "UNK";
      var h2temp = "UNK";
      var sDate  = "UNK";
      
      var site_name = waterDB[gauge].name;
      console.log(site_name);
      
      if (waterDB[gauge][heightParam] !== undefined){
        height = waterDB[gauge][heightParam].value + 'ft';
        sDate = waterDB[gauge][heightParam].dateTime;
      }
      
      if (waterDB[gauge][tempParam] !== undefined){
        h2temp = waterDB[gauge][tempParam].value + '\u00B0C';
        if (sDate === "UNK"){
          sDate = waterDB[gauge][tempParam].dateTime;
        }
      }
 
      console.log("Last Height : " + height);
      console.log("Last upadted at " + sDate);
      console.log("Last Temp : " + h2temp);

      Pebble.sendAppMessage({"r_height":height , "r_temp":h2temp, "4":sDate});

    }
    catch (ex) {
      console.warn("Could not find USGS data in response: " + ex.message);
    }

    riverRequested = false;
  });
  riverRequested = true;
  console.log("River Request Completed\n\n");
}

function locationSuccess(pos) {
  var coordinates = pos.coords;
  console.log("Got coordinates: " + JSON.stringify(coordinates));
  fetchYahooWeather(coordinates.latitude, coordinates.longitude);
}

function locationError(err) {
  console.warn('location error (' + err.code + '): ' + err.message);
  Pebble.sendAppMessage({
    "wCity":"Loc Unavailable",
    "temperature":"N/A"
  });
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
  fetchWater('01646500');
  
  if (weatherRequested === true){
      setTimeout(function () {
          console.log("do_update weather timeout completed");
          do_update();
      }, 5000);
  }
  fetchWeather();
}

Pebble.addEventListener("ready", function(e) {
  console.log("Event ready - START!");
  console.log(e.type);
  if (riverRequested !== true){
    fetchWater(Global.config.riverGauge);
  }
  
  if (weatherRequested !== true){
    fetchWeather();
  }
});

Pebble.addEventListener("appmessage", function(e) {
  console.log("Event appmessage - START!");
  console.log(e.type);
  do_update();
  console.log("EVent appmessage - DONE!");
});


/**
 * This is the reason for the Global.config variable - I couldn't think of a way (short of asking Pebble)
 * for the latest config settings. So I persist them in a rather ugly Global variable. 
 */
Pebble.addEventListener("showConfiguration", function (e) {
    var options = {
      'u': Global.config.weatherScale,
      'r': Global.config.riverScale,
      'b': Global.config.batteryEnabled ? 'on' : 'off',
      'd': Global.config.debugEnabled  ?  'on' : 'off',
      'g': Global.config.riverGauge
    };
    var url = CONFIGURATION_URL+'?'+encodeURIComponent(JSON.stringify(options));
    console.log('Configuration requested using url: '+url);
    Pebble.openURL(url);
});


Pebble.addEventListener("webviewclosed", function(e) {
  console.log("Event webview closed- START");
  console.log(e.type);
  console.log(e.response);
  // webview closed
  //Using primitive JSON validity and non-empty check
  if (e.response.charAt(0) == "{" && e.response.slice(-1) == "}" && e.response.length > 5) {
    var options = JSON.parse(decodeURIComponent(e.response));
    console.log("Options = " + JSON.stringify(options));
    Global.config.riverGauge     = options.gauge;
    Global.config.riverTemp      = options.temp    === 'true';
    Global.config.weatherScale   = options.scale   === 'C' ? 'C' : 'F';
    Global.config.debugEnabled   = options.debug   === 'true';
    Global.config.batteryEnabled = options.battery === 'on';
    console.log("Configuration complete for " + Global.connfig);
  } else {
    console.log("Cancelled");
  }
});
