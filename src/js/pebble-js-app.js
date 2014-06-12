
//var gauges = {};
function fetchLFWeather() {
  // 9074a4be3ea0765aaa0f1a4873e80c99
  console.log("fetchLFWeather - Called ");
  var response;
  var req = new XMLHttpRequest();
  req.open('GET', "http://api.openweathermap.org/data/2.5/forecast?id=4369976&cnt=1&APPID=9074a4be3ea0765aaa0f1a4873e80c99", true);
  req.onload = function(e) {
    if (req.readyState == 4) {
      if(req.status == 200) {
        //console.log(req.responseText);
        response = JSON.parse(req.responseText);
        var temperature, descr, city;
        if (response && response.list && response.list.length > 0) {
          var weatherResult = response.list[0];
          temperature = Math.round(weatherResult.main.temp - 273.15);
          descr = weatherResult.weather[0].main;
          console.log(temperature);
          console.log(descr);
          console.log(city);
          Pebble.sendAppMessage({
            "descr":descr,
            "temperature":temperature + "\u00B0C"
          });
        }

      } else {
        console.log("fetchLFWeather - Status: " + req.status + " State: " + req.readyState);
      }
    }
  }
  req.send(null);
}

function fetchWeather(latitude, longitude) {
  console.log("fetchWeather - Called lat: " + latitude + " lon: " + longitude );
  var response;
  var req = new XMLHttpRequest();
  req.open('GET', "http://api.openweathermap.org/data/2.1/find/city?" +
    "lat=" + latitude + "&lon=" + longitude + "&cnt=1", true);
  req.onload = function(e) {
    if (req.readyState == 4) {
      if(req.status == 200) {
        //console.log(req.responseText);
        response = JSON.parse(req.responseText);
        var temperature, descr, city;
        if (response && response.list && response.list.length > 0) {
          var weatherResult = response.list[0];
          temperature = Math.round(weatherResult.main.temp - 273.15);
          descr = weatherResult.weather[0].main;
          city = weatherResult.name;
          console.log(temperature);
          console.log(descr);
          console.log(city);
          Pebble.sendAppMessage({
            "0":descr,
            "1":temperature + "\u00B0C"
          });
        }

      } else {
        console.log("fetchWeather - Status: " + req.status + " State: " + req.readyState);
      }
    }
  }
  req.send(null);
}

function processUSGSdata(responseText){
  console.log('processUSGSdata');
  var db = JSON.parse(responseText);
  var ts = db.value.timeSeries;
  var gauges = new Object();
  console.log('Gauge count = ' + ts.length);
  for (var i = 0;i < ts.length; i++){
      item = ts[i];

      //Get some basic data about the gauge.
      siteCode = item.sourceInfo.siteCode[0].value;
      site_name = item.sourceInfo.siteName;

      console.log(site_name);

      type_num = item.variable.variableCode[0].value.toString();
      desc     = item.variable.variableDescription;
      name     = item.variable.unit.unitAbbreviation;
      valList  = item.values[0].value;
      value    = valList[valList.length -1].value;
      time     = valList[valList.length -1].dateTime;
      prevVal  = valList[valList.length -2].value;

      gauges.siteCode = {'name':name, 'reading':type_num = {'description':desc, 'time':time, 'value':value, 'prevVal':prevVal}};
      console.log(gauges.siteCode.name);
      console.log(time);
      console.log(gauges.siteCode.name.reading.type_num.description);

    }
    return gauges;
}


function fetchWater(gauge) {
  var response;
  var req = new XMLHttpRequest();
  console.log("fetchWater called with gauge " + gauge);
  var nwis_url = 'http://waterservices.usgs.gov/nwis/iv/?period=P1D&format=json&modifiedSince=PT30M&parameterCd=00065,00010&sites=' + gauge;
  req.open('GET', nwis_url, true);
  console.log("fetchWater request made ");
  req.onload = function(e) {
    console.log("fetchWater req.onload CALLED");
    if (req.readyState == 4 && req.status == 200) {
        response = JSON.parse(req.responseText);
        site_name = response.value.timeSeries[0].sourceInfo.siteName;
        //var tList  = 
        console.log(site_name);
        var hList = response.value.timeSeries[1].values[0].value;
        var height = hList[hList.length -1].value + 'ft';

        var tList = response.value.timeSeries[0].values[0].value;
        var h2temp = tList[tList.length -1].value + '\u00B0C';
        var gDate = new Date(tList[tList.length -1].dateTime);
        //var sDate = gDate.toLocaleString();
        var sDate = (gDate.getMonth() + 1) + "/" + gDate.getDate() + " " + gDate.getHours() + ":" + gDate.getMinutes();

        console.log(height);
        console.log(h2temp);
        console.log("Last upadted at " + sDate)
        Pebble.sendAppMessage({"2":height , "3":h2temp, "4":sDate});
    } else {
      console.log("Error");
    }
  }
  req.send(null);
}

function locationSuccess(pos) {
  var coordinates = pos.coords;
  console.log("locationSuccess!");
  fetchWeather(coordinates.latitude, coordinates.longitude);
}

function locationError(err) {
  console.warn('location error (' + err.code + '): ' + err.message);
  Pebble.sendAppMessage({
    "wCity":"Loc Unavailable",
    "temperature":"N/A"
  });
}

var locationOptions = { "timeout": 15000, "maximumAge": 60000 }; 


Pebble.addEventListener("ready", function(e) {
  console.log("connect!" + e.ready);
  //locationWatcher = window.navigator.geolocation.watchPosition(locationSuccess, locationError, locationOptions);
  console.log(e.type);
});

Pebble.addEventListener("appmessage", function(e) {
  console.log("appmessage - START!");
  fetchLFWeather();
  //fetchWeather('38.94977778','-77.12763889');
  fetchWater('01646500');
  //window.navigator.geolocation.getCurrentPosition(locationSuccess, locationError, locationOptions);
  console.log(e.type);
  console.log(e.payload.temperature);
  console.log("appmessage - DONE!");
});

Pebble.addEventListener("webviewclosed", function(e) {
  console.log("webview closed");
  console.log(e.type);
  console.log(e.response);
});


