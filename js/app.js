/*globals cartodb, Chart, mixpanel, L, moment: true */

$(function(){
  var permitsTemplate = _.template($('#template-permits').html());
  var permitTypesTemplate = _.template($('#template-permit-types').html());
  var nameCountTemplate = _.template($('#template-stats-list').html());

  var selectedLayer;

  var sql = new cartodb.SQL({ user: 'localdata' });

  var TABLE_NAME = 'permits_2014_nyc';

  var JOB_TYPES = {
    'A': 'PRE-FILING',
    'B': 'APPLICATION PROCESSED - PART-NO PAYMENT',
    'C': 'APPLICATION PROCESSED - PAYMENT ONLY',
    'D': 'APPLICATION PROCESSED - COMPLETED',
    'E': 'PROCESSED - NO PLAN EXAM',
    'F': 'APPLICATION ASSIGNED TO PLAN EXAMINER',
    'G': 'PAA FEE DUE',
    'H': 'PLAN EXAM - IN PROCESS',
    'I': 'SIGN-OFF (ARA)',
    'J': 'PLAN EXAM - DISAPPROVED',
    'K': 'PLAN EXAM - PARTIAL APPROVAL',
    'L': 'P/E PAA - PENDING FEE ESTIMATION',
    'M': 'P/E PAA - FEE RESOLVED',
    'P': 'PLAN EXAM - APPROVED',
    'Q': 'PERMIT ISSUED - PARTIAL JOB',
    'R': 'PERMIT ISSUED - ENTIRE JOB/WORK',
    'U': 'COMPLETED',
    'X': 'SIGNED-OFF',
    '3': 'SUSPENDED'
  };

  var PERMIT_TYPES = {
    'AL': 'Alteration',
    'FO': 'Foundation/earthwork',
    'DM': 'Demolition & removal',
    'EQ': 'Construction equipment ',
    'PL': 'Plumbing',
    'SG': 'Sign',
    'EW': 'Equipment work',
    'NB': 'New building'
  };

  var PERMIT_SUBTYPES = {
    'NB': 'New Building',
    'CH': 'Chute ',
    'FN': 'Fence ',
    'SH': 'Sidewalk shed',
    'SF': 'Scaffold',
    'OT': 'Other Construction Equipment',
    'BL': 'Boiler',
    'FA': 'Fire Alarm',
    'FB': 'Fuel Burning',
    'FP': 'Fire Suppression',
    'FS': 'Fuel Storage',
    'MH': 'Mechanical/HVAC',
    'OT': 'Other-General Construction, partitions, marquees, BPP (Builder Pavement Plan), etc.',
    'SD': 'Stand pipe',
    'SP': 'Sprinkler'
  };

  function prepPermits(permits) {
    var prepped = [];
    _.each(permits, function(permit) {
      // Dateize
      permit.job_start_date = moment(permit.job_start_date).format('ll');
      permit.expiration_date = moment(permit.expiration_date).format('ll');
      permit.issuance_date =  moment(permit.issuance_date).format('ll');

      // Change case
      var lowercase = [
        'street_name',
        'owner_s_first_last_name',
        'owner_s_business_name',
        'permittee_s_business_name',
        'permit_status',
        'filing_status'
      ];
      _.each(lowercase, function(field) {
        permit[field] = permit[field].toLowerCase();
      });

      prepped.push(permit);
    });
    return prepped;
  }

  // Set up the map --------------
  // Detroit: 42.42, -83.02
  var map = L.map('map').setView([40.744679,-73.948542], 12);

  var baseLayer = L.tileLayer('http://a.tiles.mapbox.com/v3/matth.map-yyr7jb6r/{z}/{x}/{y}.png');
  map.addLayer(baseLayer);


  function addCursorInteraction(layer) {
    var hovers = [];

    layer.bind('featureOver', function(e, latlon, pxPos, data, layer) {
      hovers[layer] = 1;
      if(_.any(hovers)) {
        $('#map').css('cursor', 'pointer');
      }
    });

    layer.bind('featureOut', function(m, layer) {
      hovers[layer] = 0;
      if(!_.any(hovers)) {
        $('#map').css('cursor', 'auto');
      }
    });
  }


  cartodb.createLayer(map, 'http://localdata.cartodb.com/api/v2/viz/fce8ff12-7011-11e4-92e6-0e4fddd5de28/viz.json')
    .addTo(map)
    .on('done', function(layer) {
      addCursorInteraction(layer);
    })
    .on('error', function(err) {
      console.log("some error occurred: " + err);
    });

  map.on('click', function(event) {
    console.log("Got click", event);

    var point = "'POINT(" + event.latlng.lng + ' ' + event.latlng.lat + ")'";

    var query = 'SELECT *, ST_AsGeoJSON(the_geom) as geojson from ' + TABLE_NAME + ' WHERE ST_Contains(the_geom, ST_SetSRID(ST_GeomFromText(' + point + '), 4326))';
    sql.execute(query)
      .done(function(data) {
        console.log("Got data", data);

        if(data.total_rows === 0) { return; }

        if(selectedLayer) {
          map.removeLayer(selectedLayer);
        }

        // Mark the building on the map
        var geojson = JSON.parse(data.rows[0].geojson);
        console.log("Got geojson", geojson);
        var myStyle = {
          color: "#fff",
          weight: 2,
          opacity: 1,
          fillColor: "#58aeff",
          fillOpacity: 1
        };
        var myLayer = L.geoJson(geojson, { style: myStyle}).addTo(map);
        selectedLayer = myLayer;

        // from http://stackoverflow.com/questions/11292649/javascript-color-animation
        var lerp = function(a, b, u) {
            return (1 - u) * a + u * b;
        };

        var fade = function(layer, start, end, duration) {
            var interval = 10;
            var steps = duration / interval;
            var step_u = 1.0 / steps;
            var u = 0.0;
            var theInterval = setInterval(function() {
                if (u >= 1.0) {
                    clearInterval(theInterval);
                }
                var r = Math.round(lerp(start.r, end.r, u));
                var g = Math.round(lerp(start.g, end.g, u));
                var b = Math.round(lerp(start.b, end.b, u));
                var colorname = 'rgb(' + r + ',' + g + ',' + b + ')';
                // el.style.setProperty(property, colorname);
                myStyle.color = colorname;
                myLayer.setStyle(myStyle);
                u += step_u;
            }, interval);
        };

        var startColor = {r: 255, g: 173, b: 0};  // yellow
        var endColor   = {r: 255, g: 255, b: 255};  // white
        fade(myLayer, startColor, endColor, 200);

        var rows = data.rows;

        // Display the data view
        var html = permitsTemplate({
          job_types: JOB_TYPES,
          permit_types: PERMIT_TYPES,
          permit_subtypes: PERMIT_SUBTYPES,
          permits: prepPermits(rows)
        });
        $('#cartodata').html(html);
      })
      .error(function(error) {
        console.error("Error", error);
      });
  });

  function makeBox(bounds) {
    // box2d ST_MakeBox2D(geometry pointLowLeft, geometry pointUpRight);
    var prefix = 'ST_SetSRID(ST_MakeBox2D(ST_Point(';
    var suffix = ')), 4326)';

    var ne = bounds.getNorthEast();
    var sw = bounds.getSouthWest();
    var query = prefix + sw.lng + ', ' + sw.lat + '), ST_Point(' + ne.lng + ', ' + ne.lat + suffix;

    return query;
    //SELECT * FROM {table_name} WHERE the_geom && ST_SetSRID(ST_MakeBox2D(ST_Point(-73.9980, 40.726), ST_Point(-73.995, 40.723)), 4326)
  }


  function dataTizePermitTypes(data, field, legends) {
    var labels = [];
    var counts = [];
    _.each(data.rows, function(row) {
      if (legends) {
        labels.push(legends[row[field]]);
      }else {
        labels.push(row[field]);
      }

      counts.push(row.count);
    });

    return {
      labels: labels,
      datasets: [{
        label: "Permit types",
        fillColor: "rgba(88,174,255,0.5)",
        strokeColor: "rgba(88,174,255,1)",
        highlightFill: "rgba(88,174,255,1)",
        highlightStroke: "rgba(88,174,255,1)",
        pointColor: "rgba(88,174,255,1)",
        pointStrokeColor: "#fff",

        data: counts
      }]
    };
  }


  // Get contractors in a bounds
  function getPermitteeBusiness() {

    var bounds = map.getBounds();
    var query = 'SELECT permittee_s_business_name, COUNT(cartodb_id) FROM ' + TABLE_NAME +  " WHERE the_geom && " + makeBox(bounds) + " group by permittee_s_business_name order by count DESC limit 5";

    sql.execute(query)
      .done(function(data) {
        console.log("Got permitee", data.rows);

        _.each(data.rows, function(row, i) {
          data.rows[i].name = row.permittee_s_business_name.toLowerCase();
        });

        // Get context with jQuery - using jQuery's .get() method.
        var html = nameCountTemplate({
          title: 'Top contractors',
          data: data.rows
        });
        $('#top-contractors').html(html);

      })
      .error(function(error) {
          console.log("Error", error);
      });
  }

  function getTypeStats() {
    mixpanel.track("App loaded");

    // Get stats within the map view
    var bounds = map.getBounds();
    // var query = 'SELECT count(*), max(job_start_date), min(job_start_date) FROM ' + TABLE_NAME +  ' WHERE the_geom && ' + makeBox(bounds);
    var query = 'SELECT permit_type, COUNT(cartodb_id) FROM ' + TABLE_NAME +  " WHERE the_geom && " + makeBox(bounds) + " group by permit_type order by count DESC limit 5";

    sql.execute(query)
      .done(function(data) {
        console.log("Got data", data.rows);
        $('.permit-types').html(permitTypesTemplate({
          legend: PERMIT_TYPES,
          types: data.rows
        }));

        // Get context with jQuery - using jQuery's .get() method.
        var ctx = $("#chart-permit-types").get(0).getContext("2d");
        var d = dataTizePermitTypes(data, 'permit_type', PERMIT_TYPES);
        var myBarChart = new Chart(ctx).Bar(d, {
          responsive: true
        });

      })
      .error(function(error) {
          console.log("Error", error);
      });
  }


  function getMonthCounts() {

    // Get stats within the map view
    var bounds = map.getBounds();
    // var query = 'SELECT count(*), max(job_start_date), min(job_start_date) FROM ' + TABLE_NAME +  ' WHERE the_geom && ' + makeBox(bounds);
    var query =   "select date_trunc('month', issuance_date) as mon, count(cartodb_id) as count from " + TABLE_NAME +  " WHERE the_geom && " + makeBox(bounds) + " group by 1 order by mon";

    console.log(query);
    sql.execute(query)
      .done(function(data) {
        console.log("Got month counts data", data.rows);

        _.each(data.rows, function(row, i) {
          data.rows[i].mon = moment(row.mon).format('MMM');
        });

        // Get context with jQuery - using jQuery's .get() method.
        var ctx = $("#chart-permit-dates").get(0).getContext("2d");
        var d = dataTizePermitTypes(data, 'mon');
        var myBarChart = new Chart(ctx).Line(d, {
          responsive: true,
          datasetFill : false
        });

      })
      .error(function(error) {
          console.log("Error", error);
      });
  }



  // Get permit type distribution
  //var types = 'SELECT permit_type, COUNT(cartodb_id) FROM ' + TABLE_NAME +  ' WHERE the_geom && ' + makeBox(bounds) + ' group by permit_type';

  mixpanel.track("App loaded");
  map.on('moveend', getTypeStats);
  map.on('moveend', getPermitteeBusiness);
  map.on('moveend', getMonthCounts);
  getTypeStats();
  getPermitteeBusiness();
  getMonthCounts();

});
