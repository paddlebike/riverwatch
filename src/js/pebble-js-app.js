


function fetchWeather(latitude, longitude) {
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
            "wCity":city, 
            "descr":descr,
            "temperature":temperature + "\u00B0C"
          });
        }

      } else {
        console.log("Error");
      }
    }
  }
  req.send(null);
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
        // console.log('Got response ' + req.responseText);
        response = JSON.parse(req.responseText);
        site_name = response.value.timeSeries[0].sourceInfo.siteName;
        console.log(site_name)
        var hList = response.value.timeSeries[1].values[0].value;
        var height = hList[hList.length -1].value;

        var tList = response.value.timeSeries[0].values[0].value;
        var h2temp = tList[tList.length -1].value;
        console.log(height);
        console.log(h2temp);
        var combo = height + 'ft ' + h2temp + '\u00B0C';
        console.log(combo);
        Pebble.sendAppMessage({"gauge":"Little Falls" ,"flow":combo});
    } else {
      console.log("Error");
    }
  }
  req.send(null);
}

function locationSuccess(pos) {
  var coordinates = pos.coords;
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
  locationWatcher = window.navigator.geolocation.watchPosition(locationSuccess, locationError, locationOptions);
  console.log(e.type);
});

Pebble.addEventListener("appmessage", function(e) {
  fetchWater('01646500');
  window.navigator.geolocation.getCurrentPosition(locationSuccess, locationError, locationOptions);
  console.log(e.type);
  console.log(e.payload.temperature);
  console.log("message!");
});

Pebble.addEventListener("webviewclosed", function(e) {
  console.log("webview closed");
  console.log(e.type);
  console.log(e.response);
});


